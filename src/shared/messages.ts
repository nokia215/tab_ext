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
    };

export interface PopupActionResponse {
  ok: boolean;
  error?: string;
}
