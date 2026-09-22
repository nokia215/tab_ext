import type { TabGroup } from './types';

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
