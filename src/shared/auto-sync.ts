import { isDashboardBusy, type DashboardState } from './dashboard-model';
import { reconcileGroupIds } from './group-helpers';
import { hidePendingTabs, retryPendingConsumption } from './restoration';
import { getCurrentSessionUser, getFavoriteGroupIds, listGroups } from './supabase';
import { getErrorMessage } from './status';
import { ext } from './browser-api';

export function startDashboardAutoSync(
  root: HTMLElement, state: DashboardState, getUserId: () => string | null, render: () => void,
  onUserChanged?: () => Promise<unknown>
) {
  let inFlight = false;
  let revision = 0;
  let composing = false;
  let lastAttempt = 0;
  const blocked = () => document.visibilityState !== 'visible' || !navigator.onLine
    || isDashboardBusy(state) || state.restoreBusy || state.pendingUpdates > 0
    || Boolean(state.editingGroupId) || composing;

  const sync = async () => {
    const userId = getUserId();
    try {
      if ((await getCurrentSessionUser())?.id !== (userId ?? undefined)) {
        state.sessionRevision = (state.sessionRevision ?? 0) + 1;
        state.allGroups = [];
        state.favoriteGroupIds = [];
        state.selectedGroupIds = [];
        state.expandedGroupIds = [];
        state.saveGroupId = '';
        state.editingGroupId = null;
        state.editingGroupTitle = '';
        state.password = '';
        state.groupTitle = '';
        state.importText = '';
        state.pageStatus = '';
        state.saveStatus = '';
        state.authStatus = '認証状態が変更されました。';
        state.syncStatus = '';
        render();
        await onUserChanged?.();
        return;
      }
    } catch (error) {
      state.syncStatus = `認証確認失敗: ${getErrorMessage(error)}`;
      render();
      return;
    }
    if (!userId || inFlight || blocked() || Date.now() - lastAttempt < 1000) return;
    inFlight = true;
    lastAttempt = Date.now();
    const startedRevision = revision;
    const groupsBefore = state.allGroups;
    const favoritesBefore = state.favoriteGroupIds;
    const stillCurrent = () => !blocked() && getUserId() === userId && revision === startedRevision
      && state.allGroups === groupsBefore && state.favoriteGroupIds === favoritesBefore;
    try {
      if ((await getCurrentSessionUser())?.id !== userId || !stillCurrent()) return;
      const pending = await retryPendingConsumption();
      const [groups, favorites] = await Promise.all([listGroups(userId), getFavoriteGroupIds(userId)]);
      if ((await getCurrentSessionUser())?.id !== userId || !stillCurrent()) return;
      state.allGroups = hidePendingTabs(groups, pending.pendingTabIds);
      state.favoriteGroupIds = reconcileGroupIds(favorites, state.allGroups);
      state.selectedGroupIds = reconcileGroupIds(state.selectedGroupIds, state.allGroups);
      state.expandedGroupIds = reconcileGroupIds(state.expandedGroupIds, state.allGroups);
      if (state.saveGroupId && !state.allGroups.some((group) => group.id === state.saveGroupId)) {
        state.saveGroupId = '';
      }
      state.syncStatus = `最終同期: ${new Date().toLocaleTimeString('ja-JP')}`;
      if (pending.error) state.pageStatus = pending.error;
      render();
    } catch (error) {
      if (stillCurrent()) {
        state.syncStatus = `自動同期失敗: ${getErrorMessage(error)}（自動で再試行します）`;
        render();
      }
    } finally {
      inFlight = false;
    }
  };
  const requestSync = () => { void sync(); };
  for (const event of ['click', 'input', 'change']) root.addEventListener(event, () => { revision++; });
  root.addEventListener('compositionstart', () => { composing = true; revision++; });
  root.addEventListener('compositionend', () => { composing = false; revision++; });
  document.addEventListener('visibilitychange', requestSync);
  window.addEventListener('focus', requestSync);
  window.addEventListener('online', requestSync);
  const isAuthKey = (key: string) => key.startsWith('sb-') && key.includes('-auth-token');
  window.addEventListener('storage', (event) => {
    if (!event.key || isAuthKey(event.key)) requestSync();
  });
  ext?.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(isAuthKey)) requestSync();
  });
  // ponytail: visible-page polling has up to 30s latency; use Realtime if immediate delivery becomes necessary.
  window.setInterval(requestSync, 30_000);
}
