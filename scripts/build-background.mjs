import path from 'node:path';
import { build } from 'esbuild';

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  throw new Error('usage: node scripts/build-background.mjs <chrome|firefox>');
}

const root = process.cwd();
const outDir = path.join(root, 'dist', browser);

await build({
  entryPoints: [path.join(root, 'src', 'background', 'main.ts')],
  outfile: path.join(outDir, 'background.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: browser === 'firefox' ? 'firefox128' : 'chrome120',
  sourcemap: true,
  logLevel: 'info'
});
