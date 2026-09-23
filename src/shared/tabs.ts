import { queryTabs } from './browser-api';

const UNSAVABLE_URL_PREFIXES = [
  'about:',
  'chrome://',
  'chrome-extension://',
  'edge://',
  'moz-extension://'
] as const;

export function isSavableTabUrl(url: string | undefined | null): url is string {
  if (!url) return false;

  if (UNSAVABLE_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return false;
  try {
    return ['http:', 'https:', 'file:', 'ftp:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
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
