import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './storage';
import { storageLocalGet, storageLocalRemove, storageLocalSet } from './browser-api';
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

function createExtensionStorageAdapter() {
  return {
    getItem: async (key: string): Promise<string | null> => {
      const result = await storageLocalGet(key);
      return (result as Record<string, string | null>)[key] ?? null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
      await storageLocalSet({ [key]: value });
    },
    removeItem: async (key: string): Promise<void> => {
      await storageLocalRemove(key);
    }
  };
}

let cached: { cacheKey: string; client: SupabaseClient } | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseKey } = await getConfig();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 設定が未入力です。');
  }

  const cacheKey = `${supabaseUrl}::${supabaseKey}`;
  if (cached?.cacheKey === cacheKey) return cached.client;

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: createExtensionStorageAdapter(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  cached = { cacheKey, client };
  return client;
}

export async function signUp(email: string, password: string) {
  const supabase = await getSupabase();
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  const supabase = await getSupabase();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = await getSupabase();
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentSessionUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function getFavoriteGroupIds(userId?: string): Promise<string[]> {
  const supabase = await getSupabase();
  const resolvedUserId = userId ?? (await getCurrentSessionUser())?.id;
  if (!resolvedUserId) throw new Error('ログインしてください。');

  const key = 'favorite_group_ids';
  const stored = await storageLocalGet(key);
  const legacyIds = (stored as Record<string, string[] | undefined>)[key] ?? [];
  if (legacyIds.length > 0) {
    // NULL marks legacy groups: never overwrite a favorite already changed on another device.
    const { error } = await supabase.from('tab_groups')
      .update({ is_favorite: true })
      .eq('user_id', resolvedUserId)
      .in('id', legacyIds)
      .is('is_favorite', null);
    if (error) throw error;
  }

  const { data, error } = await supabase.from('tab_groups')
    .select('id, is_favorite')
    .eq('user_id', resolvedUserId);
  if (error) throw error;
  const groups = data ?? [];
  if (legacyIds.length > 0) {
    const ownedIds = new Set(groups.map((group) => group.id));
    await storageLocalSet({ [key]: legacyIds.filter((id) => !ownedIds.has(id)) });
  }
  return groups.filter((group) => group.is_favorite === true).map((group) => group.id);
}

export async function setGroupFavorite(groupId: string, favorite: boolean): Promise<void> {
  const supabase = await getSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error('ログインしてください。');
  const { error } = await supabase.from('tab_groups')
    .update({ is_favorite: favorite })
    .eq('id', groupId)
    .eq('user_id', user.id)
    .select('id')
    .single();
  if (error) throw error;
}

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

  return 'pinned' in tabs[0]
    ? filterSavableTabs(tabs as chrome.tabs.Tab[])
    : filterSavableImportedTabs(tabs as ImportableTabInput[]);
}

function normalizeUrl(raw: string): string {
  return raw.trim().split('#')[0].replace(/^([a-z][a-z\d+.-]*:\/\/)([^/?#]+)/i,
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

  if (rows.length > 0) {
    const { error: tabsError } = await supabase.from('tabs').insert(rows);
    if (tabsError) throw tabsError;
  }

  return { group, count: rows.length, duplicateCount };
}

const GROUP_COLUMNS = 'id, title, created_at, is_fixed, device_id, tabs(id, url, title, position)';

function orderedGroup(group: TabGroup): TabGroup {
  return { ...group, tabs: [...group.tabs].sort((a, b) => a.position - b.position) };
}

export async function listGroups(userId?: string): Promise<TabGroup[]> {
  const supabase = await getSupabase();
  const resolvedUserId = userId ?? (await getCurrentSessionUser())?.id;
  if (!resolvedUserId) throw new Error('ログインしてください。');
  const { data, error } = await supabase.from('tab_groups').select(GROUP_COLUMNS)
    .eq('user_id', resolvedUserId).order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TabGroup[]).map(orderedGroup);
}

export async function getGroup(groupId: string): Promise<TabGroup | null> {
  const supabase = await getSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error('ログインしてください。');
  const { data, error } = await supabase.from('tab_groups').select(GROUP_COLUMNS)
    .eq('user_id', user.id).eq('id', groupId).maybeSingle();
  if (error) throw error;
  return data ? orderedGroup(data as TabGroup) : null;
}

export async function setGroupFixed(groupId: string, fixed: boolean): Promise<void> {
  const supabase = await getSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error('ログインしてください。');
  const { error } = await supabase.from('tab_groups').update({ is_fixed: fixed })
    .eq('id', groupId).eq('user_id', user.id).select('id').single();
  if (error) throw error;
}

export async function consumeRestoredTabs(groupId: string, tabIds: string[]): Promise<void> {
  if (tabIds.length === 0) return;
  const supabase = await getSupabase();
  const { error } = await supabase.rpc('consume_restored_tabs', { p_group_id: groupId, p_tab_ids: tabIds });
  if (error) throw error;
}

export async function updateGroupTitle(groupId: string, title: string) {
  const supabase = await getSupabase();
  const user = await getCurrentSessionUser();
  if (!user) throw new Error('ログインしてください。');

  const nextTitle = title.trim();
  if (!nextTitle) {
    throw new Error('グループ名を入力してください。');
  }

  const { error } = await supabase
    .from('tab_groups')
    .update({ title: nextTitle })
    .eq('id', groupId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function deleteGroup(groupId: string) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('tab_groups')
    .delete()
    .eq('id', groupId);

  if (error) throw error;
}
