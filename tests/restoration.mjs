import assert from 'node:assert/strict';
import { build } from 'esbuild';

let serial = 0;
let groups;
let userId = 'owner';
let project = 'https://project.test';
let opened;
let failOpenAt;
let failConsume;
let beforeConsume;
let failReadAfterOpen;
const stored = {};
const makeGroup = (fixed = false) => ({ id: 'g', title: 'Work', device_id: 'PC',
  created_at: '2026-09-23', is_fixed: fixed,
  tabs: ['a', 'b', 'c'].map((id, position) => ({ id, url: `https://${id}.test`, title: id, position })) });
const getGroup = async (id) => {
  if (failReadAfterOpen && opened.length) throw new Error('Read failed');
  return structuredClone(groups.find((group) => group.id === id) ?? null);
};
globalThis.restoreTest = {
  getGroup,
  getCurrentSessionUser: async () => userId ? { id: userId } : null,
  getConfig: async () => ({ supabaseUrl: project }),
  async consumeRestoredTabs(id, ids) {
    if (failConsume) throw new Error('Offline');
    beforeConsume?.();
    const group = groups.find((group) => group.id === id);
    if (!group || group.is_fixed) return;
    group.tabs = group.tabs.filter((tab) => !ids.includes(tab.id));
    if (!group.tabs.length) groups = groups.filter((group) => group.id !== id);
  }
};
function reset(fixed = false) {
  groups = [makeGroup(fixed)]; opened = []; failOpenAt = -1;
  failConsume = false; beforeConsume = null; failReadAfterOpen = false;
  userId = 'owner'; project = 'https://project.test';
  for (const key of Object.keys(stored)) delete stored[key];
}
const openNative = async (properties) => {
  if (opened.length === failOpenAt) throw new Error('Blocked');
  opened.push(properties);
  return { id: 123 };
};
const api = { tabs: { create: openNative }, windows: { create: openNative }, storage: { local: {
  get: async (keys) => keys === null ? structuredClone(stored) : Object.fromEntries(
    (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(stored[key])])),
  set: async (items) => Object.assign(stored, structuredClone(items)),
  remove: async (keys) => { for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key]; }
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
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}#${serial++}`);
}
try {
  for (const browser of ['chrome', 'firefox']) {
    globalThis.chrome = api;
    if (browser === 'firefox') globalThis.browser = api;
    const service = await loadRestoration();
    reset();
    let result = await service.restoreSavedTabs('g', ['a'], false);
    assert.deepEqual(result.openedTabIds, ['a']);
    assert.deepEqual(result.group.tabs.map((tab) => tab.id), ['b', 'c']);
    assert.equal(opened.length, 1);
    result = await service.restoreSavedTabs('g', ['b', 'c'], true);
    assert.equal(result.group, null);
    assert.equal(groups.length, 0);
    assert.equal(opened[2].windowId, 123);
    assert.deepEqual(stored, {});

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
    assert.deepEqual(groups[0].tabs.map((tab) => tab.id), ['b', 'c']);
    reset(); failOpenAt = 0;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(groups[0].tabs.length, 3);
    assert.equal(result.openedTabIds.length, 0);

    reset(); failConsume = true;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.match(result.error, /削除同期に失敗/);
    assert.deepEqual(result.pendingTabIds, ['a']);
    assert.deepEqual(result.group.tabs.map((tab) => tab.id), ['b', 'c']);
    assert.equal(groups[0].tabs.length, 3);
    assert.equal(Object.keys(stored).length, 1);
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
    assert.deepEqual(groups[0].tabs.map((tab) => tab.id), ['b', 'c']);
    assert.deepEqual(stored, {});

    reset(); groups = [];
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(result.group, null);
    assert.equal(opened.length, 0, 'Deleted remote groups must not be opened from stale UI');
    reset(); groups[0].tabs = groups[0].tabs.filter((tab) => tab.id !== 'a');
    await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(opened.length, 0);
    reset(); beforeConsume = () => groups[0].tabs.push({ id: 'new', url: 'https://new.test', position: 3 });
    result = await service.restoreSavedTabs('g', ['a', 'b', 'c'], true);
    assert.deepEqual(result.group.tabs.map((tab) => tab.id), ['new'], 'Concurrent additions survive');
    reset(); beforeConsume = () => { groups[0].is_fixed = true; };
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(result.group.tabs.length, 3, 'Fixing during restore prevents consumption');
    reset(); failReadAfterOpen = true;
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.match(result.error, /一覧更新失敗/);
    assert.deepEqual(result.group.tabs.map((tab) => tab.id), ['b', 'c']);
    reset(); groups[0].tabs[0].url = 'javascript:alert(1)';
    result = await service.restoreSavedTabs('g', ['a'], false);
    assert.equal(opened.length, 0);
    assert.equal(groups[0].tabs.length, 3);
    reset(); userId = null;
    await assert.rejects(service.restoreSavedTabs('g', ['a'], false), /ログイン/);
    assert.equal(opened.length, 0);
    delete globalThis.browser;
    console.log(`${browser} restoration / partial failure / durable retry checks passed.`);
  }

  reset();
  const webService = await loadRestoration();
  const windows = [];
  globalThis.window = { open() {
    if (windows.length === 1) return null;
    const next = { closed: false, opener: {}, location: { replace(url) { next.url = url; } }, close() { next.closed = true; } };
    windows.push(next); return next;
  } };
  const prepared = webService.prepareWebRestore(3);
  assert.equal(windows.length, 1, 'Popups are reserved synchronously');
  let result = await webService.restoreSavedTabs('g', ['a', 'b', 'c'], true, prepared.open);
  prepared.closeUnused();
  assert.equal(windows[0].opener, null);
  assert.equal(windows[0].url, 'https://a.test');
  assert.deepEqual(result.openedTabIds, ['a']);
  assert.deepEqual(groups[0].tabs.map((tab) => tab.id), ['b', 'c']);
  assert.match(result.error, /ポップアップ/);
  windows.length = 0;
  const unused = webService.prepareWebRestore(1);
  await assert.rejects(unused.open({ url: 'file:///private/test' }), /HTTP/);
  unused.closeUnused(); assert.equal(windows[0].closed, true);
  assert.deepEqual(webService.hidePendingTabs([makeGroup()], ['a', 'b', 'c']), []);
  assert.equal(webService.hidePendingTabs([makeGroup(true)], ['a', 'b', 'c'])[0].tabs.length, 3);
  console.log('Web popup / pending queue checks passed.');
} finally {
  delete globalThis.chrome; delete globalThis.browser; delete globalThis.window; delete globalThis.restoreTest;
}

