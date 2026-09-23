import { hidePendingTabs, retryPendingConsumption, prepareWebRestore, restoreSavedTabs } from '../shared/restoration';
import '../shared/ui.css';
import '../shared/panels.css';
import '../newtab/newtab.css';
import './tablet.css';
import { copyTextToClipboard, formatGroupForExport, formatGroupsForExport } from '../shared/export';
import { countFavoriteGroups, removeFavoriteGroupIds } from '../shared/favorites';
import { configFromFormFields, configToFormFields } from '../shared/config-form';
import { isStaleGroupByAge } from '../shared/group-age';
import { mergeGroupIds, reconcileGroupIds, resolveGroupsByIds, toggleGroupId, updateGroup as updateGroupCollection } from '../shared/group-helpers';
import {
  reconcileExpandedGroupIds,
  removeGroupsFromCollection,
  resetVisibleGroupCount,
  visibleGroups
} from '../shared/group-state';
import { summarizeGroupCollection } from '../shared/group-summary';
import { importTabGroups } from '../shared/import';
import { formatImportStatus, getErrorMessage, isErrorStatus } from '../shared/status';
import { getConfig, saveConfig } from '../shared/storage';
import {
  buildDefaultGroupTitle,
  deleteGroup,
  getCurrentSessionUser,
  getFavoriteGroupIds,
  listGroups,
  setGroupFavorite,
  setGroupFixed,
  signIn,
  signOut,
  signUp,
  updateGroupTitle
} from '../shared/supabase';
import type { AppConfig, TabGroup } from '../shared/types';
import {
  LIGHTWEIGHT_GROUP_BATCH_SIZE,
  collectDeviceFilterOptions,
  countStaleGroups,
  createInitialState,
  isDashboardBusy,
  queryGroups,
  summarizeSelectedGroups,
  type FocusState,
  type DashboardState
} from '../shared/dashboard-model';
import { renderTabletView } from './view';

