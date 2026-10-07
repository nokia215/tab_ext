// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import type { TabGroup, SavedTab } from '../src/shared/types.ts';
import type { RestoreResult } from '../src/shared/restoration.ts';

let serial = 0;
let groups: TabGroup[] = [];
let userId: string | null = 'owner';
let project = 'https://project.test';
let opened: { url?: string | string[]; active?: boolean; windowId?: number }[] = [];
let failOpenAt = -1;
let failConsume = false;
let beforeConsume: (() => void) | null = null;
let failReadAfterOpen = false;
const stored: Record<string, unknown> = {};
const makeGroup = (fixed = false) => ({ id: 'g', title: 'Work', device_id: 'PC',
  created_at: '2026-09-23', is_fixed: fixed,
  tabs: ['a', 'b', 'c'].map((id, position) => ({ id, url: `https://${id}.test`, title: id, position })) });
const getGroup = async (id: string) => {
  if (failReadAfterOpen && opened.length) throw new Error('Read failed');
  return structuredClone(groups.find((group: TabGroup) => group.id === id) ?? null);
};
testGlobal.restoreTest = {
  getGroup,
  getCurrentSessionUser: async () => userId ? { id: userId } : null,
  getConfig: async () => ({ supabaseUrl: project }),
  async consumeRestoredTabs(id: string, ids: string[]) {
    beforeConsume?.();
    if (failConsume) throw new Error('Offline');
    const group = groups.find((group: TabGroup) => group.id === id);
    if (!group || group.is_fixed) return;
    group.tabs = group.tabs.filter((tab) => !ids.includes(tab.id));
    if (!group.tabs.length && !group.is_favorite) groups = groups.filter((group) => group.id !== id);
  }
};
function reset(fixed = false) {
  groups = [makeGroup(fixed)]; opened = []; failOpenAt = -1;
  failConsume = false; beforeConsume = null; failReadAfterOpen = false;
  userId = 'owner'; project = 'https://project.test';
  for (const key of Object.keys(stored)) delete stored[key];
}
const openNative = async (properties: { url?: string | string[]; active?: boolean; windowId?: number }) => {
  if (opened.length === failOpenAt) throw new Error('Blocked');
  opened.push(properties);
  return { id: 123 };
};
const api = { tabs: { create: openNative }, windows: { create: openNative }, storage: { local: {
  get: async (keys: string | string[] | null) => keys === null ? structuredClone(stored) : Object.fromEntries(
    (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(stored[key])])),
  set: async (items: Record<string, unknown>) => Object.assign(stored, structuredClone(items)),
  remove: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key]; }
} } };
async function loadRestoration() {
  const built = await build({ entryPoints: ['src/shared/restoration.ts'], bundle: true,
    platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'restore-test', setup(builder) {
      builder.onResolve({ filter: /^\.\/(supabase|storage)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path.endsWith('supabase')
        ? 'export const { getGroup, getCurrentSessionUser, consumeRestoredTabs } = globalThis.restoreTest;'
        : 'export const { getConfig } = globalThis.restoreTest;' }));
    } }]
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}#${serial++}`);
}
try {
  for (const browser of ['chrome', 'firefox']) {
    testGlobal.chrome = api;
    if (browser === 'firefox') testGlobal.browser = api;
    const service = await loadRestoration();
    reset();
    let result = await service.restoreSavedTabs('g', ['a'], false);
    assert.deepEqual(result.openedTabIds, ['a']);
    assert.deepEqual(result.group.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
    assert.equal(opened.length, 1);
    result = await service.restoreSavedTabs('g', ['b', 'c'], true);
    assert.equal(result.group, null);
    assert.equal(groups.length, 0);
    assert.equal(opened[2]!.windowId, 123);
    assert.deepEqual(stored, {});

    for (const failure of ['none', 'consume', 'read']) {
      reset(); groups[0]!.is_favorite = true;
      failConsume = failure === 'consume'; failReadAfterOpen = failure === 'read';
      result = await service.restoreSavedTabs('g', ['a', 'b', 'c'], true);
      assert.equal(result.group.id, 'g', 'Empty favorite groups survive restore and sync failures');
      assert.equal(result.group.title, 'Work');
      assert.equal(result.group.is_favorite, true);
      assert.deepEqual(result.group.tabs, []);
      assert.equal(groups.length, 1);
      if (failConsume) {
        failConsume = false;
        await service.retryPendingConsumption();
        assert.equal(groups[0]!.tabs.length, 0);
        assert.deepEqual(stored, {});
      }
    }

    reset(true);
    for (let iteration = 0; iteration < 2; iteration++) {
      result = await service.restoreSavedTabs('g', ['a', 'b', 'c'], true);
      assert.equal(result.group.tabs.length, 3);
    }
    assert.equal(opened.length, 6, 'Fixed groups can be reused');
    assert.deepEqual(stored, {});

    reset(); failOpenAt = 1;
    result = await service.restoreSavedTabs('g', ['a', 'b', 'c'], true);
    assert.match(result.error, /復元失敗/);
    assert.deepEqual(result.openedTabIds, ['a']);
    assert.deepEqual(groups[0]!.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
    reset(); failOpenAt = 0;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(groups[0]!.tabs.length, 3);
    assert.equal(result.openedTabIds.length, 0);

    reset(); failConsume = true;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.match(result.error, /削除同期に失敗/);
    assert.deepEqual(result.pendingTabIds, ['a']);
    assert.deepEqual(result.group.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
    assert.equal(groups[0]!.tabs.length, 3);
    assert.equal(Object.keys(stored).length, 1);
    groups.push({ ...makeGroup(), id: 'other' });
    beforeConsume = () => {
      assert.equal(opened.length, 2, 'New tabs open before pending remote consumption');
    };
    result = await service.restoreSavedTabs('other', ['b'], false);
    assert.deepEqual(result.openedTabIds, ['b'], 'An unrelated pending deletion must not block restore');
    assert.equal(Object.keys(stored).length, 2);
    groups = groups.filter((group) => group.id === 'g');
    for (const key of Object.keys(stored)) {
      if ((stored[key] as { groupId: string }).groupId === 'other') delete stored[key];
    }
    opened.pop();
    beforeConsume = null;
    const reloaded = await loadRestoration();
    await reloaded.restoreSavedTabs('g', ['a'], false);
    assert.equal(opened.length, 1, 'An unsynced open must never be reopened on retry');
    userId = 'another';
    assert.deepEqual((await reloaded.retryPendingConsumption()).pendingTabIds, []);
    assert.equal(Object.keys(stored).length, 1, 'Another account must not consume pending IDs');
    userId = 'owner'; project = 'https://other-project.test';
    await reloaded.retryPendingConsumption();
    assert.equal(Object.keys(stored).length, 1, 'Another project must not consume pending IDs');
    project = 'https://project.test'; failConsume = false;
    await reloaded.retryPendingConsumption();
    assert.equal(opened.length, 1);
    assert.deepEqual(groups[0]!.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
    assert.deepEqual(stored, {});

    reset(); groups = [];
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(result.group, null);
    assert.equal(opened.length, 0, 'Deleted remote groups must not be opened from stale UI');
    reset(); groups[0]!.tabs = groups[0]!.tabs.filter((tab) => tab.id !== 'a');
    await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(opened.length, 0);
    reset(); beforeConsume = () => groups[0]!.tabs.push({ id: 'new', url: 'https://new.test', title: 'New', position: 3 });
    result = await service.restoreSavedTabs('g', ['a', 'b', 'c'], true);
    assert.deepEqual(result.group.tabs.map((tab: SavedTab) => tab.id), ['new'], 'Concurrent additions survive');
    reset(); beforeConsume = () => { groups[0]!.is_fixed = true; };
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(result.group.tabs.length, 3, 'Fixing during restore prevents consumption');
    reset(); failReadAfterOpen = true;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.match(result.error, /一覧更新失敗/);
    assert.deepEqual(result.group.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
    reset(); groups[0]!.tabs[0]!.url = 'javascript:alert(1)';
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(opened.length, 0);
    assert.equal(groups[0]!.tabs.length, 3);
    reset(); userId = null;
    await assert.rejects(service.restoreSavedTabs('g', ['a'], false), /ログイン/);
    assert.equal(opened.length, 0);
    delete testGlobal.browser;
    console.log(`${browser} restoration / partial failure / durable retry checks passed.`);
  }

  reset();
  const webService = await loadRestoration();
  type MockWindow = { closed: boolean; opener: object | null; url?: string; location: { replace(url: string): void }; close(): void };
  const windows: MockWindow[] = [];
  testGlobal.window = { open() {
    if (windows.length === 1) return null;
    const next: MockWindow = { closed: false, opener: {}, location: { replace(url: string) { next.url = url; } }, close() { next.closed = true; } };
    windows.push(next); return next;
  } };
  const prepared = webService.prepareWebRestore(3);
  assert.equal(windows.length, 1, 'Popups are reserved synchronously');
  let result = await webService.restoreSavedTabs('g', ['a', 'b', 'c'], true, prepared.open);
  prepared.closeUnused();
  assert.equal(windows[0]!.opener, null);
  assert.equal(windows[0]!.url, 'https://a.test');
  assert.deepEqual(result.openedTabIds, ['a']);
  assert.deepEqual(groups[0]!.tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
  assert.match(result.error, /ポップアップ/);
  windows.length = 0;
  const unused = webService.prepareWebRestore(1);
  await assert.rejects(unused.open({ url: 'file:///private/test' }), /HTTP/);
  unused.closeUnused(); assert.equal(windows[0]!.closed, true);
  assert.deepEqual(webService.hidePendingTabs([makeGroup()], ['a', 'b', 'c']), []);
  assert.equal(webService.hidePendingTabs([makeGroup(true)], ['a', 'b', 'c'])[0].tabs.length, 3);
  assert.equal(webService.hidePendingTabs([{ ...makeGroup(), is_favorite: true }], ['a', 'b', 'c'])[0].tabs.length, 0);
  assert.equal(webService.hidePendingTabs([makeGroup()], ['a', 'b', 'c'], ['g'])[0].tabs.length, 0);
  console.log('Web popup / pending queue checks passed.');
} finally {
  delete testGlobal.chrome; delete testGlobal.browser; delete testGlobal.window; delete testGlobal.restoreTest;
}

// Exercise the actual dashboard handlers with deferred responses. No DOM package is needed.
const { readFile } = await import('node:fs/promises');
for (const kind of ['newtab', 'tablet']) {
  const className = kind === 'newtab' ? 'NewtabApp' : 'TabletApp';
  const source = (await readFile(`src/${kind}/main.ts`, 'utf8')).split("const target = document.getElementById('app');")[0]
    + `\nexport { ${className} as App };`;
  let resolveRestore: (result: RestoreResult) => void = () => { throw new Error('Restore was not started'); };
  let calls = 0;
  let rejectRestore: (error: Error) => void = () => { throw new Error('Restore was not started'); };
  const responses: unknown[] = [];
  const restore = () => {
    calls++;
    return new Promise<RestoreResult>((resolve, reject) => { resolveRestore = resolve; rejectRestore = reject; });
  };
  testGlobal.dashboardRestore = restore;
  const built = await build({ stdin: { contents: source, loader: 'ts', resolveDir: `${process.cwd()}/src/${kind}` },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'dashboard-test', setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock-ui' }));
      builder.onResolve({ filter: /\/dashboard-state\.svelte$/ }, () => ({ path: 'state', namespace: 'mock-ui' }));
      builder.onResolve({ filter: /\/restoration$/ }, () => ({ path: 'restoration', namespace: 'mock-ui' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock-ui' }, ({ path }) => ({ contents: path === 'css' ? '' : path === 'state' ? 'export const dashboards = { desktop: null, tablet: null };' : `
        export const restoreSavedTabs = (...args) => globalThis.dashboardRestore(...args);
        export const prepareWebRestore = () => ({ open() {}, closeUnused() {} });
        export const retryPendingConsumption = async () => ({ pendingTabIds: [] });
        export const hidePendingTabs = (groups, ids, favorites = []) => groups.flatMap(group => {
          if (group.is_fixed) return [group];
          const tabs = group.tabs.filter(tab => !ids.includes(tab.id));
          return tabs.length || favorites.includes(group.id) ? [{ ...group, tabs }] : [];
        });` }));
    } }]
  });
  const { App } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}#ui-${kind}`);
  const app = new App({ addEventListener() {} }, { isAndroidFirefox: false, uiMode: 'default' });
  app.render = () => { responses.push(structuredClone(app.state)); };
  if (kind === 'newtab') app.restore.prepareRestore = () => ({ restore, closeUnused() {} });
  const original = [{ ...makeGroup(), is_favorite: true }, { ...makeGroup(true), id: 'fixed' }];
  app.state.allGroups = structuredClone(original);
  app.state.favoriteGroupIds = ['g', 'fixed'];
  app.state.selectedGroupIds = ['g', 'fixed'];
  const running = app.restore.handleRestoreSelectedGroups();
  assert.equal(app.state.restoreBusy, true);
  assert.deepEqual(app.state.allGroups.map((group: TabGroup) => group.id), ['g', 'fixed'], 'Optimism retains empty favorites');
  assert.equal(app.state.allGroups[0]!.tabs.length, 0);
  await app.session.refreshAll();
  assert.deepEqual(app.state.allGroups.map((group: TabGroup) => group.id), ['g', 'fixed'], 'Refresh cannot overwrite an in-flight mutation');
  resolveRestore({ group: { ...original[0]!, tabs: [] }, openedTabIds: ['a', 'b', 'c'], pendingTabIds: [] });
  await new Promise((resolve) => setImmediate(resolve));
  resolveRestore({ group: original[1]!, openedTabIds: [], pendingTabIds: [], error: '復元失敗: Blocked' });
  await running;
  assert.equal(app.state.restoreBusy, false);
  assert.deepEqual(app.state.allGroups.map((group: TabGroup) => group.id), ['g', 'fixed']);
  assert.deepEqual(app.state.favoriteGroupIds, ['g', 'fixed']);
  assert.match(app.state.pageStatus, /3 タブ復元.*失敗/);
  assert.equal(calls, 2);
  app.state.allGroups = structuredClone(original);
  const failing = app.restore.handleRestore('g');
  rejectRestore(new Error('復元失敗: Network'));
  await failing;
  assert.equal(app.state.allGroups.find((group: TabGroup) => group.id === 'g').tabs.length, 3);
  app.state.allGroups = structuredClone(original);
  const partial = app.restore.handleOpenTab('a');
  resolveRestore({ group: { ...original[0]!, tabs: original[0]!.tabs.slice(1) }, openedTabIds: ['a'],
    pendingTabIds: ['a'], error: '復元後の削除同期に失敗' });
  await partial;
  assert.deepEqual(app.state.allGroups.find((group: TabGroup) => group.id === 'g').tabs.map((tab: SavedTab) => tab.id), ['b', 'c']);
  assert.match(app.state.pageStatus, /削除同期に失敗/);
  app.state.allGroups = structuredClone(original);
  const first = app.restore.handleOpenTab('a');
  const callCount = calls;
  const second = app.restore.handleOpenTab('b');
  const third = app.restore.handleOpenTab('c');
  assert.equal(app.state.allGroups.find((group: TabGroup) => group.id === 'g').tabs.length, 0,
    'Every rapid click updates the UI before the first remote response');
  assert.equal(calls, callCount, 'Queued restores do not overlap in the same group');
  resolveRestore({ group: { ...original[0]!, tabs: original[0]!.tabs.slice(1) }, openedTabIds: ['a'], pendingTabIds: [] });
  await first;
  assert.equal(app.state.restoreBusy, true, 'Refresh stays blocked while clicks remain queued');
  assert.equal(app.state.allGroups.find((group: TabGroup) => group.id === 'g').tabs.length, 0,
    'An earlier remote response must not resurrect later clicked tabs');
  rejectRestore(new Error('Second failed'));
  await second;
  rejectRestore(new Error('Third failed'));
  await third;
  assert.deepEqual(app.state.allGroups.find((group: TabGroup) => group.id === 'g').tabs.map((tab: SavedTab) => tab.id), ['b', 'c'],
    'Rollback restores failed clicks without resurrecting a successful open');
  assert.equal(app.state.restoreBusy, false);
  app.state.allGroups = [structuredClone(original[1]!)];
  const fixed = app.restore.handleOpenTab('a');
  const fixedCalls = calls;
  await app.restore.handleOpenTab('a');
  assert.equal(calls, fixedCalls, 'Repeated clicks on the same fixed tab are deduplicated');
  const fixedSecond = app.restore.handleOpenTab('b');
  resolveRestore({ group: original[1]!, openedTabIds: ['a'], pendingTabIds: [] });
  await fixed;
  resolveRestore({ group: original[1]!, openedTabIds: ['b'], pendingTabIds: [] });
  await fixedSecond;
  assert.equal(app.state.allGroups[0].tabs.length, 3, 'Fixed tabs remain reusable');
  app.state.allGroups = structuredClone(original);
  app.state.favoriteGroupIds = ['g'];
  const privateRestore = app.restore.handleOpenTab('a');
  app.state.sessionRevision++;
  app.state.allGroups = [];
  app.state.favoriteGroupIds = [];
  resolveRestore({ group: original[0]!, openedTabIds: ['a'], pendingTabIds: [] });
  await privateRestore;
  assert.deepEqual(app.state.allGroups, [], 'Old restore results cannot return private data after logout');
  assert.equal(app.state.restoreBusy, false);
  delete testGlobal.dashboardRestore;
  console.log(`${kind} optimistic handler / partial rollback checks passed.`);
}
