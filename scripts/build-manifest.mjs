import fs from 'node:fs/promises';
import path from 'node:path';

const browser = process.argv[2];
if (!browser || !['chrome', 'firefox'].includes(browser)) {
  throw new Error('usage: node scripts/build-manifest.mjs <chrome|firefox>');
}

const root = process.cwd();
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));
const base = JSON.parse(await fs.readFile(path.join(root, 'manifests', 'base.json'), 'utf-8'));
const specific = JSON.parse(await fs.readFile(path.join(root, 'manifests', `${browser}.json`), 'utf-8'));

const outDir = path.join(root, 'dist', browser);
await fs.mkdir(outDir, { recursive: true });

const manifest = {
  ...base,
  ...specific,
  version: pkg.version,
  permissions: [...new Set([...(base.permissions ?? []), ...(specific.permissions ?? [])])],
  host_permissions: [...new Set([...(base.host_permissions ?? []), ...(specific.host_permissions ?? [])])]
};

await fs.writeFile(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf-8'
);