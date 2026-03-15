import { queryTabs, createTab, createWindow } from './browser-api';

const UNSAVABLE_URL_PREFIXES = [
  'about:',
  'chrome://',
  'chrome-extension://',
  'edge://',
  'moz-extension://'
] as const;

export function isSavableTabUrl(url: string | undefined | null): url is string {
  if (!url) return false;

  return !UNSAVABLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function hasSavableTab(tabs: chrome.tabs.Tab[]) {
  return tabs.some((tab) => isSavableTabUrl(tab.url));
}

export async function getCurrentWindowTabs(): Promise<chrome.tabs.Tab[]> {
  const currentWindowTabs = await queryTabs({ currentWindow: true });
  if (hasSavableTab(currentWindowTabs)) {
    return currentWindowTabs;
  }

  const lastFocusedWindowTabs = await queryTabs({ lastFocusedWindow: true });
  return lastFocusedWindowTabs.length > 0 ? lastFocusedWindowTabs : currentWindowTabs;
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await queryTabs({ currentWindow: true, active: true });
  const currentWindowTab = tabs.find((tab) => isSavableTabUrl(tab.url));
  if (currentWindowTab) {
    return currentWindowTab;
  }

  const fallbackTabs = await queryTabs({ lastFocusedWindow: true, active: true });
  return fallbackTabs.find((tab) => isSavableTabUrl(tab.url)) ?? tabs[0] ?? fallbackTabs[0] ?? null;
}

export async function restoreTabs(urls: string[]): Promise<void> {
  const validUrls = urls.filter((url) => isSavableTabUrl(url));

  if (validUrls.length === 0) return;

  const [first, ...rest] = validUrls;
  const createdWindow = await createWindow({ url: first });

  if (!createdWindow?.id) {
    throw new Error('復元用ウィンドウの作成に失敗しました。');
  }

  for (const url of rest) {
    await createTab({
      windowId: createdWindow.id,
      url,
      active: false
    });
  }
}

export async function openSavedTab(url: string): Promise<void> {
  if (!isSavableTabUrl(url)) return;

  await createTab({
    url,
    active: false
  });
}
