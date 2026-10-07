import { getSupabase, getCurrentUser } from './supabase-client';
import { getConfig } from './storage';
import { isSavableTabUrl } from './tabs';
import type { TabGroup } from './types';

export interface ImportableTabInput {
  url: string;
  title?: string;
}

type TabLike = {
  url?: string | null;
  title?: string | null;
  pinned?: boolean;
};

function safeHostName(url: string): string {
  try {
    return new URL(url).hostname.toLocaleLowerCase();
  } catch {
    return '';
  }
}

function shouldIgnoreTab(
  tab: TabLike,
  ignoreDomains: string[],
  ignoreTitles: string[]
): boolean {
  const url = (tab.url ?? '').toLowerCase();
  const title = (tab.title ?? '').toLocaleLowerCase();
  const hostname = safeHostName(url);

  const matchedDomain = ignoreDomains.some((rule) => {
    const normalized = rule.trim().toLocaleLowerCase();
    if (!normalized) return false;
    return hostname.includes(normalized) || url.includes(normalized);
  });

  if (matchedDomain) return true;

  const matchedTitle = ignoreTitles.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (!normalized) return false;
    return title.includes(normalized);
  });

  return matchedTitle;
}

export async function filterSavableTabs(tabs: chrome.tabs.Tab[]): Promise<chrome.tabs.Tab[]> {
  const config = await getConfig();

  return tabs
    .filter((tab) => isSavableTabUrl(tab.url))
    .filter((tab) => !tab.pinned)
    .filter((tab) => !shouldIgnoreTab(tab, config.ignoreDomains, config.ignoreTitles));
}

export async function filterSavableImportedTabs(tabs: ImportableTabInput[]): Promise<ImportableTabInput[]> {
  const config = await getConfig();

  return tabs
    .filter((tab) => isSavableTabUrl(tab.url))
    .filter((tab) => !shouldIgnoreTab(tab, config.ignoreDomains, config.ignoreTitles));
}

function normalizeTabInputs(tabs: chrome.tabs.Tab[]): Promise<chrome.tabs.Tab[]>;
function normalizeTabInputs(tabs: ImportableTabInput[]): Promise<ImportableTabInput[]>;
function normalizeTabInputs(tabs: chrome.tabs.Tab[] | ImportableTabInput[]) {
  if (tabs.length === 0) {
    return Promise.resolve([]);
  }

  return 'pinned' in tabs[0]!
    ? filterSavableTabs(tabs as chrome.tabs.Tab[])
    : filterSavableImportedTabs(tabs as ImportableTabInput[]);
}

function normalizeUrl(raw: string): string {
  return raw.trim().split('#')[0]!.replace(/^([a-z][a-z\d+.-]*:\/\/)([^/?#]+)/i,
    (_match, scheme: string, host: string) => `${scheme.toLowerCase()}${host.toLowerCase()}`);
}

export function buildDefaultGroupTitle(deviceId: string, tabCount: number): string {
  const deviceLabel = deviceId.split('·')[0]?.trim() || deviceId;
  const timestamp = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
  const tabLabel = tabCount === 1 ? '1 tab' : `${tabCount} tabs`;

  return `${deviceLabel} · ${timestamp} · ${tabLabel}`;
}

export async function saveTabGroup(input: {
  title: string;
  groupId?: string;
  deviceId: string;
  tabs: chrome.tabs.Tab[];
}) {
  return persistTabGroup({
    title: input.title,
    groupId: input.groupId,
    deviceId: input.deviceId,
    tabs: await normalizeTabInputs(input.tabs)
  });
}

export async function saveImportedTabGroup(input: {
  title: string;
  groupId?: string;
  deviceId: string;
  tabs: ImportableTabInput[];
}) {
  return persistTabGroup({
    title: input.title,
    groupId: input.groupId,
    deviceId: input.deviceId,
    tabs: await normalizeTabInputs(input.tabs)
  });
}

async function persistTabGroup(input: {
  title: string;
  groupId?: string;
  deviceId: string;
  tabs: Array<chrome.tabs.Tab | ImportableTabInput>;
}) {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error('ログインしてください。');

  if (input.tabs.length === 0) {
    throw new Error('保存対象のタブがありません。');
  }

  const seen = new Set<string>();
  let uniqueTabs = input.tabs.filter((tab) => {
    const normalized = normalizeUrl(tab.url ?? '');
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  let duplicateCount = input.tabs.length - uniqueTabs.length;

  const { data: savedTabs, error: savedTabsError } = await supabase.from('tabs')
    .select('url_key')
    .eq('user_id', user.id);
  if (savedTabsError) throw savedTabsError;
  seen.clear();
  for (const tab of savedTabs ?? []) seen.add(tab.url_key);
  uniqueTabs = uniqueTabs.filter((tab) => {
    const url = normalizeUrl(tab.url ?? '');
    if (seen.has(url)) {
      duplicateCount += 1;
      return false;
    }
    seen.add(url);
    return true;
  });
  if (uniqueTabs.length === 0 && !input.groupId) {
    return { group: null, count: 0, duplicateCount };
  }

  let group: Omit<TabGroup, 'tabs'>;
  let nextPosition = 0;
  if (input.groupId) {
    const { data, error } = await supabase
      .from('tab_groups')
      .select('id, title, created_at, is_fixed, device_id, tabs(position)')
      .eq('id', input.groupId)
      .eq('user_id', user.id)
      .single();
    if (error) throw error;
    if (!data) throw new Error('保存先のグループが見つかりません。');
    group = data;
    // ponytail: concurrent saves may share positions; use a DB lock if strict ordering is needed.
    nextPosition = data.tabs.reduce((next, tab) => Math.max(next, tab.position + 1), 0);
  } else {
    const title = input.title.trim() || buildDefaultGroupTitle(input.deviceId, uniqueTabs.length);
    const { data, error } = await supabase
      .from('tab_groups')
      .insert({ user_id: user.id, device_id: input.deviceId, title })
      .select('id, title, created_at, is_fixed, device_id')
      .single();
    if (error) throw error;
    group = data;
  }

  const rows = uniqueTabs.map((tab, index) => ({
    group_id: group.id,
    user_id: user.id,
    url: tab.url!,
    url_key: normalizeUrl(tab.url!),
    title: tab.title ?? '',
    position: nextPosition + index
  }));

  let savedCount = 0;
  if (rows.length > 0) {
    // The precheck can miss rows due to API limits or concurrent saves.
    const { error: tabsError, count } = await supabase.from('tabs').upsert(rows, {
      onConflict: 'user_id,url_key',
      ignoreDuplicates: true,
      count: 'exact'
    });
    if (tabsError) throw tabsError;
    if (count === null) throw new Error('保存件数を確認できませんでした。再読み込みして確認してください。');
    savedCount = count;
    duplicateCount += rows.length - savedCount;
  }

  if (savedCount === 0 && !input.groupId) {
    const { error } = await supabase.from('tab_groups').delete().eq('id', group.id).eq('user_id', user.id);
    if (error) throw error;
    return { group: null, count: 0, duplicateCount };
  }

  return { group, count: savedCount, duplicateCount };
}
