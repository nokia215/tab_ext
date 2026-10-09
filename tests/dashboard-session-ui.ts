import assert from 'node:assert/strict';
import { build } from 'esbuild';
import type { DashboardState } from '../src/shared/dashboard-model.ts';

const built = await build({
  stdin: { contents: "export { DashboardSession } from './src/shared/dashboard-session'; export { createInitialState } from './src/shared/dashboard-model';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'no-auto-sync', setup(builder) {
    builder.onResolve({ filter: /^\.\/auto-sync$/ }, () => ({ path: 'auto-sync', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const startDashboardAutoSync = () => {};' }));
  } }]
});
const { DashboardSession, createInitialState } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`
);
const testGlobal = globalThis as unknown as Record<string, unknown>;
class Form {
  name: string;
  constructor(name: string) { this.name = name; }
}
testGlobal.HTMLFormElement = Form;
try {
  const state: DashboardState = createInitialState({ isAndroidFirefox: false, uiMode: 'default' });
  const session = new DashboardSession(state, () => {}, {});
  session.refreshAll = async () => {};
  let signIns = 0;
  session.handleSignIn = async () => { signIns++; };
  let submit!: (event: { target: unknown; preventDefault: () => void }) => void;
  await session.bootstrap({ addEventListener: (name: string, handler: typeof submit) => {
    assert.equal(name, 'submit');
    submit = handler;
  } });
  let prevented = 0;
  const send = (target: unknown) => submit({ target, preventDefault: () => { prevented++; } });
  send(new Form('other'));
  send({});
  assert.equal(prevented, 0);
  send(new Form('sign-in'));
  assert.equal(signIns, 1);
  assert.equal(prevented, 1, 'Keep credentials out of a native form navigation');
  state.authBusy = true;
  send(new Form('sign-in'));
  assert.equal(signIns, 1, 'Do not sign in twice while busy');
  assert.equal(prevented, 2);
} finally {
  delete testGlobal.HTMLFormElement;
}
console.log('Dashboard login submission checks passed.');
