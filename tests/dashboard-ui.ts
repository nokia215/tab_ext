import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import { compile, compileModule } from 'svelte/compiler';
import type { DashboardState } from '../src/shared/dashboard-model.ts';
import type { TabGroup } from '../src/shared/types.ts';

const built = await build({
  stdin: { contents: `
    export { render } from 'svelte/server';
    export { default as Desktop } from './src/newtab/Dashboard.svelte';
    export { default as Tablet } from './src/tablet/TabletDashboard.svelte';
    export { dashboards } from './src/shared/dashboard-state.svelte.ts';
    export { createInitialState } from './src/shared/dashboard-model';
  `, resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', write: false,
  loader: { '.css': 'empty' },
  plugins: [{ name: 'svelte-server', setup(builder) {
    builder.onLoad({ filter: /\.svelte(?:\.ts)?$/ }, async ({ path }) => {
      const source = await readFile(path, 'utf8');
      const compiled = path.endsWith('.ts')
        ? compileModule((await transform(source, { loader: 'ts' })).code, { filename: path, generate: 'server' })
        : compile(source, { filename: path, generate: 'server' });
      return { contents: compiled.js.code, resolveDir: path.slice(0, path.lastIndexOf('/')) };
    });
  } }]
});
const { render, Desktop, Tablet, dashboards, createInitialState } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`
);
const group: TabGroup = {
  id: 'saved', title: 'Research', device_id: 'PC', created_at: '2020-01-01', is_fixed: false,
  tabs: [{ id: 'tab', title: 'Long title & details', url: 'https://www.example.com/path?x=1&y=2', position: 0 }]
};

for (const [surface, uiMode] of [['desktop', 'default'], ['desktop', 'lightweight'], ['tablet', 'lightweight']] as const) {
  const state: DashboardState = createInitialState({ isAndroidFirefox: uiMode === 'lightweight', uiMode });
  state.allGroups = [structuredClone(group)];
  dashboards[surface] = state;
  const html = () => render(surface === 'desktop' ? Desktop : Tablet).body as string;
  const initial = html();
  for (const name of ['searchQuery', 'sortMode', 'deviceFilter']) assert.ok(initial.includes(`name="${name}"`));
  for (const removed of ['metric-card', 'mini-metric', 'set-date-range-filter', 'select-stale-groups', '30日以上']) {
    assert.ok(!initial.includes(removed), `${surface}: removed ${removed}`);
  }
  assert.ok(initial.includes('data-action="select-visible-groups"'));
  assert.ok(!initial.includes('class="bulk-toolbar"'));
  assert.ok(!initial.includes('data-action="restore-selected-groups"'));
  assert.ok(initial.includes('Long title &amp; details'));
  assert.ok(initial.includes('example.com'));
  assert.ok(initial.includes('https://www.example.com/path?x=1&amp;y=2'));
  assert.ok(initial.includes('復元して削除'));
  assert.match(initial, /aria-pressed="true" data-action="set-group-filter" data-value="all"/);
  assert.match(initial, /aria-pressed="false" data-action="toggle-favorite-only"/);
  if (surface === 'desktop' && uiMode === 'lightweight') state.settingsPanelOpen = true;
  assert.match(html(), /<form name="sign-in"/);
  assert.match(html(), /name="email"[^>]*autocomplete="username"[^>]*required/);
  assert.match(html(), /name="password"[^>]*autocomplete="current-password"[^>]*required/);
  assert.ok(!html().includes('Sync ready'));
  assert.ok(!html().includes('service_role'));
  state.favoriteOnly = true;
  assert.match(html(), /aria-pressed="true" data-action="toggle-favorite-only"/);
  assert.ok(html().includes('条件に一致するグループはありません。'));
  state.favoriteOnly = false;

  state.authStatus = 'ログイン中: user@example.com';
  state.pageStatus = '1 グループを表示中';
  state.syncStatus = '最終同期: 12:34:56';
  const header = () => html().slice(0, html().indexOf('</section>'));
  for (const status of [state.authStatus, state.pageStatus, state.syncStatus]) assert.ok(header().includes(status));
  assert.ok(!html().includes('class="status-stack"'), 'Normal statuses do not occupy another row');
  state.syncStatus = '自動同期失敗: Offline';
  assert.ok(!header().includes(state.syncStatus));
  assert.match(html(), /class="status-stack"[\s\S]*role="alert"[\s\S]*自動同期失敗/);
  state.pageStatus = 'データを読み込めませんでした。';
  assert.ok(!header().includes(state.pageStatus));
  assert.match(html(), /role="alert"[\s\S]*データを読み込めませんでした/);
  state.pageStatus = '';
  state.syncStatus = '';
  assert.ok(!html().includes('class="status-stack"'));
  state.selectedGroupIds = ['saved'];
  assert.ok(html().includes('class="bulk-toolbar"'));
  for (const action of ['clear-group-selection', 'restore-selected-groups', 'copy-selected-groups', 'delete-selected-groups']) {
    assert.ok(html().includes(`data-action="${action}"`));
  }
  state.searchQuery = 'no match';
  assert.ok(html().includes('1 グループ / 1 タブを選択中'), 'Hidden selected groups remain counted');
  assert.ok(html().includes('条件に一致するグループはありません。'));
  state.searchQuery = '';
  state.allGroups[0]!.is_fixed = true;
  assert.ok(html().includes('固定 · 復元後も保持'));
  assert.ok(html().includes('全部復元'));
  state.allGroups[0]!.tabs = [];
  assert.match(html(), /data-action="restore-selected-groups" disabled/);
  state.allGroups[0]!.tabs = group.tabs;
  state.actionBusy = true;
  assert.match(html(), /data-action="restore-selected-groups" disabled/);
  state.selectedGroupIds = [];
  assert.ok(!html().includes('class="bulk-toolbar"'));
  state.allGroups = [];
  assert.ok(html().includes('保存済みグループはありません。'));
  state.authStatus = '未ログイン';
  assert.ok(html().includes('ログインすると保存したタブを表示できます。'));
  dashboards[surface] = null;
}
console.log('Dashboard UI rendering checks passed.');
