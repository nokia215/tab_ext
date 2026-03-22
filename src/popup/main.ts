import '../shared/ui.css';
import '../shared/panels.css';
import './popup.css';
import { createTab, getRuntimeUrl, runtimeSendMessage } from '../shared/browser-api';
import { lineListToText, textToLineList } from '../shared/format';
import { renderDisabled } from '../shared/html';
import { importTabGroups } from '../shared/import';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { renderAuthPanel, renderConfigPanel, renderSavePanel } from '../shared/renderers';
import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
import {
  getCurrentSessionUser,
  listGroups,
  saveTabGroup,
  signIn,
  signOut,
  signUp
} from '../shared/supabase';
import type { AppConfig, TabGroup } from '../shared/types';

interface PopupState {
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

function createInitialState(): PopupState {
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

class PopupApp {
  private readonly root: HTMLElement;
  private state = createInitialState();

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.root.addEventListener('toggle', (event) => {
      this.handleToggle(event);
    });
  }

  async bootstrap() {
    this.state.refreshBusy = true;
    this.render();

    try {
      this.setConfigFields(await getConfig());
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private get totalTabs() {
    return this.state.allGroups.reduce((sum, group) => sum + group.tabs.length, 0);
  }

  private get deviceCount() {
    return new Set(this.state.allGroups.map((group) => group.device_id)).size;
  }

  private setConfigFields(next: AppConfig) {
    this.state.config = next;
    this.state.ignoreDomainsText = lineListToText(next.ignoreDomains);
    this.state.ignoreTitlesText = lineListToText(next.ignoreTitles);
  }

  private configPayload(): AppConfig {
    return {
      supabaseUrl: this.state.config.supabaseUrl.trim(),
      supabaseKey: this.state.config.supabaseKey.trim(),
      ignoreDomains: textToLineList(this.state.ignoreDomainsText),
      ignoreTitles: textToLineList(this.state.ignoreTitlesText)
    };
  }

  private async refreshAuthStatus() {
    try {
      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';
    } catch (error) {
      this.state.authStatus = `状態確認失敗: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async refreshGroups() {
    try {
      const config = await getConfig();
      if (!config.supabaseUrl || !config.supabaseKey) {
        this.state.allGroups = [];
        return;
      }

      const user = await getCurrentSessionUser();
      if (!user) {
        this.state.allGroups = [];
        return;
      }

      this.state.allGroups = await listGroups(false, user.id);
    } catch (error) {
      console.error('refreshGroups failed', error);
      this.state.allGroups = [];
    }
  }

  private async saveTabs(tabs: chrome.tabs.Tab[]) {
    const deviceId = await getOrCreateDeviceId();
    const result = await saveTabGroup({
      title: this.state.groupTitle,
      deviceId,
      tabs
    });

    this.state.saveStatus = `${result.count} 件保存しました。`;
    await this.refreshGroups();
  }

  private async handleImportTabs() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy || this.state.importBusy) return;

    this.state.importBusy = true;
    this.render();

    try {
      const { importedGroupCount, importedTabCount, skippedLineCount } = await importTabGroups({
        groupTitle: this.state.groupTitle,
        importText: this.state.importText
      });

      this.state.importText = '';
      this.state.saveStatus = skippedLineCount > 0
        ? `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。${skippedLineCount} 行はスキップしました。`
        : `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。`;
      await this.refreshGroups();
    } catch (error) {
      this.state.saveStatus = `インポート失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.importBusy = false;
      this.render();
    }
  }

  private async requestCurrentWindowTabs() {
    const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
      type: 'get-current-window-tabs'
    });

    if (!result?.ok || !('tabs' in result)) {
      throw new Error(result?.ok ? 'ウィンドウ内のタブ取得に失敗しました。' : result?.error ?? 'ウィンドウ内のタブ取得に失敗しました。');
    }

    return result.tabs;
  }

  private async requestActiveTab() {
    const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
      type: 'get-active-tab'
    });

    if (!result?.ok || !('tab' in result)) {
      throw new Error(result?.ok ? '現在タブの取得に失敗しました。' : result?.error ?? '現在タブの取得に失敗しました。');
    }

