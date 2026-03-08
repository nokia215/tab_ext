import { queryTabs, createTab, createWindow } from './browser-api';

export async function getCurrentWindowTabs(): Promise<chrome.tabs.Tab[]> {
  return queryTabs({ currentWindow: true });
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await queryTabs({ currentWindow: true, active: true });
  return tabs[0] ?? null;
}

export async function restoreTabs(urls: string[]): Promise<void> {
  const validUrls = urls.filter(
    (url) => url && !url.startsWith('chrome://') && !url.startsWith('about:')
  );

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
  if (!url) return;
  if (url.startsWith('chrome://') || url.startsWith('about:')) return;

  await createTab({
    url,
    active: false
  });
}