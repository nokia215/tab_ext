import type { TabGroup } from './types';

export function updateGroup(groups: TabGroup[], groupId: string, update: (group: TabGroup) => TabGroup): TabGroup[] {
  return groups.map((group) => group.id === groupId ? update(group) : group);
}

export function reconcileGroupIds(groupIds: string[], groups: TabGroup[]): string[] {
  const validIds = new Set(groups.map((group) => group.id));
  return groupIds.filter((groupId) => validIds.has(groupId));
}

export function resolveGroupsByIds(groups: TabGroup[], groupIds: string[]): TabGroup[] {
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  return groupIds
    .map((groupId) => groupMap.get(groupId))
    .filter((group): group is TabGroup => Boolean(group));
}

export function toggleGroupId(groupIds: string[], groupId: string): string[] {
  return groupIds.includes(groupId)
    ? groupIds.filter((value) => value !== groupId)
    : [...groupIds, groupId];
}

export function mergeGroupIds(groupIds: string[], groups: TabGroup[]): string[] {
  const mergedGroupIds = new Set(groupIds);

  for (const group of groups) {
    mergedGroupIds.add(group.id);
  }

  return [...mergedGroupIds];
}
