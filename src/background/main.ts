import { createTab, ext, getRuntimeUrl } from '../shared/browser-api';

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