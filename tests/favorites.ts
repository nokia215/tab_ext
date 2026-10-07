// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';

type Row = { id: string; user_id: string; is_favorite: boolean | null; is_fixed?: boolean };
const rows: Row[] = [
  { id: 'legacy', user_id: 'owner', is_favorite: null },
  { id: 'other', user_id: 'owner', is_favorite: false },
  { id: 'foreign', user_id: 'another', is_favorite: null }
];
const devices = {
  a: { favorite_group_ids: ['legacy', 'foreign'] },
  b: { favorite_group_ids: ['legacy'] }
};
let device: keyof typeof devices = 'a';
let userId: string | null = 'owner';
let failure: string | null = null;
let requests = 0;
testGlobal.chrome = { storage: { local: {
  get: async () => structuredClone(devices[device]),
  set: async (value: { favorite_group_ids: string[] }) => Object.assign(devices[device], value)
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
      update(value: Partial<Row>) { payload = value; return query; },
      eq(key: keyof Row, value: unknown) { filters.push([key, (row) => row[key] === value]); return query; },
      is(key: keyof Row, value: unknown) { return query.eq(key, value); },
      in(key: keyof Row, values: unknown[]) { filters.push([key, (row) => values.includes(row[key])]); return query; },
      single() { single = true; return query; },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => {
          assert.ok(filters.some(([key]) => key === 'user_id'), 'Every read/write must be user scoped');
          if (failure) return { data: null, error: new Error(failure) };
          const matched = rows.filter((row) => filters.every(([, matches]) => matches(row)));
          if (single && matched.length !== 1) return { data: null, error: new Error('Missing group') };
          if (payload) matched.forEach((row) => Object.assign(row, payload));
          return { data: structuredClone(single ? matched[0]! : matched), error: null };
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
const { getFavoriteGroupIds, setGroupFavorite, setGroupFixed } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
try {
  failure = 'Migration failed';
  await assert.rejects(getFavoriteGroupIds(), /Migration failed/);
  assert.deepEqual(devices.a.favorite_group_ids, ['legacy', 'foreign']);
  failure = null;
  assert.deepEqual(await getFavoriteGroupIds(), ['legacy']);
  assert.deepEqual(devices.a.favorite_group_ids, ['foreign']);
  assert.equal(rows[2]!.is_favorite, null, 'Do not migrate another account');

  // A second device sees additions and removals on each refresh, without a page reload.
  device = 'b';
  assert.deepEqual(await getFavoriteGroupIds(), ['legacy']);
  await setGroupFavorite('other', true);
  device = 'a';
  assert.deepEqual(await getFavoriteGroupIds(), ['legacy', 'other']);
  await setGroupFavorite('legacy', false);
  device = 'b';
  devices.b.favorite_group_ids = ['legacy'];
  assert.deepEqual(await getFavoriteGroupIds(), ['other'], 'Old local data must not undo a remote removal');
  assert.deepEqual(devices.b.favorite_group_ids, []);
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
  device = 'a';
  assert.deepEqual(await getFavoriteGroupIds(), ['foreign']);
  assert.deepEqual(devices.a.favorite_group_ids, []);
  userId = null;
  const before = requests;
  await assert.rejects(getFavoriteGroupIds(), /ログイン/);
  await assert.rejects(setGroupFavorite('legacy', true), /ログイン/);
  assert.equal(requests, before);
  console.log('Cross-device favorite sync regression checks passed.');
} finally {
  delete testGlobal.chrome;
  delete testGlobal.favoriteTestClient;
}
