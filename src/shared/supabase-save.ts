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

  const { data, error } = await supabase.rpc('save_tab_group', {
    p_title: input.title.trim() || buildDefaultGroupTitle(input.deviceId, input.tabs.length),
    p_device_id: input.deviceId,
    p_group_id: input.groupId || null,
    p_tabs: input.tabs.map((tab) => ({ url: tab.url!, title: tab.title ?? '' }))
  });
  if (error) throw error;
  const result = data as { group: Omit<TabGroup, 'tabs'> | null; count: number } | null;
  if (!result || !Number.isInteger(result.count) || result.count < 0 || result.count > input.tabs.length
    || (result.count > 0 && !result.group?.id) || (input.groupId && result.group?.id !== input.groupId)) {
    throw new Error('保存件数を確認できませんでした。再読み込みして確認してください。');
  }
  return { group: result.group, count: result.count, duplicateCount: input.tabs.length - result.count };
}
