import type { TabGroup } from './types';

interface VisibleGroupState {
  visibleGroupCount: number;
}

export function resetVisibleGroupCount(state: VisibleGroupState, batchSize: number | null) {
  state.visibleGroupCount = batchSize ?? Number.MAX_SAFE_INTEGER;
}

export function visibleGroups(groups: TabGroup[], visibleGroupCount: number) {
  return groups.slice(0, visibleGroupCount);
}

export function visibleExpandedGroupIds(expandedGroupIds: string[], groups: TabGroup[]) {
  const groupIds = new Set(groups.map((group) => group.id));
  return expandedGroupIds.filter((groupId) => groupIds.has(groupId));
}

export function reconcileExpandedGroupIds(
  expandedGroupIds: string[],
  groups: TabGroup[],
  maxCount: number | null
) {
  const next = visibleExpandedGroupIds(expandedGroupIds, groups);
  return maxCount === null ? next : next.slice(0, maxCount);
}

export function removeGroupsFromCollection(groups: TabGroup[], groupIds: string[]) {
  if (groupIds.length === 0) return groups;

  const removedIds = new Set(groupIds);
  return groups.filter((group) => !removedIds.has(group.id));
}

export function removeTabsFromCollection(groups: TabGroup[], tabIds: string[]) {
  if (tabIds.length === 0) return groups;

  const removedIds = new Set(tabIds);

  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !removedIds.has(tab.id))
    }))
    .filter((group) => group.tabs.length > 0);
}
