import { getSupabase, getCurrentSessionUser } from './supabase-client';
import type { TabGroup } from './types';

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

async function listGroupRows<T>(columns: string, userId: string): Promise<T[]> {
  const supabase = await getSupabase();
  const rows: T[] = [];
  // Small pages also work with API limits below the project's 1,000-row default.
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from('tab_groups').select(columns)
      .eq('user_id', userId).order('created_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + 99);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 100) return rows;
  }
}

function orderedGroup(group: TabGroup): TabGroup {
  return { ...group, tabs: [...group.tabs].sort((a, b) => a.position - b.position) };
}

export async function listGroups(userId?: string): Promise<TabGroup[]> {
  const resolvedUserId = userId ?? (await getCurrentSessionUser())?.id;
  if (!resolvedUserId) throw new Error('ログインしてください。');
  return (await listGroupRows<TabGroup>(GROUP_COLUMNS, resolvedUserId)).map(orderedGroup);
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
