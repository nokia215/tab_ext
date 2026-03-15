import '../shared/ui.css';
import '../shared/panels.css';
import './newtab.css';
import { runtimeSendMessage } from '../shared/browser-api';
import { lineListToText, textToLineList } from '../shared/format';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
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
import {
  LIGHTWEIGHT_GROUP_BATCH_SIZE,
  createInitialState,
  detectRuntimeProfile,
  matchesGroupFilter,
  sortGroups,
  summarizeGroups,
  type FocusState,
  type GroupFilter,
  type NewtabState,
  type RuntimeProfile,
  type SortMode
} from './model';
import { renderNewtabView } from './view';

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

  private get summary() {
    return summarizeGroups(this.state.allGroups);
  }

  private get pageStatusIsError() {
    return this.state.pageStatus.includes('失敗') || this.state.pageStatus === 'データを読み込めませんでした。';
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

  private reconcileExpandedGroupIds(groups: TabGroup[]) {
    const groupIds = new Set(groups.map((group) => group.id));
    const expandedGroupIds = this.state.expandedGroupIds.filter((groupId) => groupIds.has(groupId));

    this.state.expandedGroupIds = this.isLightweightMode
      ? expandedGroupIds.slice(0, 1)
      : expandedGroupIds;
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

  private render(focus?: FocusState) {
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Dashboard';
    document.body.classList.toggle('lightweight-ui', this.isLightweightMode);
    document.body.classList.toggle('android-firefox-ui', this.runtimeProfile.isAndroidFirefox);

    const filteredGroups = this.filteredGroups;
    const visibleGroups = this.getVisibleGroups(filteredGroups);
    const visibleExpandedGroupIds = this.getVisibleExpandedGroupIds(visibleGroups);

    this.root.innerHTML = renderNewtabView({
      state: this.state,
      summary: this.summary,
      filteredGroups,
      visibleGroups,
      visibleExpandedGroupIds,
      pageStatusIsError: this.pageStatusIsError
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

      const expandedGroupIds = [...this.state.expandedGroupIds];
      this.state.allGroups = await listGroups(false, user.id);
      this.state.expandedGroupIds = expandedGroupIds;
      this.reconcileExpandedGroupIds(this.state.allGroups);
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

  private handleSearchInput(target: HTMLInputElement | HTMLTextAreaElement) {
    this.state.searchQuery = target.value;
    this.resetVisibleGroupCount();
    this.scheduleSearchRender({
      name: 'searchQuery',
      start: target.selectionStart,
      end: target.selectionEnd
    });
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'searchQuery':
        this.handleSearchInput(target);
        break;
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
