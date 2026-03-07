import { getConfig, saveConfig, getOrCreateDeviceId } from './storage.js';
import {
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  saveTabGroup,
  listGroups,
  markGroupArchived,
  markGroupRestored
} from './supabase.js';
import { getCurrentWindowTabs, getActiveTab, restoreTabs } from './tabs.js';
import {
  setText,
  setConfigInputs,
  getConfigInputs,
  getAuthInputs,
  getGroupTitleInput,
  renderGroups
} from './ui.js';

async function refreshAuthStatus() {
  try {
    const user = await getCurrentUser();
    setText('auth-status', user ? `ログイン中: ${user.email}` : '未ログイン');
  } catch {
    setText('auth-status', 'Supabase 設定を保存してください。');
  }
}

async function refreshGroups() {
  try {
    const groups = await listGroups();
    renderGroups(groups, {
      onRestore: async (group) => {
        try {
          await restoreTabs(group.tabs.map((tab) => tab.url));
          await markGroupRestored(group.id);
          await refreshGroups();
        } catch (error) {
          setText('save-status', `復元失敗: ${error.message}`);
        }
      },
      onArchive: async (group) => {
        try {
          await markGroupArchived(group.id);
          await refreshGroups();
        } catch (error) {
          setText('save-status', `アーカイブ失敗: ${error.message}`);
        }
      }
    });
  } catch {
    renderGroups([], {
      onRestore: () => {},
      onArchive: () => {}
    });
  }
}

async function bootstrap() {
  const config = await getConfig();
  setConfigInputs(config);
  await refreshAuthStatus();
  await refreshGroups();
}

document.getElementById('save-config-btn').addEventListener('click', async () => {
  const config = getConfigInputs();
  await saveConfig(config);
  setText('auth-status', '設定を保存しました。');
  await refreshAuthStatus();
  await refreshGroups();
});

document.getElementById('sign-up-btn').addEventListener('click', async () => {
  const { email, password } = getAuthInputs();
  try {
    const { error } = await signUp(email, password);
    if (error) throw error;
    setText('auth-status', '登録しました。メール確認が必要な設定なら確認してください。');
    await refreshAuthStatus();
  } catch (error) {
    setText('auth-status', `登録失敗: ${error.message}`);
  }
});

document.getElementById('sign-in-btn').addEventListener('click', async () => {
  const { email, password } = getAuthInputs();
  try {
    const { error } = await signIn(email, password);
    if (error) throw error;
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    setText('auth-status', `ログイン失敗: ${error.message}`);
  }
});

document.getElementById('sign-out-btn').addEventListener('click', async () => {
  try {
    const { error } = await signOut();
    if (error) throw error;
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    setText('auth-status', `ログアウト失敗: ${error.message}`);
  }
});

document.getElementById('save-current-window-btn').addEventListener('click', async () => {
  try {
    const tabs = await getCurrentWindowTabs();
    const deviceId = await getOrCreateDeviceId();
    const title = getGroupTitleInput();
    const result = await saveTabGroup({ title, deviceId, tabs });
    setText('save-status', `${result.count} 件保存しました。`);
    await refreshGroups();
  } catch (error) {
    setText('save-status', `保存失敗: ${error.message}`);
  }
});

document.getElementById('save-selected-tab-btn').addEventListener('click', async () => {
  try {
    const activeTab = await getActiveTab();
    if (!activeTab) throw new Error('現在タブが取得できません。');

    const deviceId = await getOrCreateDeviceId();
    const title = getGroupTitleInput();
    const result = await saveTabGroup({ title, deviceId, tabs: [activeTab] });
    setText('save-status', `${result.count} 件保存しました。`);
    await refreshGroups();
  } catch (error) {
    setText('save-status', `保存失敗: ${error.message}`);
  }
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  await refreshAuthStatus();
  await refreshGroups();
});

bootstrap();