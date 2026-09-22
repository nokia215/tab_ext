import { runtimeSendMessage } from './browser-api';

export type PopupActionMessage =
  | {
      type: 'restore-group';
      groupId: string;
      urls: string[];
    }
  | {
      type: 'open-saved-tab';
      tabId: string;
      url: string;
    }
  | {
      type: 'get-current-window-tabs';
    }
  | {
      type: 'get-active-tab';
    };

export type PopupActionResponse =
  | {
      ok: true;
    }
  | {
      ok: true;
      tabs: chrome.tabs.Tab[];
    }
  | {
      ok: true;
      tab: chrome.tabs.Tab | null;
    }
  | {
      ok: false;
      error: string;
    };

export async function requestCurrentWindowTabs() {
  const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
    type: 'get-current-window-tabs'
  });

  if (!result?.ok || !('tabs' in result)) {
    throw new Error(result?.ok ? 'ウィンドウ内のタブ取得に失敗しました。' : result?.error ?? 'ウィンドウ内のタブ取得に失敗しました。');
  }

  return result.tabs;
}

export async function requestActiveTab() {
  const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
    type: 'get-active-tab'
  });

  if (!result?.ok || !('tab' in result)) {
    throw new Error(result?.ok ? '現在タブの取得に失敗しました。' : result?.error ?? '現在タブの取得に失敗しました。');
  }

  return result.tab;
}
