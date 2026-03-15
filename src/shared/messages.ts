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
