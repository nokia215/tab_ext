import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Tab Saver',
    description: 'Save current window tabs and restore them later.',
    permissions: ['tabs', 'storage'],
    host_permissions: ['https://*.supabase.co/*'],
    icons: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    },
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'tab-saver@example.local',
          data_collection_permissions: { required: ['personallyIdentifyingInfo'], optional: [] }
        }
      }
    } : {})
  })
});
