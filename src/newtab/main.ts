import '../shared/ui.css';
import '../shared/panels.css';
import './newtab.css';
import { runtimeSendMessage } from '../shared/browser-api';
import { lineListToText, textToLineList } from '../shared/format';
import { escapeHtml, renderStatusBanner } from '../shared/html';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { renderAuthPanel, renderConfigPanel, renderGroupList, renderSavePanel } from '../shared/renderers';
import { filterGroups } from '../shared/search';
import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
import { getActiveTab, getCurrentWindowTabs } from '../shared/tabs';
import {
  deleteGroup,
  getCurrentSessionUser,
  listGroups,
  saveTabGroup,
  signIn,
  signOut,
  signUp
} from '../shared/supabase';
import type { AppConfig, TabGroup } from '../shared/types';

type GroupFilter = 'all' | 'saved' | 'restored';
type SortMode = 'newest' | 'oldest' | 'tabCount';

interface NewtabState {
  authStatus: string;
  saveStatus: string;
  pageStatus: string;
  searchQuery: string;
  groupFilter: GroupFilter;
  sortMode: SortMode;
  allGroups: TabGroup[];
  expandedGroupIds: string[];
  email: string;
  password: string;
  groupTitle: string;
  configBusy: boolean;
  authBusy: boolean;
  refreshBusy: boolean;
  saveWindowBusy: boolean;
  saveTabBusy: boolean;
  actionBusy: boolean;
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
}

interface FocusState {
  name: string;
  start: number | null;
  end: number | null;
}

