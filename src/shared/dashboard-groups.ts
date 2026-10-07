import { copyTextToClipboard, formatGroupForExport, formatGroupsForExport } from './export';
import { removeFavoriteGroupIds } from './favorites';
import { isStaleGroupByAge } from './group-age';
import { mergeGroupIds, reconcileGroupIds, resolveGroupsByIds, toggleGroupId, updateGroup as updateGroupCollection } from './group-helpers';
import { reconcileExpandedGroupIds, removeGroupsFromCollection, resetVisibleGroupCount, visibleGroups } from './group-state';
import { LIGHTWEIGHT_GROUP_BATCH_SIZE, queryGroups, type DashboardState, type FocusState } from './dashboard-model';
import { buildDefaultGroupTitle, deleteGroup, setGroupFavorite, setGroupFixed, updateGroupTitle } from './supabase';
import { getErrorMessage } from './status';
import type { TabGroup } from './types';

// Group selection, editing and optimistic updates shared by both dashboards.
export class DashboardGroups {
  private fixedWrites = new Map<string, { tail: Promise<void>; committed: boolean; error: string | undefined }>();

  async waitForFixedUpdates(groupId: string) {
    while (this.fixedWrites.has(groupId)) {
      const queue = this.fixedWrites.get(groupId)!;
      await queue.tail;
      if (queue.error) throw new Error(`固定設定の保存失敗: ${queue.error}`);
    }
  }

  hasFixedUpdates(groupId: string) {
    return this.fixedWrites.has(groupId);
  }
  constructor(
    private readonly state: DashboardState,
    private readonly render: (focus?: FocusState) => void
  ) {}

  get filteredGroups() {
    return queryGroups(this.state.allGroups, this.state);
  }

  getVisibleGroups(groups: TabGroup[]) {
    return this.state.uiMode === 'lightweight' ? visibleGroups(groups, this.state.visibleGroupCount) : groups;
  }

  get bulkSelectableGroups() {
    return this.getVisibleGroups(this.filteredGroups);
  }

  removeDeletedFavoriteGroups(groupIds: string[]) {
    this.state.favoriteGroupIds = removeFavoriteGroupIds(this.state.favoriteGroupIds, groupIds);
  }

  findGroup(groupId: string) {
    return this.state.allGroups.find((group) => group.id === groupId);
  }

  updateGroup(groupId: string, update: (group: TabGroup) => TabGroup) {
    this.state.allGroups = updateGroupCollection(this.state.allGroups, groupId, update);
  }

