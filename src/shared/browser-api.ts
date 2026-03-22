const g = globalThis as typeof globalThis & {
  browser?: typeof chrome;
};

export const ext: typeof chrome = g.browser ?? chrome;

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
  const windowsApi = (ext as typeof chrome & { windows?: typeof chrome.windows }).windows;
  if (!windowsApi) {
    return Promise.reject(new Error('windows API is not available in this browser.'));
  }

  return windowsApi.create(createData);
}

export function getLastFocusedWindow(queryOptions?: chrome.windows.QueryOptions) {
  const windowsApi = (ext as typeof chrome & { windows?: typeof chrome.windows }).windows;
  if (!windowsApi?.getLastFocused) {
    return Promise.resolve(null);
  }

  return windowsApi.getLastFocused(queryOptions);
}

export function getRuntimeUrl(path: string) {
  return ext.runtime.getURL(path);
}

export function runtimeSendMessage<TMessage, TResponse>(message: TMessage): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    ext.runtime.sendMessage(message, (response: TResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
