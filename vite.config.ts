import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const isPagesBuild = mode === 'pages';
  const browser = mode === 'firefox' ? 'firefox' : 'chrome';
  const outDir = path.resolve(__dirname, 'dist', isPagesBuild ? 'pages' : browser);
  const input: Record<string, string> = isPagesBuild
    ? {
        tablet: path.resolve(__dirname, 'tablet.html')
      }
    : {
        popup: path.resolve(__dirname, 'popup.html'),
        newtab: path.resolve(__dirname, 'newtab.html')
      };

  return {
    base: isPagesBuild ? './' : '/',
    build: {
      outDir,
      emptyOutDir: isPagesBuild,
      sourcemap: true,
      rollupOptions: {
        input,
        output: {
          entryFileNames: 'assets/[name].js',
          chunkFileNames: 'assets/[name].js',
          assetFileNames: 'assets/[name][extname]'
        }
      }
    }
  };
});
