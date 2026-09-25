import type { TabGroup } from './types';

export interface SavePanelView {
  groups: TabGroup[];
  groupId: string;
  title: string;
  status: string;
  windowBusy: boolean;
  tabBusy: boolean;
  importText: string;
  importBusy: boolean;
}

export interface AuthPanelView {
  email: string;
  password: string;
  status: string;
  busy: boolean;
}

export interface ConfigPanelView {
  ignoreDomainsText: string;
  ignoreTitlesText: string;
  busy: boolean;
}

export interface GroupListView {
  groups: TabGroup[];
  emptyLabel: string;
  expandedGroupIds: string[];
  collapsible: boolean;
  busy: boolean;
  selectedGroupIds?: string[];
  favoriteGroupIds?: string[];
  extraActionLabel?: string;
  editableGroupId?: string | null;
  editableGroupTitle?: string;
}
