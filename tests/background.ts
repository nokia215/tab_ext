// ponytail: partial browser mocks are injected here; add full API mocks if browser coverage grows.
const testGlobal = globalThis as unknown as Record<string, unknown>;
import assert from 'node:assert/strict';
import { build } from 'esbuild';

type TestTab = { id: number; index: number; url: string; active?: boolean };
type TestSender = { tab?: { windowId: number } };
type TestResponse = { ok: boolean; tabs?: TestTab[]; tab?: TestTab };
let listener: (message: unknown, sender: TestSender, respond: () => void) => Promise<TestResponse>;
let senderTabs = [{ id: 1, index: 1, url: 'https://sender.test', active: true },
  { id: 2, index: 0, url: 'https://first.test' }];
let currentTabs = [{ id: 3, index: 0, url: 'https://current.test', active: true }];
const focusedTabs = Array.from({ length: 10 }, (_, index) => ({
  id: 10 + index, index, url: `https://other.test/${index}`, active: index === 0
}));
testGlobal.browser = {
  runtime: { onMessage: { addListener: (value: typeof listener) => { listener = value; } } },
  tabs: { query: async (query: chrome.tabs.QueryInfo) => query.windowId === 42 ? senderTabs : currentTabs },
  windows: { getLastFocused: async () => ({ tabs: focusedTabs }) }
};
try {
  const result = await build({ entryPoints: ['src/background/main.ts'], bundle: true,
    platform: 'node', format: 'esm', write: false,
    plugins: [{ name: 'background-test', setup(builder) {
      builder.onResolve({ filter: /shared\/restoration$/ }, () => ({ path: 'restore', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export const restoreSavedTabs = async () => { throw new Error("Unexpected restore"); };'
      }));
    } }]
  });
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`);
  const request = (type: string, sender: TestSender = {}) => listener({ type }, sender, () => {});
  const sender = { tab: { windowId: 42 } };
  assert.deepEqual((await request('get-current-window-tabs', sender)).tabs!.map((tab) => tab.id), [2, 1]);
  assert.equal((await request('get-active-tab', sender)).tab!.id, 1);
  assert.deepEqual((await request('get-current-window-tabs')).tabs, currentTabs);
  senderTabs = [{ id: 1, index: 0, url: 'chrome://newtab' }];
  assert.deepEqual((await request('get-current-window-tabs', sender)).tabs, senderTabs);
  senderTabs = [];
  currentTabs = [];
  assert.deepEqual((await request('get-current-window-tabs')).tabs, focusedTabs);
  const invalid = await request('restore-saved-tabs');
  assert.equal(invalid.ok, false);
  console.log('Window selection / message validation checks passed.');
} finally {
  delete testGlobal.browser;
}
