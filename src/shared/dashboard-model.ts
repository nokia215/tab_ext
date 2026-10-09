import { filterGroups } from './search';
import type { AppConfig, TabGroup } from './types';

export const LIGHTWEIGHT_GROUP_BATCH_SIZE = 12;

export type GroupFilter = 'all' | 'fixed';
export type SortMode = 'newest' | 'oldest' | 'tabCount';
export type UiMode = 'default' | 'lightweight';

export interface DeviceFilterOption {
  value: string;
  label: string;
  count: number;
}

export interface RuntimeProfile {
  isAndroidFirefox: boolean;
  uiMode: UiMode;
}

export interface DashboardState {
  sessionRevision: number;
  authStatus: string;
  saveStatus: string;
  pageStatus: string;
  syncStatus: string;
  pendingUpdates: number;
  searchQuery: string;
  favoriteOnly: boolean;
  groupFilter: GroupFilter;
  deviceFilter: string;
  sortMode: SortMode;
  allGroups: TabGroup[];
  favoriteGroupIds: string[];
  selectedGroupIds: string[];
  expandedGroupIds: string[];
  editingGroupId: string | null;
  editingGroupTitle: string;
  email: string;
  password: string;
  groupTitle: string;
  saveGroupId: string;
  importText: string;
  configBusy: boolean;
  authBusy: boolean;
  refreshBusy: boolean;
  saveWindowBusy: boolean;
  saveTabBusy: boolean;
  importBusy: boolean;
  actionBusy: boolean;
  restoreBusy: boolean;
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
  uiMode: UiMode;
  savePanelOpen: boolean;
  settingsPanelOpen: boolean;
  visibleGroupCount: number;
}

export function isDashboardBusy(state: DashboardState) {
  return state.actionBusy || state.refreshBusy || state.authBusy || state.configBusy
    || state.saveWindowBusy || state.saveTabBusy || state.importBusy;
}

export interface FocusState {
  name: string;
  start: number | null;
  end: number | null;
}

export interface SelectedGroupSummary {
  selectedCount: number;
  selectedTabCount: number;
  restorableGroupCount: number;
}

export function detectRuntimeProfile(): RuntimeProfile {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isAndroidFirefox = userAgent.includes('Android') && userAgent.includes('Firefox/');

  return {
    isAndroidFirefox,
    uiMode: isAndroidFirefox ? 'lightweight' : 'default'
  };
}

export function createInitialState(runtimeProfile: RuntimeProfile): DashboardState {
  return {
    sessionRevision: 0,
    authStatus: '状態を確認しています。',
    saveStatus: '',
    pageStatus: '',
    syncStatus: '',
    pendingUpdates: 0,
    searchQuery: '',
    favoriteOnly: false,
    groupFilter: 'all',
    deviceFilter: 'all',
    sortMode: 'newest',
    allGroups: [],
    favoriteGroupIds: [],
    selectedGroupIds: [],
    expandedGroupIds: [],
    editingGroupId: null,
    editingGroupTitle: '',
    email: '',
    password: '',
    groupTitle: '',
    saveGroupId: '',
    importText: '',
    configBusy: false,
    authBusy: false,
    refreshBusy: false,
    saveWindowBusy: false,
    saveTabBusy: false,
    importBusy: false,
    actionBusy: false,
    restoreBusy: false,
    config: {
      ignoreDomains: [],
      ignoreTitles: []
    },
    ignoreDomainsText: '',
    ignoreTitlesText: '',
    uiMode: runtimeProfile.uiMode,
    savePanelOpen: false,
    settingsPanelOpen: false,
    visibleGroupCount: runtimeProfile.uiMode === 'lightweight'
      ? LIGHTWEIGHT_GROUP_BATCH_SIZE
      : Number.MAX_SAFE_INTEGER
  };
}

export function matchesGroupFilter(group: TabGroup, filter: GroupFilter) {
  return filter === 'all' || group.is_fixed;
}

function matchesDeviceFilter(group: TabGroup, deviceFilter: string) {
  return deviceFilter === 'all' || group.device_id === deviceFilter;
}

function compareFavoriteOrder(a: TabGroup, b: TabGroup, favoriteGroupIds: Set<string>) {
  return Number(favoriteGroupIds.has(b.id)) - Number(favoriteGroupIds.has(a.id));
}

function compareByDate(a: TabGroup, b: TabGroup, direction: 'asc' | 'desc') {
  const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  return direction === 'asc' ? diff : -diff;
}

export function sortGroups(mode: SortMode, favoriteGroupIds = new Set<string>()) {
  return (a: TabGroup, b: TabGroup) => {
    const favoriteOrder = compareFavoriteOrder(a, b, favoriteGroupIds);
    if (favoriteOrder !== 0) {
      return favoriteOrder;
    }

    if (mode === 'oldest') {
      return compareByDate(a, b, 'asc');
    }

    if (mode === 'tabCount') {
      return b.tabs.length - a.tabs.length || compareByDate(a, b, 'desc');
    }

    return compareByDate(a, b, 'desc');
  };
}

export function queryGroups(
  groups: TabGroup[],
  options: Pick<
    DashboardState,
    'searchQuery' | 'favoriteOnly' | 'groupFilter' | 'deviceFilter' | 'sortMode' | 'favoriteGroupIds'
  >
) {
  const favoriteGroupIds = new Set(options.favoriteGroupIds);

  return filterGroups(groups, options.searchQuery)
    .filter((group) => matchesGroupFilter(group, options.groupFilter))
    .filter((group) => matchesDeviceFilter(group, options.deviceFilter))
    .filter((group) => !options.favoriteOnly || favoriteGroupIds.has(group.id))
    .sort(sortGroups(options.sortMode, favoriteGroupIds));
}

export function collectDeviceFilterOptions(groups: TabGroup[]): DeviceFilterOption[] {
  const deviceCounts = new Map<string, number>();

  for (const group of groups) {
    deviceCounts.set(group.device_id, (deviceCounts.get(group.device_id) ?? 0) + 1);
  }

  return [...deviceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([value, count]) => ({
      value,
      label: `${value} (${count})`,
      count
    }));
}

export function summarizeSelectedGroups(groups: TabGroup[], selectedGroupIds: string[]): SelectedGroupSummary {
  const selectedIds = new Set(selectedGroupIds);
  let selectedCount = 0;
  let selectedTabCount = 0;
  let restorableGroupCount = 0;

  for (const group of groups) {
    if (!selectedIds.has(group.id)) {
      continue;
    }

    selectedCount += 1;
    selectedTabCount += group.tabs.length;
    if (group.tabs.length > 0) {
      restorableGroupCount += 1;
    }
  }

  return {
    selectedCount,
    selectedTabCount,
    restorableGroupCount
  };
}
