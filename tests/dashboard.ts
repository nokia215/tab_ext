import assert from 'node:assert/strict';
import { build } from 'esbuild';
import type { DashboardState } from '../src/shared/dashboard-model.ts';
import type { DashboardGroups as Groups } from '../src/shared/dashboard-groups.ts';
import type { TabGroup } from '../src/shared/types.ts';

// ponytail: mock only remote writes; use browser integration tests if DOM behavior changes.
let failWrite = false;
let failDeleteId = '';
let releaseWrite: () => void = () => {};
const testGlobal = globalThis as unknown as Record<string, unknown>;
testGlobal.dashboardWrites = {
  write: () => new Promise<void>((resolve, reject) => {
    releaseWrite = () => failWrite ? reject(new Error('Offline')) : resolve();
  }),
  delete: async (id: string) => { if (id === failDeleteId) throw new Error('Offline'); }
};
testGlobal.window = { confirm: () => true };
const built = await build({
  stdin: { contents: "export { DashboardGroups } from './src/shared/dashboard-groups'; export { createInitialState } from './src/shared/dashboard-model';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'dashboard-writes', setup(builder) {
    builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'writes', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
      export const setGroupFavorite = () => globalThis.dashboardWrites.write();
      export const setGroupFixed = () => globalThis.dashboardWrites.write();
      export const updateGroupTitle = () => globalThis.dashboardWrites.write();
      export const deleteGroup = id => globalThis.dashboardWrites.delete(id);
      export const buildDefaultGroupTitle = () => 'Default';
    ` }));
  } }]
});
const { DashboardGroups, createInitialState } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`);
const makeGroup = (id: string): TabGroup => ({ id, title: id, device_id: 'PC', created_at: '2026-10-01', is_fixed: false,
  tabs: [{ id: `tab-${id}`, url: `https://${id}.test`, title: id, position: 0 }] });

try {
  for (const uiMode of ['default', 'lightweight']) {
    const state: DashboardState = createInitialState({ isAndroidFirefox: false, uiMode });
    state.allGroups = Array.from({ length: 15 }, (_, i) => makeGroup(`g${i}`));
    let renders = 0;
    const groups: Groups = new DashboardGroups(state, () => { renders++; });
    groups.selectVisibleGroups();
    assert.equal(state.selectedGroupIds.length, uiMode === 'lightweight' ? 12 : 15);
    groups.toggleGroup('g0');
    groups.toggleGroup('g1');
    assert.deepEqual(state.expandedGroupIds, uiMode === 'lightweight' ? ['g1'] : ['g0', 'g1']);

    failWrite = false;
    const favorite = groups.handleToggleFavoriteGroup('g0');
    assert.deepEqual(state.favoriteGroupIds, ['g0'], 'Favorite appears before the server responds');
    assert.equal(state.actionBusy, false);
    assert.equal(state.pendingUpdates, 1);
    releaseWrite();
    await favorite;
    assert.equal(state.pendingUpdates, 0);

    failWrite = true;
    const unfavorite = groups.handleToggleFavoriteGroup('g0');
    assert.deepEqual(state.favoriteGroupIds, []);
    releaseWrite();
    await unfavorite;
    assert.deepEqual(state.favoriteGroupIds, ['g0'], 'Failed write restores the favorite');
    const fixed = groups.handleToggleFixedGroup('g0');
    assert.equal(groups.findGroup('g0')!.is_fixed, true);
    releaseWrite();
    await fixed;
    assert.equal(groups.findGroup('g0')!.is_fixed, false);
    assert.equal(state.pendingUpdates, 0);

    state.allGroups = [makeGroup('g0'), makeGroup('g1')];
    state.selectedGroupIds = ['g0', 'g1'];
    state.favoriteGroupIds = ['g0', 'g1'];
    state.expandedGroupIds = ['g0', 'g1'];
    failDeleteId = 'g1';
    const deletion = groups.handleDeleteSelectedGroups();
    assert.deepEqual(state.allGroups, [], 'Deletion updates the UI before remote completion');
    await deletion;
    assert.equal(state.allGroups.length, 1);
    assert.equal(groups.findGroup('g1')!.id, 'g1');
    assert.deepEqual(state.favoriteGroupIds, ['g1'], 'Partial failure restores only undeleted favorites');
    assert.equal(state.actionBusy, false);
    assert.match(state.pageStatus, /1 グループ削除後に失敗/);
    assert.ok(renders > 0);
  }
  console.log('Shared dashboard selection / optimistic update / partial deletion checks passed.');
} finally {
  delete testGlobal.dashboardWrites;
  delete testGlobal.window;
}
