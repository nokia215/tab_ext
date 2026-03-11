import { createTab, ext, getRuntimeUrl } from '../shared/browser-api';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { deleteSavedTab, markGroupRestored } from '../shared/supabase';
import { openSavedTab, restoreTabs } from '../shared/tabs';

if (ext.action?.onClicked) {
  ext.action.onClicked.addListener(async () => {
    try {
      await createTab({
        url: getRuntimeUrl('newtab.html'),
        active: true
      });
    } catch (error) {
      console.error('failed to open dashboard', error);
    }
  });
}

console.log('tab-saver background loaded');

async function handlePopupAction(message: PopupActionMessage): Promise<PopupActionResponse> {
  if (message.type === 'restore-group') {
    await restoreTabs(message.urls);
    await markGroupRestored(message.groupId);
    return { ok: true };
  }

  if (message.type === 'open-saved-tab') {
    await openSavedTab(message.url);
    await deleteSavedTab(message.tabId);
    return { ok: true };
  }

  return { ok: false, error: '未対応の操作です。' };
}

ext.runtime.onMessage.addListener((message: PopupActionMessage, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return undefined;
  }

  void handlePopupAction(message)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );

  return true;
});
