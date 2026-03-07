import fs from 'node:fs/promises';
import path from 'node:path';

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  throw new Error('usage: node scripts/build-manifest.mjs <chrome|firefox>');
}

const root = process.cwd();
const basePath = path.join(root, 'manifests', 'base.json');
const browserPath = path.join(root, 'manifests', `${browser}.json`);
const outDir = path.join(root, 'dist', browser);
const outPath = path.join(outDir, 'manifest.json');

const base = JSON.parse(await fs.readFile(basePath, 'utf-8'));
const specific = JSON.parse(await fs.readFile(browserPath, 'utf-8'));

const merged = {
  ...base,
  ...specific,
  permissions: [...new Set([...(base.permissions ?? []), ...(specific.permissions ?? [])])],
  host_permissions: [...new Set([...(base.host_permissions ?? []), ...(specific.host_permissions ?? [])])]
};

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, JSON.stringify(merged, null, 2));
console.log(`manifest generated: ${outPath}`);