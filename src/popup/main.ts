import './style.css';
import { getConfig, saveConfig } from '../shared/storage';
import { getCurrentWindowTabs } from '../shared/tabs';
import { getCurrentUser, listGroups, signIn, signOut, signUp } from '../shared/supabase';
import { renderGroups, setConfigInputs, getConfigInputs, getAuthInputs, setText } from './ui';

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
    const groups = await listGroups();
    renderGroups(groups);
  } catch (error) {
    console.error('refreshGroups failed:', error);
    renderGroups([]);
  }
}

async function bootstrap() {
  try {
    const config = await getConfig();
    setConfigInputs(config);
  } catch (error) {
    console.error('bootstrap getConfig failed:', error);
  }

  await refreshAuthStatus();
  await refreshGroups();
}

document.getElementById('save-config-btn')?.addEventListener('click', async () => {
  try {
    const config = getConfigInputs();

    if (!config.supabaseUrl || !config.supabaseKey) {
      setText('auth-status', 'Supabase URL と key を入力してください。');
      return;
    }

    await saveConfig(config);
    setText('auth-status', '設定を保存しました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    console.error('save-config failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `設定保存失敗: ${message}`);
  }
});

document.getElementById('sign-up-btn')?.addEventListener('click', async () => {
  try {
    const { email, password } = getAuthInputs();

    if (!email || !password) {
      setText('auth-status', 'Email と Password を入力してください。');
      return;
    }

    setText('auth-status', '登録中...');

    const { data, error } = await signUp(email, password);
    if (error) {
      setText('auth-status', `登録失敗: ${error.message}`);
      return;
    }

    if (data.user && data.session) {
      setText('auth-status', `登録完了: ${data.user.email}`);
    } else if (data.user) {
      setText('auth-status', '登録しました。メール確認が必要な設定です。');
    } else {
      setText('auth-status', '登録結果が不明です。Supabase 設定を確認してください。');
    }

    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    console.error('sign-up failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `登録失敗: ${message}`);
  }
});

document.getElementById('sign-in-btn')?.addEventListener('click', async () => {
  try {
    const { email, password } = getAuthInputs();

    if (!email || !password) {
      setText('auth-status', 'Email と Password を入力してください。');
      return;
    }

    setText('auth-status', 'ログイン中...');

    const { error } = await signIn(email, password);
    if (error) {
      setText('auth-status', `ログイン失敗: ${error.message}`);
      return;
    }

    setText('auth-status', 'ログインしました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    console.error('sign-in failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `ログイン失敗: ${message}`);
  }
});

document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
  try {
    const { error } = await signOut();
    if (error) {
      setText('auth-status', `ログアウト失敗: ${error.message}`);
      return;
    }

    setText('auth-status', 'ログアウトしました。');
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    console.error('sign-out failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    setText('auth-status', `ログアウト失敗: ${message}`);
  }
});

document.getElementById('refresh-btn')?.addEventListener('click', async () => {
  try {
    await getCurrentWindowTabs();
    await refreshAuthStatus();
    await refreshGroups();
  } catch (error) {
    console.error('refresh failed:', error);
  }
});

void bootstrap();