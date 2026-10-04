import assert from 'node:assert/strict';
import { build } from 'esbuild';

const root = new EventTarget();
globalThis.document = new EventTarget();
document.visibilityState = 'visible';
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = new EventTarget();
let poll;
window.setInterval = (callback, delay) => { assert.equal(delay, 30_000); poll = callback; };
let now = 10_000;
Date.now = () => now;
let userId = 'owner';
let requests = 0;
let release;
let failure = false;
globalThis.syncTest = {
  user: async () => ({ id: userId }),
  pending: async () => ({ pendingTabIds: ['consumed'] }),
  favorites: async () => ['remote'],
  groups: async (id) => {
    assert.equal(id, 'owner');
    requests++;
    if (release) await new Promise((resolve) => { release = resolve; });
    if (failure) throw new Error('offline');
    return [{ id: 'remote', is_fixed: false, tabs: [{ id: 'keep' }, { id: 'consumed' }] }];
  }
};
const result = await build({
  entryPoints: ['src/shared/auto-sync.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'sync-test', setup(builder) {
    builder.onResolve({ filter: /^\.\/(supabase|restoration)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === './supabase'
      ? 'export const getCurrentSessionUser = () => globalThis.syncTest.user(); export const listGroups = (id) => globalThis.syncTest.groups(id); export const getFavoriteGroupIds = () => globalThis.syncTest.favorites();'
      : 'export const retryPendingConsumption = () => globalThis.syncTest.pending(); export const hidePendingTabs = (groups, ids) => groups.map(g => ({...g, tabs: g.tabs.filter(t => !ids.includes(t.id))}));' }));
  } }]
});
const { startDashboardAutoSync } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const state = {
  allGroups: [], favoriteGroupIds: [], selectedGroupIds: ['gone', 'remote'], expandedGroupIds: ['gone'],
  saveGroupId: 'gone', pendingUpdates: 0, pageStatus: '保存しました。', syncStatus: '', searchQuery: '検索',
  importText: 'draft', editingGroupId: null
};
let renders = 0;
startDashboardAutoSync(root, state, () => userId, () => { renders++; });
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate); };
async function trigger(target = window, event = 'focus') {
  now += 2000;
  target.dispatchEvent(new Event(event));
  await settle();
}
await trigger();
assert.deepEqual(state.allGroups[0].tabs, [{ id: 'keep' }]);
assert.deepEqual(state.favoriteGroupIds, ['remote']);
assert.deepEqual(state.selectedGroupIds, ['remote']);
assert.deepEqual(state.expandedGroupIds, []);
assert.equal(state.saveGroupId, '');
assert.equal(state.pageStatus, '保存しました。');
assert.equal(state.searchQuery, '検索');
assert.equal(state.importText, 'draft');
assert.match(state.syncStatus, /最終同期/);
const initialRequests = requests;
for (const key of ['restoreBusy', 'actionBusy', 'refreshBusy', 'authBusy', 'importBusy', 'saveWindowBusy', 'configBusy']) {
  state[key] = true;
  await trigger();
  state[key] = false;
}
state.pendingUpdates = 1;
await trigger();
state.pendingUpdates = 0;
state.editingGroupId = 'remote';
await trigger();
state.editingGroupId = null;
root.dispatchEvent(new Event('compositionstart'));
await trigger();
root.dispatchEvent(new Event('compositionend'));
document.visibilityState = 'hidden';
await trigger();
document.visibilityState = 'visible';
navigator.onLine = false;
await trigger();
navigator.onLine = true;
assert.equal(requests, initialRequests, 'Busy, hidden, offline and composing pages must not fetch');

for (const interrupt of [
  () => root.dispatchEvent(new Event('input')),
  () => { state.allGroups = [{ id: 'local', tabs: [] }]; },
  () => { userId = 'another'; },
  () => { state.pendingUpdates = 1; }
]) {
  release = true;
  await trigger();
  const beforeRenders = renders;
  const beforeRequests = requests;
  await trigger();
  assert.equal(requests, beforeRequests, 'Focus events must not overlap requests');
  interrupt();
  const expected = state.allGroups;
  release();
  release = null;
  await settle();
  assert.equal(state.allGroups, expected, 'Stale responses must not replace local changes');
  assert.equal(renders, beforeRenders);
  userId = 'owner';
  state.pendingUpdates = 0;
}
failure = true;
const beforeFailure = state.allGroups;
await trigger(window, 'online');
assert.equal(state.allGroups, beforeFailure, 'Network failure must retain existing data');
assert.match(state.syncStatus, /自動同期失敗/);
failure = false;
now += 30_000;
poll();
await settle();
assert.equal(state.allGroups[0].id, 'remote', 'Polling retries failed synchronization');
assert.match(state.syncStatus, /最終同期/);
await trigger(document, 'visibilitychange');
console.log('Auto-sync checks passed');
