import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { build } from 'esbuild';

let moduleId = 0;
async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${moduleId++}`);
}

const model = await loadModule('src/shared/dashboard-model.ts');
const groupState = await loadModule('src/shared/group-state.ts');
const { reconcileGroupIds } = await loadModule('src/shared/group-helpers.ts');
const { summarizeGroupCollection } = await loadModule('src/shared/group-summary.ts');
const { matchesDateRangeFilter } = await loadModule('src/shared/group-age.ts');
mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-22T12:00:00Z') });
try {
  const groups = [
    { id: 'old', title: 'Research', device_id: 'PC', created_at: '2026-08-01T12:00:00Z', is_fixed: false,
      tabs: [{ id: 'a', title: 'Alpha', url: 'https://a.test', position: 0 }] },
    { id: 'new', title: 'Work', device_id: 'PC', created_at: '2026-09-22T12:00:00Z', is_fixed: false,
      tabs: [{ id: 'b', title: 'Beta', url: 'https://b.test', position: 0 }] },
    { id: 'archive', title: 'Research', device_id: 'Tablet', created_at: '2026-09-21T12:00:00Z', is_fixed: true,
      tabs: [{ id: 'c', title: 'Alpha', url: 'https://c.test', position: 0 }] }
  ];
  const before = structuredClone(groups);
  const state = model.createInitialState({ isAndroidFirefox: false, uiMode: 'default' });
  const ids = (options = {}, input = groups) => model.queryGroups(input, { ...state, ...options }).map((g) => g.id);
  assert.deepEqual(ids(), ['new', 'archive', 'old']);
  assert.deepEqual(ids({ sortMode: 'oldest' }), ['old', 'archive', 'new']);
  assert.deepEqual(ids({ sortMode: 'tabCount' }), ['new', 'archive', 'old']);
  for (const sortMode of ['newest', 'oldest', 'tabCount']) {
    assert.equal(ids({ sortMode, favoriteGroupIds: ['old'] })[0], 'old');
  }
  assert.deepEqual(ids({ searchQuery: ' ALPHA ', favoriteOnly: true, favoriteGroupIds: ['old', 'archive'],
    deviceFilter: 'PC', groupFilter: 'all', dateRangeFilter: 'stale' }), ['old']);
  assert.deepEqual(ids({ groupFilter: 'fixed' }), ['archive']);
  assert.deepEqual(ids({ groupFilter: 'fixed', favoriteOnly: true, favoriteGroupIds: ['old'] }), []);
  assert.deepEqual(ids({ groupFilter: 'fixed', favoriteOnly: true, favoriteGroupIds: ['archive'] }), ['archive']);
  assert.deepEqual(ids({ dateRangeFilter: 'today' }), ['new']);
  assert.deepEqual(ids({ dateRangeFilter: 'week' }), ['new', 'archive']);
  assert.deepEqual(ids({}, [groups[1], { ...groups[1], id: 'tie' }]), ['new', 'tie']);
  assert.deepEqual(ids({ sortMode: 'tabCount' }, [groups[1], { ...groups[0], tabs: [...groups[0].tabs, ...groups[1].tabs] }]), ['old', 'new']);
  assert.deepEqual(model.summarizeSelectedGroups(groups, ['old', 'new', 'old', 'missing']), {
    selectedCount: 2, selectedTabCount: 2, restorableGroupCount: 2
  });
  assert.deepEqual(summarizeGroupCollection(groups), {
    groupCount: 3, totalTabs: 3, deviceCount: 2,
    restorableGroupCount: 3, staleGroupCount: 1, staleTabCount: 1
  });
  assert.deepEqual(model.collectDeviceFilterOptions(groups), [
    { value: 'PC', label: 'PC (2)', count: 2 }, { value: 'Tablet', label: 'Tablet (1)', count: 1 }
  ]);
  for (const days of [0, 6, 7, 29, 30]) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    assert.equal(matchesDateRangeFilter(date.toISOString(), 'today'), days === 0);
    assert.equal(matchesDateRangeFilter(date.toISOString(), 'week'), days < 7);
    assert.equal(matchesDateRangeFilter(date.toISOString(), 'month'), days < 30);
    assert.equal(matchesDateRangeFilter(date.toISOString(), 'stale'), days >= 30);
  }
  assert.equal(state.visibleGroupCount, Number.MAX_SAFE_INTEGER);
  const light = model.createInitialState({ isAndroidFirefox: true, uiMode: 'lightweight' });
  assert.equal(light.visibleGroupCount, 12);
  assert.equal(model.LIGHTWEIGHT_GROUP_BATCH_SIZE, 12);
  assert.equal(groupState.visibleGroups(Array(15).fill(groups[0]), light.visibleGroupCount).length, 12);
  groupState.resetVisibleGroupCount(state, 12);
  assert.equal(state.visibleGroupCount, 12);
  groupState.resetVisibleGroupCount(state, null);
  assert.equal(state.visibleGroupCount, Number.MAX_SAFE_INTEGER);
  const selected = ['archive', 'missing', 'old', 'archive'];
  assert.deepEqual(reconcileGroupIds(selected, groups), ['archive', 'old', 'archive']);
  assert.deepEqual(groupState.reconcileExpandedGroupIds(selected, groups, 1), ['archive']);
  assert.deepEqual(groupState.reconcileExpandedGroupIds(selected, groups, null), ['archive', 'old', 'archive']);
  assert.deepEqual(reconcileGroupIds(selected, []), []);
  assert.deepEqual(groups, before);
} finally {
  mock.timers.reset();
}
console.log('Dashboard regression checks passed.');

const { configToFormFields, configFromFormFields } = await loadModule('src/shared/config-form.ts');
const config = { supabaseUrl: ' https://example.supabase.co ', supabaseKey: ' key ',
  ignoreDomains: ['a.test', 'b.test', 'a.test'], ignoreTitles: ['First', 'Second'] };
const originalConfig = structuredClone(config);
const fields = configToFormFields(config);
assert.equal(fields.config, config);
assert.equal(fields.ignoreDomainsText, 'a.test\nb.test\na.test');
assert.equal(fields.ignoreTitlesText, 'First\nSecond');
assert.deepEqual(configFromFormFields({ ...fields, ignoreDomainsText: ' a.test \r\n\n b.test\na.test ', ignoreTitlesText: ' First \n \n Second ' }), {
  supabaseUrl: 'https://example.supabase.co', supabaseKey: 'key',
  ignoreDomains: ['a.test', 'b.test', 'a.test'], ignoreTitles: ['First', 'Second']
});
const emptyConfig = { supabaseUrl: '', supabaseKey: '', ignoreDomains: [], ignoreTitles: [] };
assert.deepEqual(configFromFormFields(configToFormFields(emptyConfig)), emptyConfig);
assert.deepEqual(configFromFormFields({ config: { ...emptyConfig, supabaseUrl: ' ', supabaseKey: '\t' }, ignoreDomainsText: '\n ', ignoreTitlesText: '\t\n' }), emptyConfig);
assert.deepEqual(config, originalConfig);
console.log('Config form regression checks passed.');

for (const browser of ['chrome', 'firefox']) {
  let response;
  let failure;
  let sent;
  const runtime = {
    sendMessage(message, callback) {
      sent = message;
      if (browser === 'firefox') {
        assert.equal(callback, undefined);
        return failure ? Promise.reject(new Error(failure)) : Promise.resolve(response);
      }
      assert.equal(typeof callback, 'function');
      queueMicrotask(() => {
        runtime.lastError = failure ? { message: failure } : undefined;
        try { callback(response); } finally { delete runtime.lastError; }
      });
    }
  };
  globalThis.chrome = { runtime };
  if (browser === 'firefox') globalThis.browser = globalThis.chrome;
  try {
    const { requestCurrentWindowTabs, requestActiveTab } = await loadModule('src/shared/messages.ts');
    for (const [request, type, field, value, fallback] of [
      [requestCurrentWindowTabs, 'get-current-window-tabs', 'tabs', [{ id: 1, url: 'https://a.test' }], 'ウィンドウ内のタブ取得に失敗しました。'],
      [requestActiveTab, 'get-active-tab', 'tab', { id: 1, url: 'https://a.test' }, '現在タブの取得に失敗しました。']
    ]) {
      response = { ok: true, [field]: value };
      assert.deepEqual(await request(), value);
      assert.deepEqual(sent, { type });
      response = { ok: true, [field]: field === 'tabs' ? [] : null };
      assert.deepEqual(await request(), response[field]);
      for (response of [undefined, { ok: true }, { ok: false }]) {
        await assert.rejects(request, { message: fallback });
      }
      response = { ok: false, error: 'Backend error' };
      await assert.rejects(request, { message: 'Backend error' });
      failure = 'Connection closed';
      await assert.rejects(request, { message: failure });
      failure = undefined;
    }
  } finally {
    delete globalThis.chrome;
    delete globalThis.browser;
  }
  console.log(`${browser} messaging regression checks passed.`);
}
const noRuntime = await loadModule('src/shared/messages.ts');
await assert.rejects(noRuntime.requestActiveTab, { message: 'runtime messaging is not available in this environment.' });
