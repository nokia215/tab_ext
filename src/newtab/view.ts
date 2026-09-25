import type { GroupCollectionSummary } from '../shared/group-summary';
import type { DeviceFilterOption, DashboardState, SelectedGroupSummary } from '../shared/dashboard-model';
import type { TabGroup } from '../shared/types';

export interface NewtabViewArgs {
  state: DashboardState;
  summary: GroupCollectionSummary;
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
