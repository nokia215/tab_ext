import '../shared/ui.css';
import '../shared/panels.css';
import './popup.css';
import { createTab, getRuntimeUrl, runtimeSendMessage } from '../shared/browser-api';
import { formatDate, lineListToText, textToLineList } from '../shared/format';
import { escapeHtml, renderDisabled, renderStatusBanner } from '../shared/html';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { renderAuthPanel, renderConfigPanel, renderSavePanel } from '../shared/renderers';
import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
import { getActiveTab, getCurrentWindowTabs } from '../shared/tabs';
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
  actionStatus: string;
  allGroups: TabGroup[];
  email: string;
  password: string;
  groupTitle: string;
  configBusy: boolean;
  authBusy: boolean;
  refreshBusy: boolean;
  saveWindowBusy: boolean;
  saveTabBusy: boolean;
  actionBusy: boolean;
  settingsOpen: boolean;
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
}

function createInitialState(): PopupState {
  return {
    authStatus: '状態を確認しています。',
    saveStatus: '',
    actionStatus: '',
    allGroups: [],
    email: '',
    password: '',
    groupTitle: '',
    configBusy: false,
    authBusy: false,
    refreshBusy: false,
    saveWindowBusy: false,
    saveTabBusy: false,
    actionBusy: false,
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

  private get recentGroups() {
    return this.state.allGroups.slice(0, 5);
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

  private findGroup(groupId: string) {
    return this.state.allGroups.find((group) => group.id === groupId);
  }

  private findTab(tabId: string) {
    for (const group of this.state.allGroups) {
      const tab = group.tabs.find((item) => item.id === tabId);
      if (tab) {
        return { group, tab };
      }
    }

    return null;
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
      await this.saveTabs(await getCurrentWindowTabs());
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
      const tab = await getActiveTab();
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

  private async runPopupAction(message: PopupActionMessage, successMessage: string) {
    if (this.state.actionBusy) return;

    this.state.actionBusy = true;
    this.state.actionStatus = '';
    this.render();

    try {
      const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>(message);
      if (!result?.ok) {
        throw new Error(result?.error ?? '操作に失敗しました。');
      }

      this.state.actionStatus = successMessage;
      await this.refreshGroups();
    } catch (error) {
      this.state.actionStatus = `操作失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleRestoreGroup(groupId: string) {
    const group = this.findGroup(groupId);
    if (!group) return;

    await this.runPopupAction(
      {
        type: 'restore-group',
        groupId: group.id,
        urls: group.tabs.map((tab) => tab.url)
      },
      `「${group.title ?? '(untitled)'}」を復元しました。`
    );
  }

  private async handleOpenSavedTab(tabId: string) {
    const resolved = this.findTab(tabId);
    if (!resolved) return;

    await this.runPopupAction(
      {
        type: 'open-saved-tab',
        tabId: resolved.tab.id,
        url: resolved.tab.url
      },
      `「${resolved.group.title ?? '(untitled)'}」からタブを開きました。`
    );
  }

  private renderRecentGroups(): string {
    if (this.recentGroups.length === 0) {
      return '<div class="empty-mini">まだ保存済みグループはありません。</div>';
    }

    return `
      <div class="recent-list">
        ${this.recentGroups
          .map((group) => {
            const tabs = group.tabs.slice(0, 3);
            const moreCount = group.tabs.length - tabs.length;

            return `
              <article class="recent-item">
                <div class="recent-main">
                  <h3>${escapeHtml(group.title ?? '(untitled)')}</h3>
                  <p>${escapeHtml(formatDate(group.created_at))} · ${group.tabs.length} tabs · ${escapeHtml(group.device_id)}</p>
                </div>
                <div class="recent-actions">
                  <button
                    class="secondary"
                    type="button"
                    data-action="restore-group"
                    data-group-id="${escapeHtml(group.id)}"
                    ${renderDisabled(this.state.actionBusy)}
                  >
                    全部復元
                  </button>
                </div>
                <div class="recent-tabs">
                  ${tabs
                    .map(
                      (tab) => `
                        <button
                          class="tab-chip"
                          type="button"
                          data-action="open-saved-tab"
                          data-tab-id="${escapeHtml(tab.id)}"
                          ${renderDisabled(this.state.actionBusy)}
                        >
                          <span class="tab-chip-title">${escapeHtml(tab.title || '(no title)')}</span>
                          <span class="tab-chip-url">${escapeHtml(tab.url)}</span>
                        </button>
                      `
                    )
                    .join('')}
                  ${moreCount > 0 ? `<p class="more-tabs">ほか ${moreCount} 件はダッシュボードで操作</p>` : ''}
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private render() {
    document.title = 'Tab Saver';

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
              <p class="metric-value">${this.totalTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Devices</p>
              <p class="metric-value">${this.deviceCount}</p>
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
          tabBusy: this.state.saveTabBusy
        })}

        <section class="panel recent-panel">
          <div>
            <h2 class="section-title">最近の保存</h2>
            <p class="section-copy">popup から最近の保存をすぐ復元できます。重い整理や検索はダッシュボードで行います。</p>
          </div>
          ${renderStatusBanner(this.state.actionStatus, this.state.actionStatus.startsWith('操作失敗'))}
          ${this.renderRecentGroups()}
          <button class="secondary" type="button" data-action="open-dashboard">詳細はダッシュボードで開く</button>
        </section>

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
      case 'restore-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.handleRestoreGroup(groupId);
        }
        break;
      }
      case 'open-saved-tab': {
        const tabId = actionTarget.dataset.tabId;
        if (tabId) {
          await this.handleOpenSavedTab(tabId);
        }
        break;
      }
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
