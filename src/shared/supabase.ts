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
  try {
    const url = new URL(raw);
    url.hash = '';

    const removableParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'ref'
    ];

    for (const key of removableParams) {
      url.searchParams.delete(key);
    }

    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    url.pathname = pathname;

    const search = [...url.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    return `${url.origin}${url.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return raw.trim();
  }
}

function buildDefaultGroupTitle(deviceId: string, tabCount: number): string {
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
  deviceId: string;
  tabs: chrome.tabs.Tab[];
}) {
  return persistTabGroup({
    title: input.title,
    deviceId: input.deviceId,
    tabs: await normalizeTabInputs(input.tabs)
  });
}

export async function saveImportedTabGroup(input: {
  title: string;
  deviceId: string;
  tabs: ImportableTabInput[];
}) {
  return persistTabGroup({
    title: input.title,
    deviceId: input.deviceId,
    tabs: await normalizeTabInputs(input.tabs)
  });
}

async function persistTabGroup(input: {
  title: string;
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

  const uniqueTabs = input.tabs.filter((tab) => {
    const normalized = normalizeUrl(tab.url ?? '');
    if (!normalized) return false;
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const title = input.title.trim() || buildDefaultGroupTitle(input.deviceId, uniqueTabs.length);

  const { data: group, error: groupError } = await supabase
    .from('tab_groups')
    .insert({
      user_id: user.id,
      device_id: input.deviceId,
      title
    })
    .select('id, title, created_at, device_id')
    .single();

  if (groupError) throw groupError;

  const rows = uniqueTabs.map((tab, index) => ({
    group_id: group.id,
    user_id: user.id,
    url: tab.url!,
    title: tab.title ?? '',
    position: index,
    status: 'saved' as const
  }));

  const { error: tabsError } = await supabase.from('tabs').insert(rows);
  if (tabsError) throw tabsError;

  return { group, count: uniqueTabs.length };
}

export async function listGroups(includeArchived = false, userId?: string): Promise<TabGroup[]> {
  const supabase = await getSupabase();
  const resolvedUserId = userId ?? (await getCurrentSessionUser())?.id;
  if (!resolvedUserId) throw new Error('ログインしてください。');

  const { data, error } = await supabase
    .from('tab_groups')
    .select(`
      id,
      title,
      created_at,
      device_id,
      tabs (
        id,
        url,
        title,
        position,
        status
      )
    `)
    .eq('user_id', resolvedUserId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .map((group) => ({
      ...group,
      tabs: [...(group.tabs ?? [])]
        .filter((tab) => includeArchived || tab.status !== 'archived')
        .sort((a, b) => a.position - b.position)
    }))
    .filter((group) => group.tabs.length > 0) as TabGroup[];
}

export async function markGroupRestored(groupId: string) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('tabs')
    .update({ status: 'restored', updated_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .neq('status', 'archived');

  if (error) throw error;
}

export async function markGroupArchived(groupId: string) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('tabs')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('group_id', groupId);

  if (error) throw error;
}

export async function deleteSavedTab(tabId: string) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('tabs')
    .delete()
    .eq('id', tabId);

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