  removeGroupsFromState(groupIds: string[]) {
    this.state.allGroups = removeGroupsFromCollection(this.state.allGroups, groupIds);
    this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, this.state.allGroups);
    this.reconcileExpandedGroupIds(this.state.allGroups);
  }

  getSelectedGroups() {
    return resolveGroupsByIds(this.state.allGroups, this.state.selectedGroupIds);
  }

  findTab(tabId: string) {
    for (const group of this.state.allGroups) {
      const tab = group.tabs.find((item) => item.id === tabId);
      if (tab) {
        return { group, tab };
      }
    }

    return null;
  }

  resetVisibleGroupCount() {
    resetVisibleGroupCount(this.state, this.state.uiMode === 'lightweight' ? LIGHTWEIGHT_GROUP_BATCH_SIZE : null);
  }

  reconcileExpandedGroupIds(groups: TabGroup[]) {
    this.state.expandedGroupIds = reconcileExpandedGroupIds(
      this.state.expandedGroupIds,
      groups,
      this.state.uiMode === 'lightweight' ? 1 : null
    );
  }

  reconcileSelectedGroupIds(groups: TabGroup[]) {
    this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, groups);
  }

  startEditingGroupTitle(groupId: string) {
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

  stopEditingGroupTitle() {
    this.state.editingGroupId = null;
    this.state.editingGroupTitle = '';
  }

  async handleSaveGroupTitle(groupId: string) {
    if (this.state.actionBusy || this.state.editingGroupId !== groupId) return;
    const group = this.findGroup(groupId);
    if (!group) return;
    const revision = this.state.sessionRevision;

    this.state.actionBusy = true;

    try {
      const resolvedTitle = this.state.editingGroupTitle.trim()
        || buildDefaultGroupTitle(group.device_id, group.tabs.length);

      this.updateGroup(groupId, (item) => ({ ...item, title: resolvedTitle }));
      this.stopEditingGroupTitle();
      this.state.pageStatus = 'グループ名を保存しています。';
      this.render();
      await updateGroupTitle(groupId, resolvedTitle);
      if (revision !== this.state.sessionRevision) return;
      this.state.pageStatus = 'グループ名を更新しました。';
    } catch (error) {
      if (revision !== this.state.sessionRevision) return;
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

  async handleDeleteGroup(groupId: string) {
    if (this.state.actionBusy || this.state.restoreBusy) return;
    const group = this.findGroup(groupId);
    if (!group) return;
    const revision = this.state.sessionRevision;

    const wasFavorite = this.state.favoriteGroupIds.includes(groupId);
    if (!window.confirm(`1 グループ / ${group.tabs.length} タブを削除します。固定グループも削除されます。よろしいですか？`)) return;
    this.state.actionBusy = true;
    this.removeDeletedFavoriteGroups([groupId]);
    this.state.allGroups = this.state.allGroups.filter((item) => item.id !== groupId);
    this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, this.state.allGroups);
    this.state.pageStatus = 'グループを削除しています。';
    this.render();

    try {
      await deleteGroup(groupId);
      if (revision !== this.state.sessionRevision) return;
      this.state.pageStatus = 'グループを削除しました。';
    } catch (error) {
      if (revision !== this.state.sessionRevision) return;
      this.state.allGroups = [group, ...this.state.allGroups];
      if (wasFavorite) this.state.favoriteGroupIds = [...this.state.favoriteGroupIds, groupId];
      this.state.pageStatus = `削除失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.actionBusy = false;
      this.render();
    }
  }

  async handleCopyGroup(groupId: string) {
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

  toggleGroup(groupId: string) {
    if (this.state.uiMode === 'lightweight') {
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

  toggleGroupSelection(groupId: string) {
    this.state.selectedGroupIds = toggleGroupId(this.state.selectedGroupIds, groupId);
    this.render();
  }

  toggleFavoriteOnly() {
    this.state.favoriteOnly = !this.state.favoriteOnly;
    this.resetVisibleGroupCount();
    this.render();
  }

  async handleToggleFixedGroup(groupId: string) {
    if (this.state.actionBusy || this.state.refreshBusy) return;
    const group = this.findGroup(groupId);
    if (!group) return;
    const revision = this.state.sessionRevision;
    const fixed = !group.is_fixed;
    const queue = this.fixedWrites.get(groupId) ?? { tail: Promise.resolve(), committed: group.is_fixed, error: undefined };
    this.updateGroup(groupId, (item) => ({ ...item, is_fixed: fixed }));
    this.state.pageStatus = '固定設定を保存しています。';
    this.state.pendingUpdates += 1;
    const write = queue.tail.then(async () => {
      if (revision !== this.state.sessionRevision) return;
      try {
        await setGroupFixed(groupId, fixed);
        queue.committed = fixed;
        queue.error = undefined;
        if (revision === this.state.sessionRevision && queue.tail === write) {
          this.state.pageStatus = fixed ? '固定しました。復元後も内容を保持します。' : '固定を解除しました。次の復元から削除します。';
        }
      } catch (error) {
        queue.error = getErrorMessage(error);
        if (revision === this.state.sessionRevision && queue.tail === write) {
          this.updateGroup(groupId, (item) => ({ ...item, is_fixed: queue.committed }));
          this.state.pageStatus = `固定設定の保存失敗: ${getErrorMessage(error)}`;
        }
      }
    }).finally(() => {
      if (queue.tail === write) this.fixedWrites.delete(groupId);
      this.state.pendingUpdates -= 1;
      this.render();
    });
    queue.tail = write;
    this.fixedWrites.set(groupId, queue);
    this.render();
    await write;
  }

  async handleToggleFavoriteGroup(groupId: string) {
    if (this.state.actionBusy) return;

    const group = this.findGroup(groupId);
    if (!group) return;
    const revision = this.state.sessionRevision;

    const favorite = !this.state.favoriteGroupIds.includes(groupId);
    this.state.actionBusy = true;
    this.state.favoriteGroupIds = favorite
      ? [...this.state.favoriteGroupIds, groupId]
      : this.state.favoriteGroupIds.filter((id) => id !== groupId);
    this.state.actionBusy = false;
    this.render();
    this.state.pendingUpdates += 1;
    try {
      await setGroupFavorite(groupId, favorite);
      if (revision !== this.state.sessionRevision) return;
      this.state.pageStatus = favorite
        ? `「${group.title ?? '(untitled)'}」をお気に入りに追加しました。`
        : `「${group.title ?? '(untitled)'}」をお気に入りから外しました。`;
    } catch (error) {
      if (revision !== this.state.sessionRevision) return;
      this.state.favoriteGroupIds = favorite
        ? this.state.favoriteGroupIds.filter((id) => id !== groupId)
        : [...this.state.favoriteGroupIds, groupId];
      this.state.pageStatus = `お気に入りの更新失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.pendingUpdates -= 1;
      this.state.actionBusy = false;
      this.render();
    }
  }

  selectVisibleGroups() {
    this.state.selectedGroupIds = mergeGroupIds(this.state.selectedGroupIds, this.bulkSelectableGroups);
    this.render();
  }

  selectStaleGroups() {
    const staleGroups = this.bulkSelectableGroups.filter((group) => isStaleGroupByAge(group));

    if (staleGroups.length === 0) {
      return;
    }

    this.state.selectedGroupIds = mergeGroupIds(this.state.selectedGroupIds, staleGroups);
    this.state.pageStatus = `30日以上の ${staleGroups.length} グループを選択しました。`;
    this.render();
  }

  clearGroupSelection() {
    if (this.state.selectedGroupIds.length === 0) {
      return;
    }

    this.state.selectedGroupIds = [];
    this.render();
  }

  setGroupFilter(filter: DashboardState['groupFilter']) {
    this.state.groupFilter = filter === 'fixed' ? 'fixed' : 'all';
    this.resetVisibleGroupCount();
    this.stopEditingGroupTitle();
    this.render();
  }

  async handleDeleteSelectedGroups() {
    if (this.state.actionBusy || this.state.restoreBusy) return;

    const groups = this.getSelectedGroups();
    if (groups.length === 0) return;
    const revision = this.state.sessionRevision;

    if (!window.confirm(`${groups.length} グループ / ${groups.reduce((sum, group) => sum + group.tabs.length, 0)} タブを削除します。固定グループも削除されます。よろしいですか？`)) return;
    const previousFavoriteIds = [...this.state.favoriteGroupIds];
    this.state.actionBusy = true;
    this.removeDeletedFavoriteGroups(groups.map((group) => group.id));
    this.removeGroupsFromState(groups.map((group) => group.id));
    this.state.pageStatus = `${groups.length} グループを削除しています。`;
    this.render();

    let deletedCount = 0;

    try {
      for (const group of groups) {
        if (revision !== this.state.sessionRevision) return;
        await deleteGroup(group.id);
        if (revision !== this.state.sessionRevision) return;
        deletedCount += 1;
      }

      this.state.pageStatus = `${deletedCount} グループを削除しました。`;
    } catch (error) {
      if (revision !== this.state.sessionRevision) return;
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

  async handleCopySelectedGroups() {
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

}
