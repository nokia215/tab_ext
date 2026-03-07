import fs from 'node:fs/promises';
import path from 'node:path';

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  throw new Error('usage: node scripts/copy-static.mjs <chrome|firefox>');
}

const root = process.cwd();
const outDir = path.join(root, 'dist', browser);

await fs.mkdir(outDir, { recursive: true });
await fs.copyFile(path.join(root, 'public', 'popup.html'), path.join(outDir, 'popup.html'));
await fs.copyFile(path.join(root, 'public', 'popup.css'), path.join(outDir, 'popup.css'));
await fs.copyFile(path.join(root, 'src', 'popup.js'), path.join(outDir, 'popup.js'));
await fs.copyFile(path.join(root, 'src', 'supabase.js'), path.join(outDir, 'supabase.js'));
await fs.copyFile(path.join(root, 'src', 'storage.js'), path.join(outDir, 'storage.js'));
await fs.copyFile(path.join(root, 'src', 'tabs.js'), path.join(outDir, 'tabs.js'));
await fs.copyFile(path.join(root, 'src', 'ui.js'), path.join(outDir, 'ui.js'));
await fs.copyFile(path.join(root, 'src', 'browser-api.js'), path.join(outDir, 'browser-api.js'));

await fs.writeFile(
  path.join(outDir, 'background.js'),
  'console.log("tab-saver background loaded");'
);

console.log(`static files copied to: ${outDir}`);