function createInitialState(): NewtabState {
  return {
    authStatus: '状態を確認しています。',
    saveStatus: '',
    pageStatus: '',
    searchQuery: '',
    groupFilter: 'all',
    sortMode: 'newest',
    allGroups: [],
    expandedGroupIds: [],
    email: '',
    password: '',
    groupTitle: '',
    configBusy: false,
    authBusy: false,
    refreshBusy: false,
    saveWindowBusy: false,
    saveTabBusy: false,
    actionBusy: false,
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

function matchesGroupFilter(group: TabGroup, filter: GroupFilter) {
  if (filter === 'all') return true;
  return group.tabs.some((tab) => tab.status === filter);
}

function sortGroups(mode: SortMode) {
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

function summarizeGroups(groups: TabGroup[]) {
  let totalTabs = 0;
  let restoredTabs = 0;
  let savedTabs = 0;
  const devices = new Set<string>();

  for (const group of groups) {
    devices.add(group.device_id);

    for (const tab of group.tabs) {
      totalTabs += 1;
      if (tab.status === 'restored') restoredTabs += 1;
      if (tab.status === 'saved') savedTabs += 1;
    }
  }

  return {
    totalTabs,
    restoredTabs,
    savedTabs,
    deviceCount: devices.size
  };
}

class NewtabApp {
  private readonly root: HTMLElement;
  private state = createInitialState();
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.root.addEventListener('change', (event) => {
      this.handleChange(event);
    });
  }

  async bootstrap() {
    await this.refreshAll();
  }

  private get filteredGroups() {
    return filterGroups(this.state.allGroups, this.state.searchQuery)
      .filter((group) => matchesGroupFilter(group, this.state.groupFilter))
      .sort(sortGroups(this.state.sortMode));
  }

  private getVisibleExpandedGroupIds(groups: TabGroup[]) {
    return this.state.expandedGroupIds.filter((groupId) =>
      groups.some((group) => group.id === groupId)
    );
  }

  private get summary() {
    return summarizeGroups(this.state.allGroups);
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

  private renderFilterButton(value: GroupFilter, label: string) {
    const activeClass = this.state.groupFilter === value ? ' active-chip' : '';
    return `<button class="chip${activeClass}" type="button" data-action="set-group-filter" data-value="${value}">${label}</button>`;
  }

  private cancelPendingSearchRender() {
    if (this.pendingSearchRenderId !== null) {
      window.clearTimeout(this.pendingSearchRenderId);
      this.pendingSearchRenderId = null;
    }
  }

  private scheduleSearchRender(focus: FocusState) {
    this.cancelPendingSearchRender();
    this.pendingSearchRenderId = window.setTimeout(() => {
      this.pendingSearchRenderId = null;
      this.render(focus);
    }, 120);
  }

  private render(focus?: FocusState) {
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Dashboard';
    const pageStatusIsError = this.state.pageStatus.includes('失敗') || this.state.pageStatus === 'データを読み込めませんでした。';
    const summary = this.summary;
    const filteredGroups = this.filteredGroups;
    const visibleExpandedGroupIds = this.getVisibleExpandedGroupIds(filteredGroups);

    this.root.innerHTML = `
      <main class="shell page-shell">
        <section class="masthead panel">
          <div class="headline">
            <p class="hero-kicker">Shared Workspace</p>
            <h1>ブラウザをまたいで、タブ作業をそのまま引き継ぐ</h1>
            <p class="muted">
              保存、検索、復元、整理を 1 画面に集約したダッシュボードです。現在の状態を確認しながら次の作業へ移れます。
            </p>
          </div>

          <div class="metric-grid masthead-metrics">
            <article class="metric-card">
              <p class="metric-label">Saved groups</p>
              <p class="metric-value">${this.state.allGroups.length}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Active tabs</p>
              <p class="metric-value">${summary.totalTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Restored</p>
              <p class="metric-value">${summary.restoredTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Saved only</p>
              <p class="metric-value">${summary.savedTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Devices</p>
              <p class="metric-value">${summary.deviceCount}</p>
            </article>
          </div>

          <div class="actions">
            <div class="badge">${escapeHtml(this.state.authStatus)}</div>
            <button class="ghost" type="button" data-action="refresh-all"${this.state.refreshBusy ? ' disabled' : ''}>
              更新
            </button>
          </div>
        </section>

        ${renderStatusBanner(this.state.pageStatus, pageStatusIsError)}

        <section class="workspace-grid">
          <div class="primary-column">
            <section class="panel explorer-panel">
              <div class="explorer-head">
                <div>
                  <h2 class="section-title">保存済みグループ</h2>
                  <p class="section-copy">タブ名とグループ名で横断検索できます。</p>
                </div>
              </div>

              <div class="toolbar">
                <label class="field search-field">
                  <span class="field-label">検索</span>
                  <input
                    name="searchQuery"
                    type="search"
                    value="${escapeHtml(this.state.searchQuery)}"
                    placeholder="例: docs, supabase, design"
                  />
                </label>

                <label class="field compact-field">
                  <span class="field-label">並び順</span>
                  <select name="sortMode">
                    <option value="newest"${this.state.sortMode === 'newest' ? ' selected' : ''}>新しい順</option>
                    <option value="oldest"${this.state.sortMode === 'oldest' ? ' selected' : ''}>古い順</option>
                    <option value="tabCount"${this.state.sortMode === 'tabCount' ? ' selected' : ''}>タブ数順</option>
                  </select>
                </label>
              </div>

              <div class="filter-row">
                ${this.renderFilterButton('all', 'すべて')}
                ${this.renderFilterButton('saved', '未復元あり')}
                ${this.renderFilterButton('restored', '復元済みあり')}
                <div class="result-meta">${filteredGroups.length} groups</div>
              </div>

              ${renderGroupList({
                groups: filteredGroups,
                emptyLabel: 'まだ保存済みグループはありません。',
                expandedGroupIds: visibleExpandedGroupIds,
                collapsible: true,
                busy: this.state.actionBusy
              })}
            </section>
          </div>

          <aside class="side-column">
            ${renderSavePanel({
              title: this.state.groupTitle,
              status: this.state.saveStatus,
              windowBusy: this.state.saveWindowBusy,
              tabBusy: this.state.saveTabBusy
            })}
            ${renderAuthPanel({
              email: this.state.email,
              password: this.state.password,
              status: this.state.authStatus,
              busy: this.state.authBusy
            })}
            ${renderConfigPanel({
              supabaseUrl: this.state.config.supabaseUrl,
              supabaseKey: this.state.config.supabaseKey,
              ignoreDomainsText: this.state.ignoreDomainsText,
              ignoreTitlesText: this.state.ignoreTitlesText,
              busy: this.state.configBusy
            })}
          </aside>
        </section>
      </main>
    `;

    if (focus) {
      const next = this.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${focus.name}"]`);
      if (next) {
        next.focus();
        if (focus.start !== null && focus.end !== null && 'setSelectionRange' in next) {
          next.setSelectionRange(focus.start, focus.end);
        }
      }
    }
  }

  private async refreshAll() {
    this.state.refreshBusy = true;
    this.render();

    try {
      const nextConfig = await getConfig();
      this.setConfigFields(nextConfig);

      if (!nextConfig.supabaseUrl || !nextConfig.supabaseKey) {
        this.state.authStatus = 'Supabase 設定を入力してください。';
        this.state.pageStatus = '設定が未完了です。';
        this.state.allGroups = [];
        this.state.expandedGroupIds = [];
        return;
      }

      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        this.state.allGroups = [];
        this.state.expandedGroupIds = [];
        this.state.pageStatus = 'ログインすると保存済みグループを表示します。';
        return;
      }

      this.state.allGroups = await listGroups(false, user.id);
      this.state.expandedGroupIds = [];
      this.state.pageStatus = `${this.state.allGroups.length} グループを表示中`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.authStatus = `表示失敗: ${message}`;
      this.state.pageStatus = 'データを読み込めませんでした。';
      this.state.allGroups = [];
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private async runGroupAction(message: PopupActionMessage, successMessage: string) {
    if (this.state.actionBusy) return;

    this.state.actionBusy = true;
    this.render();

    try {
      const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>(message);
      if (!result?.ok) {
        throw new Error(result?.error ?? '操作に失敗しました。');
      }

      this.state.pageStatus = successMessage;
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `操作失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
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
    await this.refreshAll();
  }

  private async handleSaveConfig() {
    this.state.configBusy = true;
    this.render();

    try {
      const next = this.configPayload();
      await saveConfig(next);
      this.setConfigFields(next);
      this.state.pageStatus = '設定を保存しました。';
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `設定保存失敗: ${error instanceof Error ? error.message : String(error)}`;
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
      await this.refreshAll();
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
      await this.refreshAll();
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
      await this.refreshAll();
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

  private async handleRestore(groupId: string) {
    const group = this.findGroup(groupId);
    if (!group) return;

    await this.runGroupAction(
      {
        type: 'restore-group',
        groupId: group.id,
        urls: group.tabs.map((tab) => tab.url)
      },
      `「${group.title ?? '(untitled)'}」を復元しました。`
    );
  }

  private async handleDeleteGroup(groupId: string) {
    try {
      await deleteGroup(groupId);
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `削除失敗: ${error instanceof Error ? error.message : String(error)}`;
      this.render();
    }
  }

  private async handleOpenTab(tabId: string) {
    const resolved = this.findTab(tabId);
    if (!resolved) return;

    await this.runGroupAction(
      {
        type: 'open-saved-tab',
        tabId: resolved.tab.id,
        url: resolved.tab.url
      },
      'タブを開きました。'
    );
  }

  private toggleGroup(groupId: string) {
    if (this.state.expandedGroupIds.includes(groupId)) {
      this.state.expandedGroupIds = this.state.expandedGroupIds.filter((value) => value !== groupId);
    } else {
      this.state.expandedGroupIds = [...this.state.expandedGroupIds, groupId];
    }

    this.render();
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'searchQuery': {
        this.state.searchQuery = target.value;
        this.scheduleSearchRender({
          name: 'searchQuery',
          start: target.selectionStart,
          end: target.selectionEnd
        });
        break;
      }
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

  private handleChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.name === 'sortMode') {
      this.state.sortMode = target.value as SortMode;
      this.render();
    }
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
      case 'refresh-all':
        await this.refreshAll();
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
      case 'toggle-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          this.toggleGroup(groupId);
        }
        break;
      }
      case 'restore-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.handleRestore(groupId);
        }
        break;
      }
      case 'delete-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.handleDeleteGroup(groupId);
        }
        break;
      }
      case 'open-tab': {
        const tabId = actionTarget.dataset.tabId;
        if (tabId) {
          await this.handleOpenTab(tabId);
        }
        break;
      }
      case 'set-group-filter': {
        const value = actionTarget.dataset.value as GroupFilter | undefined;
        if (value) {
          this.state.groupFilter = value;
          this.render();
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
  throw new Error('Newtab root element was not found.');
}

const app = new NewtabApp(target);
void app.bootstrap();
