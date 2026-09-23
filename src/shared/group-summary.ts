import { isStaleGroupByAge } from './group-age';
import type { TabGroup } from './types';

export interface GroupCollectionSummary {
  groupCount: number;
  totalTabs: number;
  deviceCount: number;
  restorableGroupCount: number;
  staleGroupCount: number;
  staleTabCount: number;
}

export function summarizeGroupCollection(groups: TabGroup[]): GroupCollectionSummary {
  let totalTabs = 0;
  let restorableGroupCount = 0;
  let staleGroupCount = 0;
  let staleTabCount = 0;
  const devices = new Set<string>();

  for (const group of groups) {
    devices.add(group.device_id);
    if (isStaleGroupByAge(group)) {
      staleGroupCount += 1;
      staleTabCount += group.tabs.length;
    }

    totalTabs += group.tabs.length;
    if (group.tabs.length > 0) restorableGroupCount += 1;
  }

  return {
    groupCount: groups.length,
    totalTabs,
    deviceCount: devices.size,
    restorableGroupCount,
    staleGroupCount,
    staleTabCount
  };
}
