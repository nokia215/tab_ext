import type { AppConfig, TabGroup } from '../shared/types';

export interface PopupState {
  authStatus: string;
  saveStatus: string;
  allGroups: TabGroup[];
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
  settingsOpen: boolean;
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
}

export function createInitialPopupState(): PopupState {
  return {
    authStatus: '状態を確認しています。',
    saveStatus: '',
    allGroups: [],
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
    settingsOpen: false,
    config: {
      supabaseUrl: '',
      supabaseKey: '',
      ignoreDomains: [],
      ignoreTitles: []
    },
    ignoreDomainsText: '',
    ignoreTitlesText: ''
  };
}
