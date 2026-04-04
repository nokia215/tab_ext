import '../shared/ui.css';
import '../shared/panels.css';
import '../newtab/newtab.css';
import './tablet.css';
import { lineListToText, textToLineList } from '../shared/format';
import { importTabGroups } from '../shared/import';
import { filterGroups } from '../shared/search';
import { formatImportStatus, getErrorMessage, isErrorStatus } from '../shared/status';
import { getConfig, saveConfig } from '../shared/storage';
import {
  buildDefaultGroupTitle,
  deleteGroup,
  deleteSavedTab,
  getCurrentSessionUser,
  listGroups,
  markGroupRestored,
  signIn,
  signOut,
  signUp,
  updateGroupTitle
} from '../shared/supabase';
import { openSavedTab, restoreTabs } from '../shared/tabs';
import type { AppConfig, TabGroup } from '../shared/types';
import {
  LIGHTWEIGHT_GROUP_BATCH_SIZE,
  createInitialState,
  matchesGroupFilter,
  sortGroups,
  summarizeGroups,
  type FocusState,
  type NewtabState
} from '../newtab/model';
import { renderTabletView } from './view';

class TabletApp {
  private readonly root: HTMLElement;
  private state: NewtabState;
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = createInitialState({ isAndroidFirefox: false, uiMode: 'lightweight' });
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

  private get summary() {
    return summarizeGroups(this.state.allGroups);
  }

  private get pageStatusIsError() {
    return isErrorStatus(this.state.pageStatus);
  }

  private getVisibleGroups(groups: TabGroup[]) {
    return groups.slice(0, this.state.visibleGroupCount);
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
    this.state.visibleGroupCount = LIGHTWEIGHT_GROUP_BATCH_SIZE;
  }

  private reconcileExpandedGroupIds(groups: TabGroup[]) {
    const groupIds = new Set(groups.map((group) => group.id));
    this.state.expandedGroupIds = this.state.expandedGroupIds
      .filter((groupId) => groupIds.has(groupId))
      .slice(0, 1);
  }

  private startEditingGroupTitle(groupId: string) {
    const group = this.findGroup(groupId);
    if (!group) return;

    const title = group.title ?? '';
    this.state.editingGroupId = groupId;
    this.state.editingGroupTitle = title;
    this.render({
      name: 'groupTitleEdit',
      start: title.length,
      end: title.length
    });
  }

  private stopEditingGroupTitle() {
    this.state.editingGroupId = null;
    this.state.editingGroupTitle = '';
  }

