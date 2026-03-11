import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const browser = mode === 'firefox' ? 'firefox' : 'chrome';
  const outDir = path.resolve(__dirname, 'dist', browser);

  return {
    plugins: [svelte()],
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: true,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, 'popup.html'),
          newtab: path.resolve(__dirname, 'newtab.html')
        },
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]'
        }
      }
    }
  };
});