// Exercise the actual dashboard handlers with deferred responses. No DOM package is needed.
const { readFile } = await import('node:fs/promises');
for (const kind of ['newtab', 'tablet']) {
  const className = kind === 'newtab' ? 'NewtabApp' : 'TabletApp';
  const source = (await readFile(`src/${kind}/main.ts`, 'utf8')).split("const target = document.getElementById('app');")[0]
    + `\nexport { ${className} as App };`;
  let resolveRestore;
  let calls = 0;
  let rejectRestore;
  const responses = [];
  const restore = () => {
    calls++;
    return new Promise((resolve, reject) => { resolveRestore = resolve; rejectRestore = reject; });
  };
  globalThis.dashboardRestore = restore;
  const built = await build({ stdin: { contents: source, loader: 'ts', resolveDir: `${process.cwd()}/src/${kind}` },
    bundle: true, platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'dashboard-test', setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock-ui' }));
      builder.onResolve({ filter: /\/restoration$/ }, () => ({ path: 'restoration', namespace: 'mock-ui' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock-ui' }, ({ path }) => ({ contents: path === 'css' ? '' : `
        export const restoreSavedTabs = (...args) => globalThis.dashboardRestore(...args);
        export const prepareWebRestore = () => ({ open() {}, closeUnused() {} });
        export const retryPendingConsumption = async () => ({ pendingTabIds: [] });
        export const hidePendingTabs = (groups, ids) => groups.flatMap(group => {
          if (group.is_fixed) return [group];
          const tabs = group.tabs.filter(tab => !ids.includes(tab.id));
          return tabs.length ? [{ ...group, tabs }] : [];
        });` }));
    } }]
  });
  const { App } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}#ui-${kind}`);
  const app = new App({ addEventListener() {} }, { isAndroidFirefox: false, uiMode: 'default' });
  app.render = () => { responses.push(structuredClone(app.state)); };
  if (kind === 'newtab') app.restoreInBackground = restore;
  const original = [makeGroup(), { ...makeGroup(true), id: 'fixed' }];
  app.state.allGroups = structuredClone(original);
  app.state.favoriteGroupIds = ['g', 'fixed'];
  app.state.selectedGroupIds = ['g', 'fixed'];
  const running = app.handleRestoreSelectedGroups();
  assert.equal(app.state.restoreBusy, true);
  assert.deepEqual(app.state.allGroups.map((group) => group.id), ['fixed'], 'Optimism consumes only ordinary groups');
  await app.refreshAll();
  assert.deepEqual(app.state.allGroups.map((group) => group.id), ['fixed'], 'Refresh cannot overwrite an in-flight mutation');
  resolveRestore({ group: null, openedTabIds: ['a', 'b', 'c'], pendingTabIds: [] });
  await new Promise((resolve) => setImmediate(resolve));
  resolveRestore({ group: original[1], openedTabIds: [], pendingTabIds: [], error: '復元失敗: Blocked' });
  await running;
  assert.equal(app.state.restoreBusy, false);
  assert.deepEqual(app.state.allGroups.map((group) => group.id), ['fixed']);
  assert.deepEqual(app.state.favoriteGroupIds, ['fixed']);
  assert.match(app.state.pageStatus, /3 タブ復元.*失敗/);
  assert.equal(calls, 2);
  app.state.allGroups = structuredClone(original);
  const failing = app.handleRestore('g');
  rejectRestore(new Error('復元失敗: Network'));
  await failing;
  assert.equal(app.state.allGroups.find((group) => group.id === 'g').tabs.length, 3);
  app.state.allGroups = structuredClone(original);
  const partial = app.handleOpenTab('a');
  resolveRestore({ group: { ...original[0], tabs: original[0].tabs.slice(1) }, openedTabIds: ['a'],
    pendingTabIds: ['a'], error: '復元後の削除同期に失敗' });
  await partial;
  assert.deepEqual(app.state.allGroups.find((group) => group.id === 'g').tabs.map((tab) => tab.id), ['b', 'c']);
  assert.match(app.state.pageStatus, /削除同期に失敗/);
  delete globalThis.dashboardRestore;
  console.log(`${kind} optimistic handler / partial rollback checks passed.`);
}
