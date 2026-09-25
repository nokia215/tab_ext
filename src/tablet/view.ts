import type { DeviceFilterOption, DashboardState, SelectedGroupSummary } from '../shared/dashboard-model';
import type { TabGroup } from '../shared/types';

export interface TabletViewArgs {
  state: DashboardState;
  summary: { groupCount: number; totalTabs: number; deviceCount: number; staleGroupCount: number };
  selectedSummary: SelectedGroupSummary;
  bulkSelectableCount: number;
  staleSelectableCount: number;
  filteredStaleGroupCount: number;
  staleSelectLabel: string;
  favoriteGroupCount: number;
  deviceFilterOptions: DeviceFilterOption[];
  filteredGroups: TabGroup[];
  visibleGroups: TabGroup[];
  visibleExpandedGroupIds: string[];
  pageStatusIsError: boolean;
}
