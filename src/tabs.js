import { queryTabs, createTab, createWindow } from './browser-api.js';

export async function getCurrentWindowTabs() {
  return queryTabs({ currentWindow: true });
}

export async function getActiveTab() {
  const tabs = await queryTabs({ currentWindow: true, active: true });
  return tabs[0] ?? null;
}

export async function restoreTabs(urls) {
  const validUrls = urls.filter((url) => url && !url.startsWith('chrome://') && !url.startsWith('about:'));
  if (validUrls.length === 0) return;

  const [first, ...rest] = validUrls;
  const createdWindow = await createWindow({ url: first });

  for (const url of rest) {
    await createTab({
      windowId: createdWindow.id,
      url,
      active: false
    });
  }
}