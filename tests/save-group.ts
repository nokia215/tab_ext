// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { readFile } from 'node:fs/promises';

const group = { id: 'existing', title: 'Original', device_id: 'PC', created_at: '2026-09-22', archived_at: null, tabs: [{ url: 'https://old.test', position: 4 }, { url: 'https://older.test', position: 1 }] };
let writes: { table: string; value: any }[] = [];
let filters: [string, unknown][] = [];
let lookupError: Error | null = null;
let insertError: Error | null = null;
let listedGroups: any[] = [];
let existingTabRows: { url_key: string }[] = [];
let conflictingKeys: string[] = [];
let deletedGroups = 0;
testGlobal.saveTestClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  from(table: string) {
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { if (table === 'tab_groups') filters.push([key, value]); return query; },
      is(key: string, value: unknown) { filters.push([key, value]); return query; },
      order() { return query; },
      range: async (from: number, to: number) => ({ data: listedGroups.slice(from, to + 1), error: null }),
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: table === 'tabs' ? existingTabRows : [{ id: 'existing', is_favorite: true }], error: null }).then(resolve); },
      insert(value: unknown) {
        writes.push({ table, value });
        return table === 'tabs' ? Promise.resolve({ error: insertError }) : query;
      },
      upsert(value: { url_key: string }[], options: unknown) {
        assert.equal(table, 'tabs');
        assert.deepEqual(options, { onConflict: 'user_id,url_key', ignoreDuplicates: true, count: 'exact' });
        writes.push({ table, value });
        return Promise.resolve({ error: insertError, count: value.filter((row) => !conflictingKeys.includes(row.url_key)).length });
      },
      delete() { assert.equal(table, 'tab_groups'); deletedGroups += 1; return query; },
      single: async () => ({ data: group, error: lookupError })
    };
    return query;
  }
};
const result = await build({
  stdin: { contents: "export * from './src/shared/supabase.ts'; export * from './src/shared/import.ts'; export { default as SaveDestination } from './src/shared/ui/SaveDestination.svelte';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'save-test', setup(builder) {
    builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
      contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'server' }).js.code
    }));
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'storage', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'client'
      ? 'export const createClient = () => globalThis.saveTestClient;'
      : `export const getConfig = async () => ({ supabaseUrl: 'test', supabaseKey: 'test', ignoreDomains: [], ignoreTitles: [] }); export const getOrCreateDeviceId = async () => 'device';` }));
  } }]
});
const { saveTabGroup, saveImportedTabGroup, importTabGroups, SaveDestination, listGroups } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
const renderSaveDestination = (groups: unknown[], groupId: string, busy: boolean) => render(SaveDestination, { props: { groups, groupId, busy } }).body;
try {
  for (const save of [saveTabGroup, saveImportedTabGroup]) {
    writes = []; filters = [];
    const saved = await save({ title: 'Do not rename', groupId: 'existing', deviceId: 'other', tabs: [
      { url: 'https://a.test', pinned: false }, { url: 'https://b.test', pinned: false }, { url: 'https://a.test#duplicate', pinned: false }
    ] });
    assert.equal(saved.count, 2);
    assert.equal(saved.duplicateCount, 1);
    assert.deepEqual(filters, [['id', 'existing'], ['user_id', 'owner']]);
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.table, 'tabs');
    assert.deepEqual(writes[0]!.value.map(({ group_id, position }: { group_id: string; position: number }) => [group_id, position]), [['existing', 5], ['existing', 6]]);
  }
  group.tabs = [{ url: 'https://a.test', position: 0 }];
  existingTabRows = [{ url_key: 'https://a.test' }];
  writes = [];
  const deduped = await saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [
    { url: 'https://a.test#section', title: 'Different title' },
    { url: 'https://b.test', title: 'Same title' }
  ] });
  assert.equal(deduped.count, 1);
  assert.equal(deduped.duplicateCount, 1);
  assert.equal(writes[0]!.value[0]!.url, 'https://b.test');
  existingTabRows = [{ url_key: 'https://same.test/?id=1' }];
  writes = [];
  const queryVariants = await saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [
    { url: 'https://same.test/?id=1' },
    { url: 'https://same.test/?id=2' }
  ] });
  assert.equal(queryVariants.count, 1);
  assert.equal(queryVariants.duplicateCount, 1);
  assert.equal(writes[0]!.value[0]!.url, 'https://same.test/?id=2');
  existingTabRows = [];
  group.tabs = [{ url: 'https://old.test', position: 4 }, { url: 'https://older.test', position: 1 }];
  writes = [];
  await saveTabGroup({ title: 'New', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
  assert.deepEqual(writes[0]!, { table: 'tab_groups', value: { user_id: 'owner', device_id: 'device', title: 'New' } });
  assert.equal(writes[1]!.value[0]!.position, 0);
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
  assert.equal(writes[0]!.value.length, 2);
  writes = [];
  await assert.rejects(saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'chrome://newtab', pinned: false }] }), /保存対象/);
  assert.equal(writes.length, 0);
  const html = renderSaveDestination([group, { ...group, id: 'archived', archived_at: '2026-09-22' }], 'existing', true);
  assert.match(html, /<select[^>]*disabled/);
  assert.match(html, /value="existing"[^>]*selected/);
  assert.match(html, /value="archived"/);
  assert.match(renderSaveDestination([], 'missing', false), /value="missing"[^>]*selected[^>]*disabled|value="missing"[^>]*disabled[^>]*selected/);
  listedGroups = [{ ...group, tabs: [] }, { ...group, id: 'empty', tabs: [] },
    { ...group, id: 'populated', tabs: [{ position: 0, status: 'saved' }] }];
  const visible = await listGroups('owner');
  const originalListed = listedGroups;
  listedGroups = Array.from({ length: 1001 }, (_, index) => ({ ...group, id: `page-${index}`, tabs: [] }));
  assert.equal((await listGroups('owner')).length, 1001, 'Every group survives API pagination');
  listedGroups = originalListed;
  assert.deepEqual(visible.map((group: { id: string }) => group.id), ['existing', 'empty', 'populated']);
  assert.match(renderSaveDestination(visible, 'existing', false), /value="existing" selected/);
  group.tabs = [];
  writes = [];
  await saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.value[0]!.position, 0);
  assert.ok(writes[0]!.value[0]!.url_key);
  // Simulate duplicates missing from the precheck (API truncation or concurrent saves).
  for (const save of [saveTabGroup, saveImportedTabGroup]) {
    existingTabRows = [];
    conflictingKeys = ['https://a.test'];
    const mixed = await save({ title: 'New', deviceId: 'device', tabs: [
      { url: 'https://a.test' }, { url: 'https://a.test#duplicate' }, { url: 'https://b.test' }
    ] });
    assert.equal(mixed.count, 1);
    assert.equal(mixed.duplicateCount, 2);
    const beforeDelete = deletedGroups;
    const allDuplicates = await save({ title: 'New', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
    assert.deepEqual(allDuplicates, { group: null, count: 0, duplicateCount: 1 });
    assert.equal(deletedGroups, beforeDelete + 1);
    const existing = await save({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
    assert.equal(existing.count, 0);
    assert.equal(existing.duplicateCount, 1);
    assert.equal(existing.group.id, 'existing');
    assert.equal(deletedGroups, beforeDelete + 1);
  }
  console.log('Save destination regression checks passed.');
} finally {
  delete testGlobal.saveTestClient;
}