  private async handleSaveGroupTitle(groupId: string) {
    if (this.state.actionBusy || this.state.editingGroupId !== groupId) return;
    const group = this.findGroup(groupId);
    if (!group) return;

    this.state.actionBusy = true;
    this.render();

    try {
      const resolvedTitle = this.state.editingGroupTitle.trim()
        || buildDefaultGroupTitle(group.device_id, group.tabs.length);

      await updateGroupTitle(groupId, resolvedTitle);
      this.stopEditingGroupTitle();
      this.state.pageStatus = 'グループ名を更新しました。';
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `グループ名更新失敗: ${getErrorMessage(error)}`;
      this.render({
        name: 'groupTitleEdit',
        start: this.state.editingGroupTitle.length,
        end: this.state.editingGroupTitle.length
      });
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private render(focus?: FocusState) {
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Tablet';
    document.body.classList.add('lightweight-ui');

    const filteredGroups = this.filteredGroups;
    const visibleGroups = this.getVisibleGroups(filteredGroups);
    const visibleExpandedGroupIds = this.getVisibleExpandedGroupIds(visibleGroups);

    this.root.innerHTML = renderTabletView({
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
        this.stopEditingGroupTitle();
        this.resetVisibleGroupCount();
        return;
      }

      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        this.state.allGroups = [];
        this.state.expandedGroupIds = [];
        this.stopEditingGroupTitle();
        this.state.pageStatus = 'ログインすると保存済みグループを表示します。';
        this.resetVisibleGroupCount();
        return;
      }

      const expandedGroupIds = [...this.state.expandedGroupIds];
      this.state.allGroups = await listGroups(false, user.id);
      this.state.expandedGroupIds = expandedGroupIds;
      this.reconcileExpandedGroupIds(this.state.allGroups);
      if (this.state.editingGroupId && !this.findGroup(this.state.editingGroupId)) {
        this.stopEditingGroupTitle();
      }
      this.state.pageStatus = `${this.state.allGroups.length} グループを表示中`;
      this.resetVisibleGroupCount();
    } catch (error) {
      const message = getErrorMessage(error);
      this.state.authStatus = `表示失敗: ${message}`;
      this.state.pageStatus = 'データを読み込めませんでした。';
      this.state.allGroups = [];
      this.stopEditingGroupTitle();
      this.resetVisibleGroupCount();
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private async handleImportTabs() {
    if (this.state.importBusy) return;

    this.state.importBusy = true;
    this.render();

    try {
      const { importedGroupCount, importedTabCount, skippedLineCount } = await importTabGroups({
        groupTitle: this.state.groupTitle,
        importText: this.state.importText
      });

      this.state.importText = '';
      this.state.saveStatus = formatImportStatus(importedGroupCount, importedTabCount, skippedLineCount);
      await this.refreshAll();
    } catch (error) {
      this.state.saveStatus = `インポート失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.importBusy = false;
      this.render();
    }
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
      this.state.pageStatus = `設定保存失敗: ${getErrorMessage(error)}`;
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
      this.state.authStatus = `登録失敗: ${getErrorMessage(error)}`;
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
      this.state.authStatus = `ログイン失敗: ${getErrorMessage(error)}`;
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
      this.state.authStatus = `ログアウト失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleRestore(groupId: string) {
    const group = this.findGroup(groupId);
    if (!group || this.state.actionBusy) return;

    this.state.actionBusy = true;
    this.render();

    try {
      await restoreTabs(group.tabs.map((tab) => tab.url));
      await markGroupRestored(group.id);
      this.state.pageStatus = `「${group.title ?? '(untitled)'}」を復元しました。`;
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `復元失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleDeleteGroup(groupId: string) {
    try {
      await deleteGroup(groupId);
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `削除失敗: ${getErrorMessage(error)}`;
      this.render();
    }
  }

  private async handleOpenTab(tabId: string) {
    const resolved = this.findTab(tabId);
    if (!resolved || this.state.actionBusy) return;

    this.state.actionBusy = true;
    this.render();

    try {
      await openSavedTab(resolved.tab.url);
      await deleteSavedTab(resolved.tab.id);
      this.state.pageStatus = `「${resolved.tab.title || '(no title)'}」を開きました。`;
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `タブを開けませんでした: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'searchQuery':
        this.state.searchQuery = target.value;
        this.scheduleSearchRender({
          name: 'searchQuery',
          start: target.selectionStart,
          end: target.selectionEnd
        });
        return;
      case 'groupTitle':
        this.state.groupTitle = target.value;
        break;
      case 'groupTitleEdit':
        this.state.editingGroupTitle = target.value;
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

  private handleChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.name === 'sortMode') {
      this.state.sortMode = target.value as NewtabState['sortMode'];
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
    const groupId = actionTarget.dataset.groupId;
    const tabId = actionTarget.dataset.tabId;

    switch (action) {
      case 'refresh-all':
        await this.refreshAll();
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
      case 'set-group-filter':
        this.state.groupFilter = (actionTarget.dataset.value as NewtabState['groupFilter']) ?? 'all';
        this.render();
        break;
      case 'toggle-group':
        if (!groupId) break;
        this.state.expandedGroupIds = this.state.expandedGroupIds.includes(groupId) ? [] : [groupId];
        this.render();
        break;
      case 'restore-group':
        if (!groupId) break;
        await this.handleRestore(groupId);
        break;
      case 'delete-group':
        if (!groupId) break;
        await this.handleDeleteGroup(groupId);
        break;
      case 'open-tab':
        if (!tabId) break;
        await this.handleOpenTab(tabId);
        break;
      case 'edit-group-title':
        if (!groupId) break;
        this.startEditingGroupTitle(groupId);
        break;
      case 'cancel-edit-group-title':
        this.stopEditingGroupTitle();
        this.render();
        break;
      case 'save-group-title':
        if (!groupId) break;
        await this.handleSaveGroupTitle(groupId);
        break;
      case 'show-more-groups':
        this.state.visibleGroupCount += LIGHTWEIGHT_GROUP_BATCH_SIZE;
        this.render();
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Tablet root element was not found.');
}

const app = new TabletApp(target);
void app.bootstrap();
