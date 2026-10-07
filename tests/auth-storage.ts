import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise the real auth library; no requests are needed for an unexpired session.
const testGlobal = globalThis as unknown as Record<string, unknown>;
const stored = new Map<string, string>();
testGlobal.window = { localStorage: {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => { stored.set(key, value); },
  removeItem: (key: string) => { stored.delete(key); }
} };
const built = await build({
  entryPoints: ['src/shared/supabase-client.ts'], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'real-auth', setup(builder) {
    builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({
      path: import.meta.resolve('@supabase/supabase-js'), external: true
    }));
  } }]
});
const { getSupabase, getCurrentSessionUser } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`);
const client = await getSupabase();
try {
  await client.auth.initialize();
  const key = client.auth.storageKey as string;
  const session = { access_token: 'test', refresh_token: 'test',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'owner' } };
  stored.set(key, JSON.stringify(session));
  assert.equal((await getCurrentSessionUser())?.id, 'owner', 'Web storage must preserve the auth session');
  stored.delete(key);
  assert.equal(await getCurrentSessionUser(), null);
  console.log('Real Web auth storage checks passed.');
} finally {
  await client.auth.stopAutoRefresh();
  delete testGlobal.window;
}
