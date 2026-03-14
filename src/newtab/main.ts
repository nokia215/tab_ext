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

const LIGHTWEIGHT_GROUP_BATCH_SIZE = 12;

type GroupFilter = 'all' | 'saved' | 'restored';
type SortMode = 'newest' | 'oldest' | 'tabCount';
type UiMode = 'default' | 'lightweight';

interface RuntimeProfile {
  isAndroidFirefox: boolean;
  uiMode: UiMode;
}

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
  uiMode: UiMode;
  savePanelOpen: boolean;
  settingsPanelOpen: boolean;
  visibleGroupCount: number;
}

interface FocusState {
  name: string;
  start: number | null;
  end: number | null;
}

function detectRuntimeProfile(): RuntimeProfile {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const isAndroidFirefox = userAgent.includes('Android') && userAgent.includes('Firefox/');

  return {
    isAndroidFirefox,
    uiMode: isAndroidFirefox ? 'lightweight' : 'default'
  };
}

function createInitialState(runtimeProfile: RuntimeProfile): NewtabState {
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
    ignoreTitlesText: '',
    uiMode: runtimeProfile.uiMode,
    savePanelOpen: false,
    settingsPanelOpen: false,
    visibleGroupCount: runtimeProfile.uiMode === 'lightweight'
      ? LIGHTWEIGHT_GROUP_BATCH_SIZE
      : Number.MAX_SAFE_INTEGER
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
  private readonly runtimeProfile: RuntimeProfile;
  private state: NewtabState;
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement, runtimeProfile: RuntimeProfile) {
    this.root = root;
    this.runtimeProfile = runtimeProfile;
    this.state = createInitialState(runtimeProfile);
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

  private get isLightweightMode() {
    return this.state.uiMode === 'lightweight';
  }

  private get filteredGroups() {
    return filterGroups(this.state.allGroups, this.state.searchQuery)
      .filter((group) => matchesGroupFilter(group, this.state.groupFilter))
      .sort(sortGroups(this.state.sortMode));
  }

  private getVisibleGroups(groups: TabGroup[]) {
    return this.isLightweightMode
      ? groups.slice(0, this.state.visibleGroupCount)
      : groups;
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

  private renderMiniMetric(label: string, value: number) {
    return `
      <article class="mini-metric">
        <span class="mini-metric-label">${escapeHtml(label)}</span>
        <strong class="mini-metric-value">${value}</strong>
      </article>
    `;
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

  private resetVisibleGroupCount() {
    this.state.visibleGroupCount = this.isLightweightMode
      ? LIGHTWEIGHT_GROUP_BATCH_SIZE
      : Number.MAX_SAFE_INTEGER;
  }

  private toggleLightweightPanel(panel: 'save' | 'settings') {
    if (panel === 'save') {
      const nextOpen = !this.state.savePanelOpen;
      this.state.savePanelOpen = nextOpen;
      if (nextOpen) {
        this.state.settingsPanelOpen = false;
      }
    } else {
      const nextOpen = !this.state.settingsPanelOpen;
      this.state.settingsPanelOpen = nextOpen;
      if (nextOpen) {
        this.state.savePanelOpen = false;
      }
    }

    this.render();
  }

  private renderDefaultLayout(args: {
    filteredGroups: TabGroup[];
    visibleExpandedGroupIds: string[];
    summary: ReturnType<typeof summarizeGroups>;
    pageStatusIsError: boolean;
  }) {
    return `
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
              <p class="metric-value">${args.summary.totalTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Restored</p>
              <p class="metric-value">${args.summary.restoredTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Saved only</p>
              <p class="metric-value">${args.summary.savedTabs}</p>
            </article>
            <article class="metric-card">
              <p class="metric-label">Devices</p>
              <p class="metric-value">${args.summary.deviceCount}</p>
            </article>
          </div>

          <div class="actions">
            <div class="badge">${escapeHtml(this.state.authStatus)}</div>
            <button class="ghost" type="button" data-action="refresh-all"${this.state.refreshBusy ? ' disabled' : ''}>
              更新
            </button>
          </div>
        </section>

        ${renderStatusBanner(this.state.pageStatus, args.pageStatusIsError)}

        <section class="workspace-grid">
          <div class="primary-column">
            <section class="panel explorer-panel">
              <div class="explorer-head">
                <div>
                  <h2 class="section-title">保存済みグループ</h2>
                  <p class="section-copy">タブ名、URL、グループ名、端末名で横断検索できます。</p>
                </div>
              </div>

              <div class="toolbar">
                <label class="field search-field">
                  <span class="field-label">検索</span>
                  <input
                    name="searchQuery"
                    type="search"
                    value="${escapeHtml(this.state.searchQuery)}"
                    placeholder="例: docs, github.com, Firefox Android"
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
                <div class="result-meta">${args.filteredGroups.length} groups</div>
              </div>

              ${renderGroupList({
                groups: args.filteredGroups,
                emptyLabel: 'まだ保存済みグループはありません。',
                expandedGroupIds: args.visibleExpandedGroupIds,
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
  }

  private renderLightweightLayout(args: {
    filteredGroups: TabGroup[];
    visibleGroups: TabGroup[];
    visibleExpandedGroupIds: string[];
    summary: ReturnType<typeof summarizeGroups>;
    pageStatusIsError: boolean;
  }) {
    const remainingCount = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0);
    const loadMoreLabel = remainingCount > LIGHTWEIGHT_GROUP_BATCH_SIZE
      ? `さらに ${LIGHTWEIGHT_GROUP_BATCH_SIZE} 件表示`
      : `残り ${remainingCount} 件を表示`;

    return `
      <main class="shell page-shell lightweight-shell">
        <section class="panel lightweight-hero">
          <div class="lightweight-hero-top">
            <div>
              <p class="hero-kicker">Tab Saver Lite</p>
              <h1>軽量ダッシュボード</h1>
              <p class="muted">
                Android 版 Firefox ではスクロールを優先し、描画負荷の低い構成に切り替えています。
              </p>
            </div>

            <div class="actions lightweight-actions">
              <div class="badge accent-badge">Android Firefox 軽量表示</div>
              <div class="badge">${escapeHtml(this.state.authStatus)}</div>
              <button class="ghost" type="button" data-action="refresh-all"${this.state.refreshBusy ? ' disabled' : ''}>
                更新
              </button>
            </div>
          </div>

          <div class="lightweight-summary">
            ${this.renderMiniMetric('Groups', this.state.allGroups.length)}
            ${this.renderMiniMetric('Tabs', args.summary.totalTabs)}
            ${this.renderMiniMetric('Devices', args.summary.deviceCount)}
          </div>
        </section>

        ${renderStatusBanner(this.state.pageStatus, args.pageStatusIsError)}

        <section class="panel lightweight-explorer">
          <div class="explorer-head">
            <div>
              <h2 class="section-title">保存済みグループ</h2>
              <p class="section-copy">検索対象はタブ名、URL、グループ名、端末名です。</p>
            </div>
          </div>

          <div class="toolbar compact-toolbar">
            <label class="field search-field">
              <span class="field-label">検索</span>
              <input
                name="searchQuery"
                type="search"
                value="${escapeHtml(this.state.searchQuery)}"
                placeholder="例: docs, github.com, Firefox Android"
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
            <div class="result-meta">${args.visibleGroups.length} / ${args.filteredGroups.length} groups</div>
          </div>

          ${renderGroupList({
            groups: args.visibleGroups,
            emptyLabel: 'まだ保存済みグループはありません。',
            expandedGroupIds: args.visibleExpandedGroupIds,
            collapsible: true,
            busy: this.state.actionBusy
          })}

          ${
            remainingCount > 0
              ? `
                <div class="load-more-row">
                  <button class="secondary" type="button" data-action="show-more-groups">
                    ${loadMoreLabel}
                  </button>
                  <p class="result-meta">${remainingCount} groups remaining</p>
                </div>
              `
              : ''
          }
        </section>

        <section class="lightweight-panel-stack">
          <section class="panel lightweight-utility-panel">
            <div>
              <h2 class="section-title">管理パネル</h2>
              <p class="section-copy">保存や設定は必要なときだけ展開し、スクロール負荷を抑えます。</p>
            </div>

            <div class="actions">
              <button
                class="${this.state.savePanelOpen ? '' : 'secondary'}"
                type="button"
                data-action="toggle-save-panel"
              >
                ${this.state.savePanelOpen ? '保存パネルを閉じる' : '保存パネルを開く'}
              </button>
              <button
                class="${this.state.settingsPanelOpen ? '' : 'ghost'}"
                type="button"
                data-action="toggle-settings-panel"
              >
                ${this.state.settingsPanelOpen ? '設定と認証を閉じる' : '設定と認証を開く'}
              </button>
            </div>
          </section>

          ${
            this.state.savePanelOpen
              ? renderSavePanel({
                  title: this.state.groupTitle,
                  status: this.state.saveStatus,
                  windowBusy: this.state.saveWindowBusy,
                  tabBusy: this.state.saveTabBusy
                })
              : ''
          }

          ${
            this.state.settingsPanelOpen
              ? `
                <section class="lightweight-settings-grid">
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
                </section>
              `
              : ''
          }
        </section>
      </main>
    `;
  }

  private render(focus?: FocusState) {
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Dashboard';
    document.body.classList.toggle('lightweight-ui', this.isLightweightMode);
    document.body.classList.toggle('android-firefox-ui', this.runtimeProfile.isAndroidFirefox);

    const pageStatusIsError = this.state.pageStatus.includes('失敗') || this.state.pageStatus === 'データを読み込めませんでした。';
    const summary = this.summary;
    const filteredGroups = this.filteredGroups;
    const visibleGroups = this.getVisibleGroups(filteredGroups);
    const visibleExpandedGroupIds = this.getVisibleExpandedGroupIds(visibleGroups);

    this.root.innerHTML = this.isLightweightMode
      ? this.renderLightweightLayout({
          filteredGroups,
          visibleGroups,
          visibleExpandedGroupIds,
          summary,
          pageStatusIsError
        })
      : this.renderDefaultLayout({
          filteredGroups,
          visibleExpandedGroupIds,
          summary,
          pageStatusIsError
        });

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
        this.resetVisibleGroupCount();
        return;
      }

      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        this.state.allGroups = [];
        this.state.expandedGroupIds = [];
        this.state.pageStatus = 'ログインすると保存済みグループを表示します。';
        this.resetVisibleGroupCount();
        return;
      }

      this.state.allGroups = await listGroups(false, user.id);
      this.state.expandedGroupIds = [];
      this.state.pageStatus = `${this.state.allGroups.length} グループを表示中`;
      this.resetVisibleGroupCount();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.state.authStatus = `表示失敗: ${message}`;
      this.state.pageStatus = 'データを読み込めませんでした。';
      this.state.allGroups = [];
      this.resetVisibleGroupCount();
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
    if (this.isLightweightMode) {
      this.state.expandedGroupIds = this.state.expandedGroupIds.includes(groupId) ? [] : [groupId];
      this.render();
      return;
    }

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
        this.resetVisibleGroupCount();
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
      this.resetVisibleGroupCount();
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
          this.resetVisibleGroupCount();
          this.render();
        }
        break;
      }
      case 'show-more-groups':
        this.state.visibleGroupCount += LIGHTWEIGHT_GROUP_BATCH_SIZE;
        this.render();
        break;
      case 'toggle-save-panel':
        this.toggleLightweightPanel('save');
        break;
      case 'toggle-settings-panel':
        this.toggleLightweightPanel('settings');
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Newtab root element was not found.');
}

const runtimeProfile = detectRuntimeProfile();
const app = new NewtabApp(target, runtimeProfile);
void app.bootstrap();
