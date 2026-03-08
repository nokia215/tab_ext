import './style.css';
import { createTab, getRuntimeUrl } from '../shared/browser-api';
import { getOrCreateDeviceId, getConfig, saveConfig } from '../shared/storage';
import { getActiveTab, getCurrentWindowTabs, openSavedTab, restoreTabs } from '../shared/tabs';
import {
  deleteGroup,
  deleteSavedTab,
  getCurrentUser,
  listGroups,
  markGroupRestored,
  saveTabGroup,
  signIn,
  signOut,
  signUp
} from '../shared/supabase';
import {
  getAuthInputs,
  getConfigInputs,
  getGroupTitleInput,
  renderGroups,
  setConfigInputs,
  setText
} from './ui';
import { TabGroup } from '../shared/types';
import { filterGroups } from '../shared/search';

let isSavingCurrentWindow = false;
let isSavingSelectedTab = false;
let allGroups: TabGroup[] = [];
let currentQuery = '';

async function refreshAuthStatus() {
  try {
    const user = await getCurrentUser();
    setText('auth-status', user ? `ログイン中: ${user.email}` : '未ログイン');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `状態確認失敗: ${message}`);
  }
}

async function refreshGroups() {
  try {
    allGroups = await listGroups();
    renderFilteredGroups();
  } catch (error) {
    console.error('refreshGroups failed', error);
    allGroups = [];
    renderFilteredGroups();
  }
}

async function bootstrap() {
  try {
    const config = await getConfig();
    setConfigInputs(config);
  } catch (error) {
    console.error('bootstrap failed', error);
  }

  const searchInput = document.getElementById('group-search') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    currentQuery = searchInput.value;
    renderFilteredGroups();
  });

  await refreshAuthStatus();
  await refreshGroups();
}


function renderFilteredGroups() {
  renderGroups(filterGroups(allGroups, currentQuery), {
    onRestore: async (group) => {
      await restoreTabs(group.tabs.map((tab) => tab.url));
      await markGroupRestored(group.id);
      await refreshGroups();
    },
    onDeleteGroup: async (group) => {
      await deleteGroup(group.id);
      await refreshGroups();
    },
    onOpenTab: async (tab) => {
      await openSavedTab(tab.url);
      await deleteSavedTab(tab.id);
      await refreshGroups();
    }
  });
}


document.getElementById('save-config-btn')?.addEventListener('click', async () => {
  try {
    const config = getConfigInputs();
    await saveConfig(config);
    setText('auth-status', '設定を保存しました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `設定保存失敗: ${message}`);
  }
});

document.getElementById('sign-up-btn')?.addEventListener('click', async () => {
  try {
    const { email, password } = getAuthInputs();
    const { data, error } = await signUp(email, password);
    if (error) throw error;

    if (data.user && !data.session) {
      setText('auth-status', '登録しました。確認メールが必要なら確認してください。');
    } else {
      setText('auth-status', '登録しました。');
    }

    await refreshAuthStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `登録失敗: ${message}`);
  }
});

document.getElementById('sign-in-btn')?.addEventListener('click', async () => {
  try {
    const { email, password } = getAuthInputs();
    const { error } = await signIn(email, password);
    if (error) throw error;
    setText('auth-status', 'ログインしました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `ログイン失敗: ${message}`);
  }
});

document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
  try {
    const { error } = await signOut();
    if (error) throw error;
    setText('auth-status', 'ログアウトしました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `ログアウト失敗: ${message}`);
  }
});

document.getElementById('save-current-window-btn')?.addEventListener('click', async () => {
  if (isSavingCurrentWindow) return;
  isSavingCurrentWindow = true;

  try {
    const tabs = await getCurrentWindowTabs();
    const deviceId = await getOrCreateDeviceId();
    const title = getGroupTitleInput();
    const result = await saveTabGroup({ title, deviceId, tabs });
    setText('save-status', `${result.count} 件保存しました。`);
    await refreshGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('save-status', `保存失敗: ${message}`);
  } finally {
    isSavingCurrentWindow = false;
  }
});

document.getElementById('save-selected-tab-btn')?.addEventListener('click', async () => {
  if (isSavingSelectedTab) return;
  isSavingSelectedTab = true;

  try {
    const activeTab = await getActiveTab();
    if (!activeTab) throw new Error('現在タブが取得できません。');

    const deviceId = await getOrCreateDeviceId();
    const title = getGroupTitleInput();
    const result = await saveTabGroup({ title, deviceId, tabs: [activeTab] });
    setText('save-status', `${result.count} 件保存しました。`);
    await refreshGroups();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('save-status', `保存失敗: ${message}`);
  } finally {
    isSavingSelectedTab = false;
  }
});

document.getElementById('open-dashboard-btn')?.addEventListener('click', async () => {
  await createTab({ url: getRuntimeUrl('newtab.html'), active: true });
});

document.getElementById('refresh-btn')?.addEventListener('click', async () => {
  await refreshAuthStatus();
  await refreshGroups();
});

void bootstrap();