const g = globalThis as typeof globalThis & {
  browser?: typeof chrome;
  chrome?: typeof chrome;
};

function getExtensionApi() {
  return g.browser ?? g.chrome;
}

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readLocalStorage(keys: string | string[]) {
  const storage = getLocalStorage();
  const keyList = Array.isArray(keys) ? keys : [keys];

  return keyList.reduce<Record<string, unknown>>((result, key) => {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) {
      result[key] = undefined;
      return result;
    }

    try {
      result[key] = JSON.parse(raw);
    } catch {
      result[key] = raw;
    }

    return result;
  }, {});
}

export const ext = getExtensionApi() as typeof chrome;

export function storageLocalGet<T extends string | string[]>(keys: T) {
  if (ext?.storage?.local) {
    return ext.storage.local.get(keys as any);
  }

  return Promise.resolve(readLocalStorage(keys));
}

export function storageLocalSet(value: Record<string, unknown>) {
  if (ext?.storage?.local) {
    return ext.storage.local.set(value);
  }

  const storage = getLocalStorage();
  Object.entries(value).forEach(([key, item]) => {
    if (item === undefined) {
      storage?.removeItem(key);
      return;
    }

    storage?.setItem(key, typeof item === 'string' ? item : JSON.stringify(item));
  });

  return Promise.resolve();
}

export function storageLocalRemove(keys: string | string[]) {
  if (ext?.storage?.local) {
    return ext.storage.local.remove(keys);
  }

  const storage = getLocalStorage();
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    storage?.removeItem(key);
  }

  return Promise.resolve();
}

export function queryTabs(queryInfo: chrome.tabs.QueryInfo) {
  if (!ext?.tabs?.query) {
    return Promise.reject(new Error('tabs API is not available in this environment.'));
  }

  return ext.tabs.query(queryInfo);
}

export function createTab(createProperties: chrome.tabs.CreateProperties) {
  if (ext?.tabs?.create) {
    return ext.tabs.create(createProperties);
  }

  if (typeof window === 'undefined' || !createProperties.url) {
    return Promise.reject(new Error('tabs API is not available in this environment.'));
  }

  const opened = window.open(createProperties.url, '_blank', 'noopener');
  if (!opened) {
    return Promise.reject(new Error('新しいタブを開けませんでした。ポップアップブロックを確認してください。'));
  }

  return Promise.resolve({ url: createProperties.url, active: true } as chrome.tabs.Tab);
}

export function createWindow(createData: chrome.windows.CreateData) {
  const windowsApi = ext?.windows;
  if (!windowsApi) {
    if (typeof window !== 'undefined' && createData.url) {
      const firstUrl = Array.isArray(createData.url) ? createData.url[0] : createData.url;
      const opened = firstUrl ? window.open(firstUrl, '_blank', 'noopener') : null;
      if (!opened) {
        return Promise.reject(new Error('復元用ウィンドウを開けませんでした。ポップアップブロックを確認してください。'));
      }

      return Promise.resolve({} as chrome.windows.Window);
    }

    return Promise.reject(new Error('windows API is not available in this browser.'));
  }

  return windowsApi.create(createData);
}

export function getLastFocusedWindow(queryOptions?: chrome.windows.QueryOptions) {
  const windowsApi = ext?.windows;
  if (!windowsApi?.getLastFocused) {
    return Promise.resolve(null);
  }

  return windowsApi.getLastFocused(queryOptions);
}

export function getRuntimeUrl(path: string) {
  if (ext?.runtime?.getURL) {
    return ext.runtime.getURL(path);
  }

  return new URL(path, typeof window !== 'undefined' ? window.location.href : 'http://localhost/').toString();
}

export function runtimeSendMessage<TMessage, TResponse>(message: TMessage): Promise<TResponse> {
  if (!ext?.runtime?.sendMessage) {
    return Promise.reject(new Error('runtime messaging is not available in this environment.'));
  }

  return new Promise<TResponse>((resolve, reject) => {
    ext.runtime.sendMessage(message, (response: TResponse) => {
      const lastError = ext.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
