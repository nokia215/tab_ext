export const ext = (globalThis.browser ?? globalThis.chrome) as typeof chrome;

export function storageLocalGet<T extends string | string[]>(keys: T) {
  return ext.storage.local.get(keys as any);
}

export function storageLocalSet(value: Record<string, unknown>) {
  return ext.storage.local.set(value);
}

export function storageLocalRemove(keys: string | string[]) {
  return ext.storage.local.remove(keys);
}

export function queryTabs(queryInfo: chrome.tabs.QueryInfo) {
  return ext.tabs.query(queryInfo);
}

export function createTab(createProperties: chrome.tabs.CreateProperties) {
  return ext.tabs.create(createProperties);
}

export function createWindow(createData: chrome.windows.CreateData) {
  return ext.windows.create(createData);
}