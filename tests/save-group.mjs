import assert from 'node:assert/strict';
import { build } from 'esbuild';

const group = { id: 'existing', title: 'Original', device_id: 'PC', created_at: '2026-09-22', archived_at: null, tabs: [{ position: 4 }, { position: 1 }] };
let writes = [];
let filters = [];
let lookupError = null;
let insertError = null;
let listedGroups = [];
globalThis.saveTestClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  from(table) {
    const query = {
      select() { return query; },
      eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; },
      order: async () => ({ data: listedGroups, error: null }),
      then(resolve) { return Promise.resolve({ data: [{ id: 'existing', is_favorite: true }], error: null }).then(resolve); },
      insert(value) {
        writes.push({ table, value });
        return table === 'tabs' ? Promise.resolve({ error: insertError }) : query;
      },
      single: async () => ({ data: group, error: lookupError })
    };
    return query;
  }
};
const result = await build({
  stdin: { contents: "export * from './src/shared/supabase.ts'; export * from './src/shared/import.ts'; export * from './src/shared/renderers.ts';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'save-test', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'storage', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'client'
      ? 'export const createClient = () => globalThis.saveTestClient;'
      : `export const getConfig = async () => ({ supabaseUrl: 'test', supabaseKey: 'test', ignoreDomains: [], ignoreTitles: [] }); export const getOrCreateDeviceId = async () => 'device';` }));
  } }]
});
const { saveTabGroup, saveImportedTabGroup, importTabGroups, renderSaveDestination, listGroups } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
try {
  for (const save of [saveTabGroup, saveImportedTabGroup]) {
    writes = []; filters = [];
    const saved = await save({ title: 'Do not rename', groupId: 'existing', deviceId: 'other', tabs: [
      { url: 'https://a.test', pinned: false }, { url: 'https://b.test', pinned: false }, { url: 'https://a.test#duplicate', pinned: false }
    ] });
    assert.equal(saved.count, 2);
    assert.deepEqual(filters, [['id', 'existing'], ['user_id', 'owner'], ['archived_at', null]]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, 'tabs');
    assert.deepEqual(writes[0].value.map(({ group_id, position, status }) => [group_id, position, status]), [['existing', 5, 'saved'], ['existing', 6, 'saved']]);
  }
  writes = [];
  await saveTabGroup({ title: 'New', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
  assert.deepEqual(writes[0], { table: 'tab_groups', value: { user_id: 'owner', device_id: 'device', title: 'New' } });
  assert.equal(writes[1].value[0].position, 0);
  writes = [];
  lookupError = new Error('Missing or inaccessible group');
  await assert.rejects(saveImportedTabGroup({ title: '', groupId: 'missing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /Missing or inaccessible/);
  assert.equal(writes.length, 0);
  lookupError = null;
  insertError = new Error('Insert failed');
  await assert.rejects(saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /Insert failed/);
  insertError = null;
  writes = [];
  const imported = await importTabGroups({ groupTitle: '', groupId: 'existing', importText: 'https://a.test\n\nhttps://b.test' });
  assert.equal(imported.importedGroupCount, 1);
  assert.equal(imported.importedTabCount, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value.length, 2);
  writes = [];
  await assert.rejects(saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'chrome://newtab', pinned: false }] }), /保存対象/);
  assert.equal(writes.length, 0);
  const html = renderSaveDestination([group, { ...group, id: 'archived', archived_at: '2026-09-22' }], 'existing', true);
  assert.match(html, /name="saveGroupId" disabled/);
  assert.match(html, /value="existing" selected/);
  assert.doesNotMatch(html, /value="archived"/);
  assert.match(renderSaveDestination([], 'missing', false), /value="missing" selected disabled/);
  listedGroups = [{ ...group, tabs: [] }, { ...group, id: 'empty', tabs: [] },
    { ...group, id: 'populated', tabs: [{ position: 0, status: 'saved' }] }];
  const visible = await listGroups(false, 'owner');
  assert.deepEqual(visible.map((group) => group.id), ['existing', 'populated']);
  assert.match(renderSaveDestination(visible, 'existing', false), /value="existing" selected/);
  group.tabs = [];
  writes = [];
  await saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value[0].position, 0);
  console.log('Save destination regression checks passed.');
} finally {
  delete globalThis.saveTestClient;
}
