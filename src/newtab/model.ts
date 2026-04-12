import type { GroupCollectionSummary } from '../shared/group-summary';
import { groupHasStatus } from '../shared/group-helpers';
import { summarizeGroupCollection } from '../shared/group-summary';
import type { AppConfig, SaveStatus, TabGroup } from '../shared/types';

export const LIGHTWEIGHT_GROUP_BATCH_SIZE = 12;

export type GroupFilter = 'all' | SaveStatus;
export type SortMode = 'newest' | 'oldest' | 'tabCount';
export type UiMode = 'default' | 'lightweight';

export interface RuntimeProfile {
  isAndroidFirefox: boolean;
  uiMode: UiMode;
}

export interface NewtabState {
  authStatus: string;
  saveStatus: string;
  pageStatus: string;
  searchQuery: string;
  groupFilter: GroupFilter;
  sortMode: SortMode;
  allGroups: TabGroup[];
  selectedGroupIds: string[];
  expandedGroupIds: string[];
  editingGroupId: string | null;
  editingGroupTitle: string;
  email: string;
  password: string;
  groupTitle: string;
  importText: string;
  configBusy: boolean;
  authBusy: boolean;
  refreshBusy: boolean;
  saveWindowBusy: boolean;
  saveTabBusy: boolean;
  importBusy: boolean;
  actionBusy: boolean;
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
  uiMode: UiMode;
  savePanelOpen: boolean;
  settingsPanelOpen: boolean;
  visibleGroupCount: number;
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

export function createInitialState(runtimeProfile: RuntimeProfile): NewtabState {
  return {
    authStatus: '状態を確認しています。',
    saveStatus: '',
    pageStatus: '',
    searchQuery: '',
    groupFilter: 'all',
    sortMode: 'newest',
    allGroups: [],
    selectedGroupIds: [],
    expandedGroupIds: [],
    editingGroupId: null,
    editingGroupTitle: '',
    email: '',
    password: '',
    groupTitle: '',
    importText: '',
    configBusy: false,
    authBusy: false,
    refreshBusy: false,
    saveWindowBusy: false,
    saveTabBusy: false,
    importBusy: false,
    actionBusy: false,
    config: {
      supabaseUrl: '',
      supabaseKey: '',
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
  if (filter === 'all') return true;
  return groupHasStatus(group, filter);
}

export function sortGroups(mode: SortMode) {
  return (a: TabGroup, b: TabGroup) => {
    if (mode === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    if (mode === 'tabCount') {
      return b.tabs.length - a.tabs.length || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  };
}

export type GroupSummary = GroupCollectionSummary;

export function summarizeGroups(groups: TabGroup[]): GroupSummary {
  return summarizeGroupCollection(groups);
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
    if (groupHasStatus(group, 'saved')) {
      restorableGroupCount += 1;
    }
  }

  return {
    selectedCount,
    selectedTabCount,
    restorableGroupCount
  };
}

export function shouldIncludeArchivedGroups(filter: GroupFilter): boolean {
  return filter === 'archived';
}