    return result.tab;
  }

  private async handleSaveConfig() {
    this.state.configBusy = true;
    this.render();

    try {
      const next = this.configPayload();
      await saveConfig(next);
      this.setConfigFields(next);
      this.state.authStatus = '設定を保存しました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `設定保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.configBusy = false;
      this.render();
    }
  }

  private async handleSignUp() {
    this.state.authBusy = true;
    this.render();

    try {
      const { data, error } = await signUp(this.state.email.trim(), this.state.password);
      if (error) throw error;
      this.state.authStatus = data.user && !data.session
        ? '登録しました。確認メールが必要なら確認してください。'
        : '登録しました。';
      await this.refreshAuthStatus();
    } catch (error) {
      this.state.authStatus = `登録失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSignIn() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signIn(this.state.email.trim(), this.state.password);
      if (error) throw error;
      this.state.authStatus = 'ログインしました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `ログイン失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSignOut() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signOut();
      if (error) throw error;
      this.state.authStatus = 'ログアウトしました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `ログアウト失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSaveWindow() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveWindowBusy = true;
    this.render();

    try {
      await this.saveTabs(await this.requestCurrentWindowTabs());
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.saveWindowBusy = false;
      this.render();
    }
  }

  private async handleSaveTab() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveTabBusy = true;
    this.render();

    try {
      const tab = await this.requestActiveTab();
      if (!tab) throw new Error('現在タブが取得できません。');
      await this.saveTabs([tab]);
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.saveTabBusy = false;
      this.render();
    }
  }

  private async handleRefresh() {
    this.state.refreshBusy = true;
    this.render();

    try {
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private async openDashboard() {
    await createTab({ url: getRuntimeUrl('newtab.html'), active: true });
  }

  private render() {
    document.title = 'Tab Saver';
    const totalTabs = this.totalTabs;
    const deviceCount = this.deviceCount;

    this.root.innerHTML = `
      <main class="shell popup-shell">
        <section class="hero panel">
          <div class="hero-copy">
            <p class="hero-kicker">Tab Saver</p>
            <h1>ワンクリックで作業中のタブ群を退避</h1>
            <p class="muted">
              現在のウィンドウをスナップショット化し、別ブラウザや別マシンから復元できます。
            </p>
          </div>

          <div class="metric-grid hero-metrics">
            <article class="metric-card">
              <p class="metric-label">Groups</p>
              <p class="metric-value">${this.state.allGroups.length}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Tabs</p>
              <p class="metric-value">${totalTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Devices</p>
              <p class="metric-value">${deviceCount}</p>
            </article>
          </div>

          <div class="actions">
            <button class="secondary" type="button" data-action="open-dashboard">ダッシュボードを開く</button>
            <button class="ghost" type="button" data-action="refresh"${renderDisabled(this.state.refreshBusy)}>
              更新
            </button>
          </div>
        </section>

        ${renderSavePanel({
          title: this.state.groupTitle,
          status: this.state.saveStatus,
          windowBusy: this.state.saveWindowBusy,
          tabBusy: this.state.saveTabBusy,
          importText: this.state.importText,
          importBusy: this.state.importBusy
        })}

        <details class="settings-wrap"${this.state.settingsOpen ? ' open' : ''}>
          <summary>設定と認証</summary>
          <div class="settings-grid">
            ${renderConfigPanel({
              supabaseUrl: this.state.config.supabaseUrl,
              supabaseKey: this.state.config.supabaseKey,
              ignoreDomainsText: this.state.ignoreDomainsText,
              ignoreTitlesText: this.state.ignoreTitlesText,
              busy: this.state.configBusy
            })}
            ${renderAuthPanel({
              email: this.state.email,
              password: this.state.password,
              status: this.state.authStatus,
              busy: this.state.authBusy
            })}
          </div>
        </details>
      </main>
    `;
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'groupTitle':
        this.state.groupTitle = target.value;
        break;
      case 'importText':
        this.state.importText = target.value;
        break;
      case 'email':
        this.state.email = target.value;
        break;
      case 'password':
        this.state.password = target.value;
        break;
      case 'supabaseUrl':
        this.state.config = { ...this.state.config, supabaseUrl: target.value };
        break;
      case 'supabaseKey':
        this.state.config = { ...this.state.config, supabaseKey: target.value };
        break;
      case 'ignoreDomainsText':
        this.state.ignoreDomainsText = target.value;
        break;
      case 'ignoreTitlesText':
        this.state.ignoreTitlesText = target.value;
        break;
      default:
        break;
    }
  }

  private handleToggle(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement) || !target.classList.contains('settings-wrap')) {
      return;
    }

    this.state.settingsOpen = target.open;
  }

  private async handleClick(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionTarget = target.closest<HTMLElement>('[data-action]');
    if (!actionTarget || !this.root.contains(actionTarget)) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (!action) {
      return;
    }

    switch (action) {
      case 'open-dashboard':
        await this.openDashboard();
        break;
      case 'refresh':
        await this.handleRefresh();
        break;
      case 'save-window':
        await this.handleSaveWindow();
        break;
      case 'save-tab':
        await this.handleSaveTab();
        break;
      case 'import-tabs':
        await this.handleImportTabs();
        break;
      case 'save-config':
        await this.handleSaveConfig();
        break;
      case 'sign-up':
        await this.handleSignUp();
        break;
      case 'sign-in':
        await this.handleSignIn();
        break;
      case 'sign-out':
        await this.handleSignOut();
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Popup root element was not found.');
}

const app = new PopupApp(target);
void app.bootstrap();
