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
  extraActionLabel?: string;
  editableGroupId?: string | null;
  editableGroupTitle?: string;
}

export interface GroupListActions {
  toggleGroup(id: string): void | Promise<void>;
  toggleSelection(id: string): void | Promise<void>;
  toggleFixed(id: string): void | Promise<void>;
  toggleFavorite(id: string): void | Promise<void>;
  editTitle(id: string): void | Promise<void>;
  saveTitle(id: string): void | Promise<void>;
  restoreGroup(id: string): void | Promise<void>;
  copyGroup(id: string): void | Promise<void>;
  deleteGroup(id: string): void | Promise<void>;
  openTab(id: string): void | Promise<void>;
  cancelEdit(): void | Promise<void>;
  changeTitle(id: string, title: string): void;
}
