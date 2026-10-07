import { runtimeSendMessage } from './browser-api';
import { hidePendingTabs, prepareWebRestore, restoreSavedTabs, type RestoreResult } from './restoration';
import { reconcileGroupIds } from './group-helpers';
import { getErrorMessage } from './status';
import type { PopupActionMessage, PopupActionResponse } from './messages';
import type { DashboardState } from './dashboard-model';
import type { DashboardGroups } from './dashboard-groups';
import type { TabGroup } from './types';

export function prepareExtensionRestore(_tabCount: number) {
  return {
    async restore(groupId: string, tabIds: string[], inNewWindow: boolean): Promise<RestoreResult> {
      const response = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
        type: 'restore-saved-tabs', groupId, tabIds, inNewWindow
      });
      if (!response?.ok || !('result' in response)) {
        throw new Error(response && !response.ok ? response.error : '復元結果を取得できませんでした。');
      }
      return response.result;
    },
    closeUnused() {}
  };
}

export function prepareDashboardWebRestore(tabCount: number) {
  // Reserve popups synchronously during the click, before awaiting the restore queue.
  const web = prepareWebRestore(tabCount);
  return {
    restore: (groupId: string, tabIds: string[], inNewWindow: boolean) =>
      restoreSavedTabs(groupId, tabIds, inNewWindow, web.open),
    closeUnused: () => web.closeUnused()
  };
}

// The queue owns optimistic removal, deduplication and partial-failure rollback.
export class DashboardRestore {
  private pendingRestoreTabs = new Map<string, string>();
  // ponytail: serialize restores per dashboard; use per-group queues if throughput matters.
  private restoreQueue: Promise<void> | null = null;

  constructor(
    private readonly state: DashboardState,
    private readonly render: () => void,
    private readonly groups: DashboardGroups,
    private readonly prepareRestore: typeof prepareExtensionRestore
  ) {}

  async handleRestoreGroups(groups: TabGroup[], tabId?: string) {
    if (this.state.actionBusy || this.state.refreshBusy || groups.length === 0) return;
    const requests = groups.map((group) => ({ group, ids: group.tabs
      .filter((tab) => (!tabId || tab.id === tabId) && !this.pendingRestoreTabs.has(group.id + ':' + tab.id))
      .map((tab) => tab.id) })).filter(({ ids }) => ids.length > 0);
    if (requests.length === 0) return;
    const web = this.prepareRestore(requests.reduce((sum, request) => sum + request.ids.length, 0));
    for (const { group, ids } of requests) {
      for (const id of ids) this.pendingRestoreTabs.set(group.id + ':' + id, id);
    }
    const previous = this.restoreQueue;
    let finish!: () => void;
    this.restoreQueue = new Promise<void>((resolve) => { finish = resolve; });
    const selected = [...this.state.selectedGroupIds];
    const revision = this.state.sessionRevision;
    this.state.restoreBusy = true;
    for (const { group, ids } of requests) {
      if (!group.is_fixed) this.state.allGroups = hidePendingTabs(this.state.allGroups, ids, this.state.favoriteGroupIds);
    }
    this.state.pageStatus = '復元しています。';
    this.render();
    let completed = 0;
    let opened = 0;
    try {
      if (previous) await previous;
      for (const { group, ids } of requests) {
        if (this.groups.hasFixedUpdates(group.id)) await this.groups.waitForFixedUpdates(group.id);
        if (revision !== this.state.sessionRevision) return;
        const result = await web.restore(group.id, ids, !tabId);
        if (revision !== this.state.sessionRevision) return;
        this.state.allGroups = this.state.allGroups.filter((item) => item.id !== group.id);
        if (result.group) this.state.allGroups.push(result.group);
        for (const id of ids) this.pendingRestoreTabs.delete(group.id + ':' + id);
        this.state.allGroups = hidePendingTabs(this.state.allGroups, [...this.pendingRestoreTabs.values()], this.state.favoriteGroupIds);
        this.render();
        completed += 1;
        opened += result.openedTabIds.length;
        if (result.error) throw new Error(result.error);
      }
      this.state.selectedGroupIds = this.state.selectedGroupIds.filter((id) => !groups.some((group) => group.id === id));
      this.state.pageStatus = `${opened} タブを復元しました。固定グループの内容は保持しました。`;
    } catch (error) {
      if (revision !== this.state.sessionRevision) return;
      for (const { group, ids } of requests.slice(completed)) {
        for (const id of ids) this.pendingRestoreTabs.delete(group.id + ':' + id);
        const current = this.groups.findGroup(group.id);
        const tabs = [...(current?.tabs ?? []), ...group.tabs.filter((tab) => ids.includes(tab.id)
          && !current?.tabs.some((item) => item.id === tab.id))].sort((a, b) => a.position - b.position);
        this.state.allGroups = this.state.allGroups.filter((item) => item.id !== group.id);
        this.state.allGroups.push({ ...(current ?? group), tabs });
      }
      this.state.selectedGroupIds = [...new Set([...this.state.selectedGroupIds, ...selected])];
      this.state.pageStatus = `${opened} タブ復元 / ${getErrorMessage(error)}`;
    } finally {
      web.closeUnused();
      if (revision !== this.state.sessionRevision) {
        for (const { group, ids } of requests) {
          for (const id of ids) this.pendingRestoreTabs.delete(group.id + ':' + id);
        }
      }
      this.state.allGroups = hidePendingTabs(this.state.allGroups, [...this.pendingRestoreTabs.values()], this.state.favoriteGroupIds);
      this.state.selectedGroupIds = reconcileGroupIds(this.state.selectedGroupIds, this.state.allGroups);
      this.state.expandedGroupIds = reconcileGroupIds(this.state.expandedGroupIds, this.state.allGroups);
      this.state.favoriteGroupIds = reconcileGroupIds(this.state.favoriteGroupIds, this.state.allGroups);
      this.state.restoreBusy = this.pendingRestoreTabs.size > 0;
      if (!this.state.restoreBusy) this.restoreQueue = null;
      finish();
      this.render();
    }
  }

  async handleRestore(groupId: string) {
    const group = this.groups.findGroup(groupId);
    if (group) await this.handleRestoreGroups([group]);
  }

  async handleOpenTab(tabId: string) {
    const resolved = this.groups.findTab(tabId);
    if (resolved) await this.handleRestoreGroups([resolved.group], tabId);
  }

  async handleRestoreSelectedGroups() {
    await this.handleRestoreGroups(this.groups.getSelectedGroups().filter((group) => group.tabs.length > 0));
  }

}
