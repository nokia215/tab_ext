import { isStaleGroupByAge } from './group-age';
import type { TabGroup } from './types';

export interface GroupCollectionSummary {
  groupCount: number;
  totalTabs: number;
  restoredTabs: number;
  savedTabs: number;
  archivedTabs: number;
  deviceCount: number;
  restorableGroupCount: number;
  restoredGroupCount: number;
  staleGroupCount: number;
  staleTabCount: number;
}

export function summarizeGroupCollection(groups: TabGroup[]): GroupCollectionSummary {
  let totalTabs = 0;
  let restoredTabs = 0;
  let savedTabs = 0;
  let archivedTabs = 0;
  let restorableGroupCount = 0;
  let restoredGroupCount = 0;
  let staleGroupCount = 0;
  let staleTabCount = 0;
  const devices = new Set<string>();

  for (const group of groups) {
    devices.add(group.device_id);

    if (isStaleGroupByAge(group)) {
      staleGroupCount += 1;
      staleTabCount += group.tabs.length;
    }

    let hasSavedTab = false;
    let hasRestoredTab = false;

    for (const tab of group.tabs) {
      totalTabs += 1;

      if (tab.status === 'saved') {
        savedTabs += 1;
        hasSavedTab = true;
      } else if (tab.status === 'restored') {
        restoredTabs += 1;
        hasRestoredTab = true;
      } else if (tab.status === 'archived') {
        archivedTabs += 1;
      }
    }

    if (hasSavedTab) {
      restorableGroupCount += 1;
    }

    if (hasRestoredTab) {
      restoredGroupCount += 1;
    }
  }

  return {
    groupCount: groups.length,
    totalTabs,
    restoredTabs,
    savedTabs,
    archivedTabs,
    deviceCount: devices.size,
    restorableGroupCount,
    restoredGroupCount,
    staleGroupCount,
    staleTabCount
  };
}
