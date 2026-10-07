import { getSupabase, getCurrentSessionUser } from './supabase-client';
import { storageLocalGet, storageLocalSet } from './browser-api';
import type { TabGroup } from './types';

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

const GROUP_COLUMNS = 'id, title, created_at, is_fixed, is_favorite, device_id, tabs(id, url, title, position)';

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
