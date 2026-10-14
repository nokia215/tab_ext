import assert from 'node:assert/strict';
import { build } from 'esbuild';

const testGlobal = globalThis as unknown as Record<string, unknown>;
const stored: Record<string, any> = { group_cache_by_user: {
  owner: { groups: [{ id: 'favorite', is_favorite: true }, { id: 'other', is_favorite: false }] },
  another: { groups: [{ id: 'private', is_favorite: true }] }
} };
testGlobal.cacheStorage = stored;
const built = await build({
  entryPoints: ['src/shared/storage.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'cache-storage', setup(builder) {
    builder.onResolve({ filter: /^\.\/browser-api$/ }, () => ({ path: 'storage', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
      export const storageLocalGet = async () => structuredClone(globalThis.cacheStorage);
      export const storageLocalSet = async value => Object.assign(globalThis.cacheStorage, structuredClone(value));
    ` }));
  } }]
});
const { getCachedGroups, saveCachedGroups, getOrCreateDeviceId } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`);
try {
  const cache = await getCachedGroups('owner');
  assert.deepEqual(cache.groups.map((group: any) => group.is_favorite), [true, false]);
  assert.equal('favorites' in cache, false);
  await saveCachedGroups('owner', cache.groups);
  assert.deepEqual(Object.keys(stored.group_cache_by_user.owner), ['groups']);
  assert.deepEqual((await getCachedGroups('owner')).groups, cache.groups);
  assert.equal((await getCachedGroups('another')).groups[0].id, 'private');
  assert.equal(await getCachedGroups('missing'), null);
  stored.device_id = '12345678-1234-1234-1234-123456789abc';
  assert.equal(await getOrCreateDeviceId(), stored.device_id, 'Persisted device IDs are never converted');
  delete stored.device_id;
  const deviceId = await getOrCreateDeviceId();
  assert.equal(stored.device_id, deviceId);
  assert.equal(await getOrCreateDeviceId(), deviceId);
  console.log('Single-source favorite cache checks passed.');
} finally {
  delete testGlobal.cacheStorage;
}
