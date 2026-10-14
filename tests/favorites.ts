// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';

type Row = { id: string; user_id: string; is_favorite: boolean; is_fixed?: boolean; tabs?: unknown[] };
const rows: Row[] = [
  { id: 'favorite', user_id: 'owner', is_favorite: true },
  { id: 'other', user_id: 'owner', is_favorite: false },
  { id: 'foreign', user_id: 'another', is_favorite: true }
];
let userId: string | null = 'owner';
let failure: string | null = null;
let requests = 0;
testGlobal.chrome = { storage: { local: {
  get: async () => { throw new Error('Favorite sync must not read local storage'); },
  set: async () => { throw new Error('Favorite sync must not write local storage'); }
} } };
testGlobal.favoriteTestClient = {
  auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null }) },
  from(table: string) {
    assert.equal(table, 'tab_groups');
    requests++;
    const filters: [string, (row: Row) => boolean][] = [];
    let payload: Partial<Row> | undefined;
    let single = false;
    const query = {
      select() { return query; },
      order() { return query; },
      range() { return query; },
      update(value: Partial<Row>) { payload = value; return query; },
      eq(key: keyof Row, value: unknown) { filters.push([key, (row) => row[key] === value]); return query; },
      single() { single = true; return query; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => {
          assert.ok(filters.some(([key]) => key === 'user_id'), 'Every read/write must be user scoped');
          if (failure) return { data: null, error: new Error(failure) };
          const matched = rows.filter((row) => filters.every(([, matches]) => matches(row)));
          if (single && matched.length !== 1) return { data: null, error: new Error('Missing group') };
          if (payload) matched.forEach((row) => Object.assign(row, payload));
          return { data: structuredClone(single ? matched[0]! : matched.map(row => ({ ...row, tabs: [] }))), error: null };
        }).then(resolve, reject);
      }
    };
    return query;
  }
};

const result = await build({
  entryPoints: ['src/shared/supabase.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'favorites-test', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'client', namespace: 'mock' }));
    builder.onResolve({ filter: /^\.\/storage$/ }, () => ({ path: 'storage', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'client'
      ? 'export const createClient = () => globalThis.favoriteTestClient;'
      : "export const getConfig = async () => ({ supabaseUrl: 'test', supabaseKey: 'test' });" }));
  } }]
});
const { listGroups, setGroupFavorite, setGroupFixed } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
const getFavoriteGroupIds = async () => (await listGroups()).filter((group: { is_favorite: boolean }) => group.is_favorite).map((group: { id: string }) => group.id);
try {
  failure = 'Network failed';
  await assert.rejects(getFavoriteGroupIds(), /Network failed/);
  failure = null;
  const beforeRefresh = requests;
  assert.deepEqual(await getFavoriteGroupIds(), ['favorite']);
  assert.equal(requests, beforeRefresh + 1, 'One group request supplies favorites too');

  // A second device sees additions and removals on each refresh, without a page reload.
  assert.deepEqual(await getFavoriteGroupIds(), ['favorite']);
  await setGroupFavorite('other', true);
  assert.deepEqual(await getFavoriteGroupIds(), ['favorite', 'other']);
  await setGroupFavorite('favorite', false);
  assert.deepEqual(await getFavoriteGroupIds(), ['other'], 'A refresh sees a remote removal');
  assert.equal(rows[1]!.is_favorite, true, 'Updating one group must not overwrite other favorites');

  await setGroupFixed('other', true);
  assert.equal(rows[1]!.is_fixed, true);
  assert.equal(rows[1]!.is_favorite, true);
  await setGroupFavorite('other', false);
  assert.equal(rows[1]!.is_fixed, true, 'Favorite changes must not change retention');
  await setGroupFavorite('other', true);
  await setGroupFixed('other', false);
  assert.equal(rows[1]!.is_favorite, true, 'Retention changes must not change favorites');

  failure = 'Network failed';
  await assert.rejects(setGroupFavorite('other', false), /Network failed/);
  await assert.rejects(getFavoriteGroupIds(), /Network failed/);
  assert.equal(rows[1]!.is_favorite, true);
  failure = null;
  await assert.rejects(setGroupFavorite('missing', true), /Missing group/);
  await assert.rejects(setGroupFavorite('foreign', true), /Missing group/);
  await assert.rejects(setGroupFixed('foreign', true), /Missing group/);

  userId = 'another';
  assert.deepEqual(await getFavoriteGroupIds(), ['foreign']);
  userId = null;
  const before = requests;
  await assert.rejects(getFavoriteGroupIds(), /ログイン/);
  await assert.rejects(setGroupFavorite('favorite', true), /ログイン/);
  assert.equal(requests, before);
  console.log('Cross-device favorite sync regression checks passed.');
} finally {
  delete testGlobal.chrome;
  delete testGlobal.favoriteTestClient;
}
