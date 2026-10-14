// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';
import { readFile } from 'node:fs/promises';

const group = { id: 'existing', title: 'Original', device_id: 'PC', created_at: '2026-09-22', is_fixed: false, is_favorite: true, tabs: [] };
let calls: any[] = [];
let rpcError: Error | null = null;
let rpcResult: unknown = undefined;
let listedGroups: any[] = [];
let conflictingUrls: string[] = [];
testGlobal.chrome = { storage: { local: { get: async () => ({}) } } };
testGlobal.saveTestClient = {
  auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
  rpc(name: string, args: { p_group_id: string | null; p_title: string; p_tabs: { url: string; title: string }[] }) {
    assert.equal(name, 'save_tab_group');
    calls.push(args);
    const seen = new Set(conflictingUrls);
    let count = 0;
    for (const tab of args.p_tabs) {
      assert.deepEqual(Object.keys(tab), ['url', 'title']);
      const key = tab.url.trim().split('#')[0]!.replace(/^https?:\/\/[^/]+/i, host => host.toLowerCase());
      if (!seen.has(key)) { seen.add(key); count++; }
    }
    return Promise.resolve({ error: rpcError, data: rpcResult === undefined
      ? { group: args.p_group_id || count ? { ...group, id: args.p_group_id || 'new' } : null, count } : rpcResult });
  },
  from(table: string) {
    assert.equal(table, 'tab_groups', 'Saving must never read all URLs or write tables directly');
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      range: async (from: number, to: number) => ({ data: listedGroups.slice(from, to + 1), error: null })
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
    calls = [];
    const saved = await save({ title: 'Do not rename', groupId: 'existing', deviceId: 'other', tabs: [
      { url: 'https://a.test', pinned: false }, { url: 'https://b.test#kept', pinned: false }, { url: 'https://a.test#duplicate', pinned: false }
    ] });
    assert.equal(saved.count, 2);
    assert.equal(saved.duplicateCount, 1);
    assert.equal(saved.group.is_favorite, true);
    assert.equal(calls.length, 1, 'One RPC performs the entire save');
    assert.equal(calls[0].p_group_id, 'existing');
    assert.equal(calls[0].p_device_id, 'other');
    assert.equal(calls[0].p_tabs[1].url, 'https://b.test#kept');
    conflictingUrls = ['https://a.test'];
    const mixed = await save({ title: 'New', deviceId: 'device', tabs: [
      { url: 'https://a.test' }, { url: 'https://a.test#duplicate' }, { url: 'https://b.test' }
    ] });
    assert.equal(mixed.count, 1);
    assert.equal(mixed.duplicateCount, 2);
    assert.equal(calls.at(-1).p_group_id, null);
    const duplicates = await save({ title: 'New', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
    assert.deepEqual(duplicates, { group: null, count: 0, duplicateCount: 1 });
    const existing = await save({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] });
    assert.equal(existing.group.id, 'existing');
    assert.equal(existing.count, 0);
    conflictingUrls = [];
  }
  rpcError = new Error('Missing or inaccessible group');
  await assert.rejects(saveImportedTabGroup({ title: '', groupId: 'missing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /Missing or inaccessible/);
  rpcError = new Error('Insert failed');
  await assert.rejects(saveTabGroup({ title: '', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /Insert failed/);
  rpcError = null;
  for (const invalid of [null, { count: -1 }, { count: 0.5 }, { count: 2 }, { count: '1' }, { count: 1, group: null }]) {
    rpcResult = invalid;
    await assert.rejects(saveTabGroup({ title: 'New', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /保存件数を確認/);
  }
  rpcResult = { count: 1, group: { id: 'another' } };
  await assert.rejects(saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'https://a.test' }] }), /保存件数を確認/);
  rpcResult = undefined;
  calls = [];
  const imported = await importTabGroups({ groupTitle: '', groupId: 'existing', importText: 'https://a.test\n\nhttps://b.test' });
  assert.equal(imported.importedGroupCount, 1);
  assert.equal(imported.importedTabCount, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_tabs.length, 2);
  calls = [];
  await assert.rejects(saveTabGroup({ title: '', groupId: 'existing', deviceId: 'device', tabs: [{ url: 'chrome://newtab', pinned: false }] }), /保存対象/);
  assert.equal(calls.length, 0);
  const html = renderSaveDestination([group, { ...group, id: 'empty' }], 'existing', true);
  assert.match(html, /<select[^>]*disabled/);
  assert.match(html, /value="existing"[^>]*selected/);
  assert.match(html, /value="empty"/);
  assert.match(renderSaveDestination([], 'missing', false), /value="missing"[^>]*selected[^>]*disabled|value="missing"[^>]*disabled[^>]*selected/);
  listedGroups = [{ ...group, tabs: [] }, { ...group, id: 'empty', tabs: [] }];
  assert.deepEqual((await listGroups('owner')).map((group: { id: string }) => group.id), ['existing', 'empty']);
  listedGroups = Array.from({ length: 1001 }, (_, index) => ({ ...group, id: `page-${index}`, tabs: [] }));
  assert.equal((await listGroups('owner')).length, 1001, 'Every group survives API pagination');
  console.log('Atomic save RPC / import / destination regression checks passed.');
} finally {
  delete testGlobal.saveTestClient;
  delete testGlobal.chrome;
}