class TabletApp {
  private readonly root: HTMLElement;
  private state: DashboardState;
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
    return queryGroups(this.state.allGroups, this.state);
  }

  private get summary() {
    return summarizeGroupCollection(this.state.allGroups);
  }

  private get favoriteGroupCount() {
    return countFavoriteGroups(this.state.allGroups, this.state.favoriteGroupIds);
  }

  private get selectedSummary() {
    return summarizeSelectedGroups(this.state.allGroups, this.state.selectedGroupIds);
  }

  private get deviceFilterOptions() {
    return collectDeviceFilterOptions(this.state.allGroups);
  }

  private get staleSelectableCount() {
    return countStaleGroups(this.bulkSelectableGroups);
  }

  private get filteredStaleGroupCount() {
    return countStaleGroups(this.filteredGroups);
  }

  private get pageStatusIsError() {
    return isErrorStatus(this.state.pageStatus);
  }

  private getVisibleGroups(groups: TabGroup[]) {
    return visibleGroups(groups, this.state.visibleGroupCount);
  }

  private getVisibleExpandedGroupIds(groups: TabGroup[]) {
    return reconcileGroupIds(this.state.expandedGroupIds, groups);
  }

  private get bulkSelectableGroups() {
    return this.getVisibleGroups(this.filteredGroups);
  }

  private removeDeletedFavoriteGroups(groupIds: string[]) {
    this.state.favoriteGroupIds = removeFavoriteGroupIds(this.state.favoriteGroupIds, groupIds);
  }

  private setConfigFields(next: AppConfig) {
    Object.assign(this.state, configToFormFields(next));
  }

  private findGroup(groupId: string) {
    return this.state.allGroups.find((group) => group.id === groupId);
  }

  private updateGroup(groupId: string, update: (group: TabGroup) => TabGroup) {
    this.state.allGroups = updateGroupCollection(this.state.allGroups, groupId, update);
  }

  private getSelectedGroups() {
    return resolveGroupsByIds(this.state.allGroups, this.state.selectedGroupIds);
  }

  private removeGroupsFromState(groupIds: string[]) {
    this.state.allGroups = removeGroupsFromCollection(this.state.allGroups, groupIds);
    this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, this.state.allGroups);
    this.reconcileExpandedGroupIds(this.state.allGroups);
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
    resetVisibleGroupCount(this.state, LIGHTWEIGHT_GROUP_BATCH_SIZE);
  }

  private reconcileExpandedGroupIds(groups: TabGroup[]) {
    this.state.expandedGroupIds = reconcileExpandedGroupIds(this.state.expandedGroupIds, groups, 1);
  }

  private reconcileSelectedGroupIds(groups: TabGroup[]) {
    this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, groups);
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

    try {
      const resolvedTitle = this.state.editingGroupTitle.trim()
        || buildDefaultGroupTitle(group.device_id, group.tabs.length);

      this.updateGroup(groupId, (item) => ({ ...item, title: resolvedTitle }));
      this.stopEditingGroupTitle();
      this.state.pageStatus = 'グループ名を保存しています。';
      this.render();
      await updateGroupTitle(groupId, resolvedTitle);
      this.state.pageStatus = 'グループ名を更新しました。';
    } catch (error) {
      this.updateGroup(groupId, (item) => ({ ...item, title: group.title }));
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
      selectedSummary: this.selectedSummary,
      bulkSelectableCount: this.bulkSelectableGroups.length,
      staleSelectableCount: this.staleSelectableCount,
      filteredStaleGroupCount: this.filteredStaleGroupCount,
      staleSelectLabel: '表示中の30日以上を選択',
      favoriteGroupCount: this.favoriteGroupCount,
      deviceFilterOptions: this.deviceFilterOptions,
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
    if (this.state.actionBusy || this.state.refreshBusy) return;
    this.state.refreshBusy = true;
    this.render();

    try {
      const nextConfig = await getConfig();
      this.setConfigFields(nextConfig);

      if (!nextConfig.supabaseUrl || !nextConfig.supabaseKey) {
        this.state.authStatus = 'Supabase 設定を入力してください。';
        this.state.pageStatus = '設定が未完了です。';
        this.state.favoriteGroupIds = [];
        this.state.allGroups = [];
        this.state.selectedGroupIds = [];
        this.state.expandedGroupIds = [];
        this.stopEditingGroupTitle();
        this.resetVisibleGroupCount();
        return;
      }

      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        this.state.favoriteGroupIds = [];
        this.state.allGroups = [];
        this.state.selectedGroupIds = [];
        this.state.expandedGroupIds = [];
        this.stopEditingGroupTitle();
        this.state.pageStatus = 'ログインすると保存済みグループを表示します。';
        this.resetVisibleGroupCount();
        return;
      }

      const pending = await retryPendingConsumption();
      this.state.favoriteGroupIds = await getFavoriteGroupIds(user.id);
      const expandedGroupIds = [...this.state.expandedGroupIds];
      this.state.allGroups = hidePendingTabs(await listGroups(user.id), pending.pendingTabIds);
      this.state.expandedGroupIds = expandedGroupIds;
      this.reconcileExpandedGroupIds(this.state.allGroups);
      this.reconcileSelectedGroupIds(this.state.allGroups);
      if (this.state.editingGroupId && !this.findGroup(this.state.editingGroupId)) {
        this.stopEditingGroupTitle();
      }
      this.state.pageStatus = pending.error ?? `${this.state.allGroups.length} グループを表示中`;
      this.resetVisibleGroupCount();
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      this.state.authStatus = `表示失敗: ${message}`;
      this.state.pageStatus = 'データを読み込めませんでした。';
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
      const { importedGroupCount, importedTabCount, skippedLineCount, duplicateCount } = await importTabGroups({
        groupTitle: this.state.groupTitle,
        groupId: this.state.saveGroupId,
        importText: this.state.importText
      });

      this.state.importText = '';
      this.state.saveStatus = formatImportStatus(importedGroupCount, importedTabCount, skippedLineCount, duplicateCount);
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
      const next = configFromFormFields(this.state);
      await saveConfig(next);
      this.setConfigFields(next);
      this.state.pageStatus = '設定を保存しました。';
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.stopEditingGroupTitle();
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
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.stopEditingGroupTitle();
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
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.stopEditingGroupTitle();
      await this.refreshAll();
    } catch (error) {
      this.state.authStatus = `ログアウト失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleRestoreGroups(groups: TabGroup[], tabId?: string) {
    if (this.state.actionBusy || this.state.refreshBusy || groups.length === 0) return;
    const requests = groups.map((group) => ({ group, ids: group.tabs
      .filter((tab) => !tabId || tab.id === tabId).map((tab) => tab.id) }));
    const selected = [...this.state.selectedGroupIds];
    const expanded = [...this.state.expandedGroupIds];
    const web = prepareWebRestore(requests.reduce((sum, request) => sum + request.ids.length, 0));
    this.state.actionBusy = true;
    for (const { group, ids } of requests) {
      if (!group.is_fixed) this.state.allGroups = hidePendingTabs(this.state.allGroups, ids);
    }
    this.state.pageStatus = '復元しています。';
    this.render();
    let completed = 0;
    let opened = 0;
    try {
      for (const { group, ids } of requests) {
        const result = await restoreSavedTabs(group.id, ids, !tabId, web.open);
        this.state.allGroups = this.state.allGroups.filter((item) => item.id !== group.id);
        if (result.group) this.state.allGroups.push(result.group);
        completed += 1;
        opened += result.openedTabIds.length;
        if (result.error) throw new Error(result.error);
      }
      this.state.selectedGroupIds = this.state.selectedGroupIds.filter((id) => !groups.some((group) => group.id === id));
      this.state.pageStatus = `${opened} タブを復元しました。固定グループの内容は保持しました。`;
    } catch (error) {
      for (const { group } of requests.slice(completed)) {
        this.state.allGroups = this.state.allGroups.filter((item) => item.id !== group.id);
        this.state.allGroups.push(group);
      }
      this.state.selectedGroupIds = selected;
      this.state.pageStatus = `${opened} タブ復元 / ${getErrorMessage(error)}`;
    } finally {
      web.closeUnused();
      this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, this.state.allGroups);
      this.state.expandedGroupIds = reconcileGroupIds(expanded, this.state.allGroups);
      this.state.favoriteGroupIds = reconcileGroupIds(this.state.favoriteGroupIds, this.state.allGroups);
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleRestore(groupId: string) {
    const group = this.findGroup(groupId);
    if (group) await this.handleRestoreGroups([group]);
  }

  private async handleDeleteGroup(groupId: string) {
    if (this.state.actionBusy) return;

    const previous = this.findGroup(groupId);
    if (!previous) return;
    const wasFavorite = this.state.favoriteGroupIds.includes(groupId);
    if (!window.confirm(`1 グループ / ${previous.tabs.length} タブを削除します。固定グループも削除されます。よろしいですか？`)) return;
    this.state.actionBusy = true;
    this.removeDeletedFavoriteGroups([groupId]);
    this.removeGroupsFromState([groupId]);
    this.state.pageStatus = 'グループを削除しています。';
    this.render();

    try {
      await deleteGroup(groupId);
      this.state.pageStatus = 'グループを削除しました。';
    } catch (error) {
      this.state.allGroups = [previous, ...this.state.allGroups];
      if (wasFavorite) this.state.favoriteGroupIds = [...this.state.favoriteGroupIds, groupId];
      this.state.pageStatus = `削除失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleOpenTab(tabId: string) {
    const resolved = this.findTab(tabId);
    if (resolved) await this.handleRestoreGroups([resolved.group], tabId);
  }

  private async handleCopyGroup(groupId: string) {
    if (this.state.actionBusy) return;

    const group = this.findGroup(groupId);
    if (!group) return;

    try {
      await copyTextToClipboard(formatGroupForExport(group));
      this.state.pageStatus = `「${group.title ?? '(untitled)'}」のURLをコピーしました。`;
    } catch (error) {
      this.state.pageStatus = `コピー失敗: ${getErrorMessage(error)}`;
    } finally {
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

  private toggleGroupSelection(groupId: string) {
    this.state.selectedGroupIds = toggleGroupId(this.state.selectedGroupIds, groupId);
    this.render();
  }

  private toggleFavoriteOnly() {
    this.state.favoriteOnly = !this.state.favoriteOnly;
    this.resetVisibleGroupCount();
    this.render();
  }

  private async handleToggleFixedGroup(groupId: string) {
    if (this.state.actionBusy || this.state.refreshBusy) return;
    const group = this.findGroup(groupId);
    if (!group) return;
    this.state.actionBusy = true;
    this.updateGroup(groupId, (item) => ({ ...item, is_fixed: !group.is_fixed }));
    this.state.pageStatus = '固定設定を保存しています。';
    this.render();
    try {
      await setGroupFixed(groupId, !group.is_fixed);
      this.state.pageStatus = group.is_fixed ? '固定を解除しました。次の復元から削除します。' : '固定しました。復元後も内容を保持します。';
    } catch (error) {
      this.updateGroup(groupId, () => group);
      this.state.pageStatus = `固定設定の保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleToggleFavoriteGroup(groupId: string) {
    if (this.state.actionBusy) return;

    const group = this.findGroup(groupId);
    if (!group) return;

    const favorite = !this.state.favoriteGroupIds.includes(groupId);
    this.state.actionBusy = true;
    this.state.favoriteGroupIds = favorite
      ? [...this.state.favoriteGroupIds, groupId]
      : this.state.favoriteGroupIds.filter((id) => id !== groupId);
    this.render();
    try {
      await setGroupFavorite(groupId, favorite);
      this.state.pageStatus = favorite
        ? `「${group.title ?? '(untitled)'}」をお気に入りに追加しました。`
        : `「${group.title ?? '(untitled)'}」をお気に入りから外しました。`;
    } catch (error) {
      this.state.favoriteGroupIds = favorite
        ? this.state.favoriteGroupIds.filter((id) => id !== groupId)
        : [...this.state.favoriteGroupIds, groupId];
      this.state.pageStatus = `お気に入りの更新失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private selectVisibleGroups() {
    this.state.selectedGroupIds = mergeGroupIds(this.state.selectedGroupIds, this.bulkSelectableGroups);
    this.render();
  }

  private selectStaleGroups() {
    const staleGroups = this.bulkSelectableGroups.filter((group) => isStaleGroupByAge(group));

    if (staleGroups.length === 0) {
      return;
    }

    this.state.selectedGroupIds = mergeGroupIds(this.state.selectedGroupIds, staleGroups);
    this.state.pageStatus = `30日以上の ${staleGroups.length} グループを選択しました。`;
    this.render();
  }

  private clearGroupSelection() {
    if (this.state.selectedGroupIds.length === 0) {
      return;
    }

    this.state.selectedGroupIds = [];
    this.render();
  }

  private async handleRestoreSelectedGroups() {
    await this.handleRestoreGroups(this.getSelectedGroups().filter((group) => group.tabs.length > 0));
  }

  private setGroupFilter(filter: DashboardState['groupFilter']) {
    this.state.groupFilter = filter === 'fixed' ? 'fixed' : 'all';
    this.resetVisibleGroupCount();
    this.stopEditingGroupTitle();
    this.render();
  }

  private async handleDeleteSelectedGroups() {
    if (this.state.actionBusy) return;

    const groups = this.getSelectedGroups();
    if (groups.length === 0) return;

    if (!window.confirm(`${groups.length} グループ / ${groups.reduce((sum, group) => sum + group.tabs.length, 0)} タブを削除します。固定グループも削除されます。よろしいですか？`)) return;
    const previousFavoriteIds = [...this.state.favoriteGroupIds];
    this.state.actionBusy = true;
    this.removeDeletedFavoriteGroups(groups.map((group) => group.id));
    this.removeGroupsFromState(groups.map((group) => group.id));
    this.state.selectedGroupIds = [];
    this.state.pageStatus = `${groups.length} グループを削除しています。`;
    this.render();

    let deletedCount = 0;

    try {
      for (const group of groups) {
        await deleteGroup(group.id);
        deletedCount += 1;
      }

      this.state.pageStatus = `${deletedCount} グループを削除しました。`;
      this.render();
    } catch (error) {
      const failedAndPending = groups.slice(deletedCount);
      this.state.allGroups = [...failedAndPending, ...this.state.allGroups];
      this.state.favoriteGroupIds = [
        ...this.state.favoriteGroupIds,
        ...previousFavoriteIds.filter((id) => failedAndPending.some((group) => group.id === id))
      ];
      this.state.pageStatus = deletedCount > 0
        ? `${deletedCount} グループ削除後に失敗: ${getErrorMessage(error)}`
        : `一括削除失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  private async handleCopySelectedGroups() {
    if (this.state.actionBusy) return;

    const groups = this.getSelectedGroups();
    if (groups.length === 0) return;

    try {
      await copyTextToClipboard(formatGroupsForExport(groups));
      const tabCount = groups.reduce((total, group) => total + group.tabs.length, 0);
      this.state.pageStatus = `${groups.length} グループ / ${tabCount} タブのURLをコピーしました。`;
    } catch (error) {
      this.state.pageStatus = `コピー失敗: ${getErrorMessage(error)}`;
    } finally {
      this.render();
    }
  }

  private handleChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.name === 'saveGroupId') {
      this.state.saveGroupId = target.value;
      this.render();
      return;
    }

    if (target.name === 'sortMode') {
      this.state.sortMode = target.value as DashboardState['sortMode'];
      this.resetVisibleGroupCount();
      this.render();
      return;
    }

    if (target.name === 'deviceFilter') {
      this.state.deviceFilter = target.value;
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
    const groupId = actionTarget.dataset.groupId;
    const tabId = actionTarget.dataset.tabId;
    const busy = isDashboardBusy(this.state);
    if (busy && !['set-group-filter', 'set-date-range-filter', 'toggle-favorite-only', 'toggle-group', 'show-more-groups'].includes(action ?? '')) return;

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
        await this.setGroupFilter((actionTarget.dataset.value as DashboardState['groupFilter']) ?? 'all');
        break;
      case 'set-date-range-filter':
        this.state.dateRangeFilter = (actionTarget.dataset.value as DashboardState['dateRangeFilter']) ?? 'all';
        this.resetVisibleGroupCount();
        this.render();
        break;
      case 'toggle-favorite-only':
        this.toggleFavoriteOnly();
        break;
      case 'toggle-group':
        if (!groupId) break;
        this.state.expandedGroupIds = this.state.expandedGroupIds.includes(groupId) ? [] : [groupId];
        this.render();
        break;
      case 'toggle-group-selection':
        if (!groupId) break;
        this.toggleGroupSelection(groupId);
        break;
      case 'toggle-fixed-group':
        if (groupId) await this.handleToggleFixedGroup(groupId);
        break;
      case 'toggle-favorite-group':
        if (!groupId) break;
        await this.handleToggleFavoriteGroup(groupId);
        break;
      case 'restore-group':
        if (!groupId) break;
        await this.handleRestore(groupId);
        break;
      case 'copy-group':
        if (!groupId) break;
        await this.handleCopyGroup(groupId);
        break;
      case 'delete-group':
        if (!groupId) break;
        await this.handleDeleteGroup(groupId);
        break;
      case 'select-visible-groups':
        this.selectVisibleGroups();
        break;
      case 'select-stale-groups':
        this.selectStaleGroups();
        break;
      case 'clear-group-selection':
        this.clearGroupSelection();
        break;
      case 'restore-selected-groups':
        await this.handleRestoreSelectedGroups();
        break;
      case 'copy-selected-groups':
        await this.handleCopySelectedGroups();
        break;
      case 'delete-selected-groups':
        await this.handleDeleteSelectedGroups();
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
