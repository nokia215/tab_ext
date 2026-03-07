export const ext = globalThis.browser ?? globalThis.chrome;

export function storageLocalGet(keys) {
  return ext.storage.local.get(keys);
}

export function storageLocalSet(value) {
  return ext.storage.local.set(value);
}

export function storageLocalRemove(keys) {
  return ext.storage.local.remove(keys);
}

export function queryTabs(queryInfo) {
  return ext.tabs.query(queryInfo);
}

export function createTab(createProperties) {
  return ext.tabs.create(createProperties);
}

export function createWindow(createData) {
  return ext.windows.create(createData);
}