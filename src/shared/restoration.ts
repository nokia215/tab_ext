import { createTab, createWindow, storageLocalGet, storageLocalRemove, storageLocalSet } from './browser-api';
import { consumeRestoredTabs, getCurrentSessionUser, getGroup } from './supabase';
import { getConfig } from './storage';
import { getErrorMessage } from './status';
import { isSavableTabUrl } from './tabs';
import type { SavedTab, TabGroup } from './types';

export interface RestoreResult {
  group: TabGroup | null;
  openedTabIds: string[];
  pendingTabIds: string[];
  error?: string;
}

type PendingTab = { groupId: string; tabId: string };

async function pendingScope() {
  const user = await getCurrentSessionUser();
  if (!user) throw new Error('ログインしてください。');
  const config = await getConfig();
  return `pending-consumption:${config.supabaseUrl}:${user.id}:`;
}

async function pendingEntries(scope: string) {
  const stored = await storageLocalGet(null);
  return Object.entries(stored).filter(([key, value]) => key.startsWith(scope)
    && value && typeof value === 'object' && 'groupId' in value && typeof value.groupId === 'string'
    && 'tabId' in value && typeof value.tabId === 'string') as [string, PendingTab][];
}

export async function retryPendingConsumption() {
  const entries = await pendingEntries(await pendingScope());
  const pendingTabIds: string[] = [];
  let error: string | undefined;
  for (const groupId of new Set(entries.map(([, item]) => item.groupId))) {
    const groupEntries = entries.filter(([, item]) => item.groupId === groupId);
    try {
      await consumeRestoredTabs(groupId, groupEntries.map(([, item]) => item.tabId));
      await storageLocalRemove(groupEntries.map(([key]) => key));
    } catch (cause) {
      pendingTabIds.push(...groupEntries.map(([, item]) => item.tabId));
      error = `復元後の削除同期に失敗: ${getErrorMessage(cause)}。「削除の同期を再試行」を押してください。`;
    }
  }
  return { pendingTabIds, error };
}

export function hidePendingTabs(groups: TabGroup[], pendingTabIds: string[]) {
  const pending = new Set(pendingTabIds);
  return groups.flatMap((group) => {
    if (group.is_fixed) return [group];
    const tabs = group.tabs.filter((tab) => !pending.has(tab.id));
    return tabs.length === 0 && group.tabs.length > 0 ? [] : [{ ...group, tabs }];
  });
}

const restoringGroups = new Set<string>();

export async function restoreSavedTabs(
  groupId: string, tabIds: string[], inNewWindow: boolean,
  webOpen?: (tab: SavedTab) => Promise<void>
): Promise<RestoreResult> {
  if (restoringGroups.has(groupId)) throw new Error('このグループは復元中です。');
  restoringGroups.add(groupId);
  try {
    return await performRestore(groupId, tabIds, inNewWindow, webOpen);
  } finally {
    restoringGroups.delete(groupId);
  }
}

async function performRestore(
  groupId: string,
  tabIds: string[],
  inNewWindow: boolean,
  webOpen?: (tab: SavedTab) => Promise<void>
): Promise<RestoreResult> {
  const scope = await pendingScope();
  const pending = await retryPendingConsumption();
  const current = await getGroup(groupId);
  if (!current) return { group: null, openedTabIds: [], pendingTabIds: pending.pendingTabIds, error: pending.error };
  if (pending.error) return {
    group: hidePendingTabs([current], pending.pendingTabIds)[0] ?? null,
    openedTabIds: [], pendingTabIds: pending.pendingTabIds, error: pending.error
  };

  const wanted = new Set(tabIds);
  const tabs = current.tabs.filter((tab) => wanted.has(tab.id));
  const openedTabIds: string[] = [];
  let windowId: number | undefined;
  let error: string | undefined;
  for (const tab of tabs) {
    try {
      if (!isSavableTabUrl(tab.url)) throw new Error('このURLは復元できません。');
      if (webOpen) {
        await webOpen(tab);
      } else if (inNewWindow && windowId === undefined) {
        const created = await createWindow({ url: tab.url });
        if (created?.id === undefined) throw new Error('復元用ウィンドウを作成できませんでした。');
        windowId = created.id;
      } else {
        await createTab({ url: tab.url, active: false, ...(windowId === undefined ? {} : { windowId }) });
      }
      openedTabIds.push(tab.id);
      if (!current.is_fixed) {
        await storageLocalSet({ [`${scope}${tab.id}`]: { groupId, tabId: tab.id } });
      }
    } catch (cause) {
      error = `復元失敗: ${getErrorMessage(cause)}`;
      break;
    }
  }

  let pendingTabIds: string[] = [];
  if (!current.is_fixed && openedTabIds.length > 0) {
    try {
      await consumeRestoredTabs(groupId, openedTabIds);
      await storageLocalRemove(openedTabIds.map((id) => `${scope}${id}`));
    } catch (cause) {
      pendingTabIds = openedTabIds;
      error = `復元後の削除同期に失敗: ${getErrorMessage(cause)}。「削除の同期を再試行」を押してください。`;
    }
  }
  // Keep successful opens out of the local queue even if the following read fails.
  const group = current.is_fixed ? current : {
    ...current, tabs: current.tabs.filter((tab) => !openedTabIds.includes(tab.id))
  };
  try {
    const fresh = await getGroup(groupId);
    return { group: fresh ? hidePendingTabs([fresh], pendingTabIds)[0] ?? null : null,
      openedTabIds, pendingTabIds, error };
  } catch (cause) {
    error ??= `一覧更新失敗: ${getErrorMessage(cause)}`;
  }
  return { group: group.is_fixed || group.tabs.length ? group : null, openedTabIds, pendingTabIds, error };
}

// Reserve windows during the user gesture, before authentication/database awaits.
// A blocked window is never treated as an opened tab, so its saved entry survives.
export function prepareWebRestore(count: number) {
  const reserved: Window[] = [];
  for (let index = 0; index < count; index += 1) {
    const opened = window.open('about:blank', '_blank');
    if (!opened) break;
    opened.opener = null;
    reserved.push(opened);
  }
  return {
    async open(tab: SavedTab) {
      if (!['http:', 'https:'].includes(new URL(tab.url).protocol)) {
        throw new Error('Web版ではHTTP/HTTPSのURLのみ復元できます。');
      }
      const next = reserved.shift();
      if (!next || next.closed) throw new Error('ポップアップがブロックされました。許可してから再試行してください。');
      try {
        next.location.replace(tab.url);
      } catch (error) {
        next.close();
        throw error;
      }
    },
    closeUnused() { for (const opened of reserved) opened.close(); }
  };
}
