import { createTab, ext, getLastFocusedWindow, getRuntimeUrl, queryTabs } from '../shared/browser-api';
import { resolveDashboardUrl } from '../shared/dashboard-url';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { deleteSavedTab, markGroupRestored } from '../shared/supabase';
import { isSavableTabUrl, openSavedTab, restoreTabs } from '../shared/tabs';

if (ext.action?.onClicked) {
  ext.action.onClicked.addListener(async () => {
    try {
      await createTab({
        url: resolveDashboardUrl(getRuntimeUrl),
        active: true
      });
    } catch (error) {
      console.error('failed to open dashboard', error);
    }
  });
}

console.log('tab-saver background loaded');

async function getLastFocusedWindowTabs() {
  const windowInfo = await getLastFocusedWindow({ populate: true });
  return (windowInfo?.tabs ?? []).filter((tab): tab is chrome.tabs.Tab => Boolean(tab));
}

function countSavableTabs(tabs: chrome.tabs.Tab[]) {
  return tabs.filter((tab) => isSavableTabUrl(tab.url)).length;
}

function sortTabs(tabs: chrome.tabs.Tab[]) {
  return [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

async function resolveWindowTabs(sender: chrome.runtime.MessageSender) {
  const candidates: chrome.tabs.Tab[][] = [];

  if (typeof sender.tab?.windowId === 'number') {
    const senderWindowTabs = await queryTabs({ windowId: sender.tab.windowId });
    if (senderWindowTabs.length > 0) {
      candidates.push(senderWindowTabs);
    }
  }

  const currentWindowTabs = await queryTabs({ currentWindow: true });
  if (currentWindowTabs.length > 0) {
    candidates.push(currentWindowTabs);
  }

  const lastFocusedTabs = await getLastFocusedWindowTabs();
  if (lastFocusedTabs.length > 0) {
    candidates.push(lastFocusedTabs);
  }

  return candidates
    .map((tabs) => sortTabs(tabs))
    .sort((left, right) => {
      const savableDiff = countSavableTabs(right) - countSavableTabs(left);
      if (savableDiff !== 0) return savableDiff;
      return right.length - left.length;
    })[0] ?? [];
}

async function handlePopupAction(
  message: PopupActionMessage,
  sender: chrome.runtime.MessageSender
): Promise<PopupActionResponse> {
  if (message.type === 'restore-group') {
    await restoreTabs(message.urls);
    await markGroupRestored(message.groupId);
    return { ok: true };
  }

  if (message.type === 'open-saved-tab') {
    await openSavedTab(message.url);
    await deleteSavedTab(message.tabId);
    return { ok: true };
  }

  if (message.type === 'get-current-window-tabs') {
    const orderedTabs = await resolveWindowTabs(sender);
    const savableTabs = orderedTabs.filter((tab) => isSavableTabUrl(tab.url));
    return { ok: true, tabs: savableTabs.length > 0 ? savableTabs : orderedTabs };
  }

  if (message.type === 'get-active-tab') {
    const tabs = await resolveWindowTabs(sender);
    const activeTab = tabs.find((tab) => tab.active && isSavableTabUrl(tab.url))
      ?? tabs.find((tab) => isSavableTabUrl(tab.url))
      ?? tabs.find((tab) => tab.active)
      ?? null;
    return { ok: true, tab: activeTab };
  }

  return { ok: false, error: '未対応の操作です。' };
}

ext.runtime.onMessage.addListener((message: PopupActionMessage, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return undefined;
  }

  void handlePopupAction(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );

  return true;
});
