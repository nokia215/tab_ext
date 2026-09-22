import { reconcileGroupIds } from './group-helpers';
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

export function reconcileExpandedGroupIds(
  expandedGroupIds: string[],
  groups: TabGroup[],
  maxCount: number | null
) {
  const next = reconcileGroupIds(expandedGroupIds, groups);
  return maxCount === null ? next : next.slice(0, maxCount);
}

export function removeGroupsFromCollection(groups: TabGroup[], groupIds: string[]) {
  if (groupIds.length === 0) return groups;

  const removedIds = new Set(groupIds);
  return groups.filter((group) => !removedIds.has(group.id));
}

export function removeTabsFromCollection(groups: TabGroup[], tabIds: string[], favoriteGroupIds: string[] = []) {
  if (tabIds.length === 0) return groups;

  const removedIds = new Set(tabIds);

  return groups
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !removedIds.has(tab.id))
    }))
    .filter((group) => group.tabs.length > 0 || favoriteGroupIds.includes(group.id));
}
