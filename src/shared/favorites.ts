import { storageLocalGet, storageLocalSet } from './browser-api';
import type { TabGroup } from './types';

const FAVORITE_GROUP_IDS_KEY = 'favorite_group_ids';

let cachedFavoriteGroupIds: string[] | null = null;

function normalizeGroupIds(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))];
}

export async function getFavoriteGroupIds(): Promise<string[]> {
  if (cachedFavoriteGroupIds) {
    return [...cachedFavoriteGroupIds];
  }

  const result = await storageLocalGet(FAVORITE_GROUP_IDS_KEY);
  const raw = (result as Record<string, string[] | undefined>)[FAVORITE_GROUP_IDS_KEY];

  cachedFavoriteGroupIds = normalizeGroupIds(raw);
  return [...cachedFavoriteGroupIds];
}

export async function saveFavoriteGroupIds(groupIds: string[]): Promise<void> {
  const normalized = normalizeGroupIds(groupIds);
  await storageLocalSet({ [FAVORITE_GROUP_IDS_KEY]: normalized });
  cachedFavoriteGroupIds = normalized;
}

export async function toggleFavoriteGroupId(groupId: string): Promise<string[]> {
  const current = await getFavoriteGroupIds();
  const next = current.includes(groupId)
    ? current.filter((value) => value !== groupId)
    : [...current, groupId];

  await saveFavoriteGroupIds(next);
  return next;
}

export function removeFavoriteGroupIds(favoriteGroupIds: string[], groupIds: string[]): string[] {
  const removedIds = new Set(groupIds);
  return favoriteGroupIds.filter((groupId) => !removedIds.has(groupId));
}

export function countFavoriteGroups(groups: TabGroup[], favoriteGroupIds: string[]): number {
  const visibleGroupIds = new Set(groups.map((group) => group.id));
  let count = 0;

  for (const groupId of favoriteGroupIds) {
    if (visibleGroupIds.has(groupId)) {
      count += 1;
    }
  }

  return count;
}
