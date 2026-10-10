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
  assert.ok(!initial.includes('data-action="select-visible-groups"'), 'Select all is hidden until a group is selected');
  assert.ok(initial.includes('data-action="toggle-group-selection"'));
  assert.ok(!initial.includes('class="bulk-toolbar"'));
  assert.ok(!initial.includes('保存したタブ</h1>'), 'The page and list share one heading');
  assert.match(initial, /<h1 class="section-title">保存済みグループ<\/h1>/);
  const explorerHeader = initial.split('class="explorer-head"')[1]!.split('class="toolbar')[0]!;
  const refresh = explorerHeader.match(/<button[^>]*data-action="refresh-all"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(refresh, 'Refresh belongs to the saved groups heading');
  assert.match(refresh, /title="保存済みグループを更新" aria-label="保存済みグループを更新"/);
  assert.match(refresh, /<svg[^>]*aria-hidden="true"/);
  assert.equal(initial.match(/data-action="refresh-all"/g)?.length, 1);
  assert.ok(!initial.includes('data-action="restore-selected-groups"'));
  assert.ok(initial.includes('Long title &amp; details'));
  assert.ok(initial.includes('example.com'));
  assert.ok(!initial.includes('meta-pill'), 'Group details do not use boxed labels');
  assert.match(initial, /class="group-meta-item group-tab-count"/);
  assert.match(initial, /<time[^>]*datetime="2020-01-01"[^>]*title="作成日時: [^"]+"/);
  assert.ok(!initial.includes('group-device'), 'Device names are omitted from group cards');
  assert.match(initial, /<h3 title="Research">Research<\/h3>/);
  assert.ok(initial.includes('https://www.example.com/path?x=1&amp;y=2'));
  for (const [action, label] of [
    ['restore-group', '復元して削除'], ['copy-group', 'URLコピー'],
    ['toggle-favorite-group', 'お気に入り'], ['edit-group-title', '名前編集'],
    ['toggle-fixed-group', '固定（復元後も保持）'], ['delete-group', 'グループ削除']
  ] as const) {
    const button = initial.match(new RegExp(`<button[^>]*data-action="${action}"[^>]*>[\\s\\S]*?</button>`))?.[0];
    assert.ok(button, `${surface}: ${action} button exists`);
    assert.ok(button.includes(`title="${label}"`) && button.includes(`aria-label="${label}"`));
    assert.match(button, /<svg[^>]*aria-hidden="true"/);
    assert.ok(!button.slice(button.indexOf('>') + 1).includes(label), 'Action label is provided by tooltip');
  }
  const longTitle = '長いグループ名 '.repeat(20) + '<参考>';
  state.allGroups[0]!.title = longTitle;
  assert.equal(html().match(/<h3 title="([^"]*)"/)?.[1], longTitle.replace('<', '&lt;'), 'Full long title remains available in the tooltip');
  assert.ok(html().includes('&lt;参考>'), 'Group title text is escaped');
  state.editingGroupTitle = longTitle;
  state.editingGroupId = group.id;
  const editing = html();
  assert.match(editing, /data-action="save-group-title"[^>]*title="名前を保存"[^>]*aria-label="名前を保存"/);
  assert.match(editing, /data-action="cancel-edit-group-title"[^>]*title="キャンセル"[^>]*aria-label="キャンセル"/);
  assert.ok(editing.includes('name="groupTitleEdit"'), 'Long group names remain editable');
  assert.ok(!editing.includes('group-device'));
  state.editingGroupId = null;
  state.allGroups[0]!.title = group.title;
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
  assert.match(html(), /class="result-meta">0グループ \/ 1グループ/);
  state.favoriteOnly = false;
  state.groupFilter = 'fixed';
  assert.match(html(), /class="result-meta">0グループ \/ 1グループ/);
  state.allGroups[0]!.is_fixed = true;
  assert.match(html(), /class="result-meta">1グループ \/ 1グループ/);
  state.allGroups[0]!.is_fixed = false;
  state.groupFilter = 'all';
  state.searchQuery = 'no match';
  assert.match(html(), /class="result-meta">0グループ \/ 1グループ/);
  state.searchQuery = '';
  state.deviceFilter = 'Other device';
  assert.match(html(), /class="result-meta">0グループ \/ 1グループ/);
  state.deviceFilter = 'all';
  if (uiMode === 'lightweight') {
    state.allGroups = Array.from({ length: 30 }, (_, i) => ({ ...structuredClone(group), id: `saved-${i}` }));
    state.visibleGroupCount = 10;
    assert.match(html(), /class="result-meta">30グループ \/ 30グループ/);
    assert.ok(!html().includes('表示済み'));
    assert.ok(html().includes('data-action="show-more-groups"'));
    assert.ok(html().includes('残り 20 件'));
    state.allGroups = [structuredClone(group)];
  }

  state.authStatus = 'ログイン中: user@example.com';
  state.pageStatus = '同期中';
  state.syncStatus = '最終同期: 12:34:56';
  const header = () => html().split('class="explorer-head"')[1]!.split('class="toolbar')[0]!;
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
  for (const action of ['select-visible-groups', 'clear-group-selection', 'restore-selected-groups', 'copy-selected-groups', 'delete-selected-groups']) {
    assert.ok(html().includes(`data-action="${action}"`));
  }
  assert.match(html(), /data-action="select-visible-groups"[^>]*>全選択<\/button>/);
  state.searchQuery = 'no match';
  assert.ok(html().includes('1 グループ / 1 タブを選択中'), 'Hidden selected groups remain counted');
  assert.ok(html().includes('条件に一致するグループはありません。'));
  state.searchQuery = '';
  state.allGroups[0]!.is_fixed = true;
  assert.ok(!html().includes('固定 · 復元後も保持'), 'Fixed groups do not repeat the tooltip as visible text');
  assert.match(html(), /data-action="toggle-fixed-group" aria-pressed="true"[^>]*title="固定中（復元後も保持） · クリックで解除"[^>]*aria-label="固定中（復元後も保持） · クリックで解除"/);
  assert.match(html(), /data-action="restore-group"[^>]*title="全部復元（復元後も保持）"[^>]*aria-label="全部復元（復元後も保持）"/);
  state.allGroups[0]!.tabs = [];
  assert.match(html(), /data-action="restore-selected-groups" disabled/);
  state.allGroups[0]!.tabs = group.tabs;
  state.actionBusy = true;
  assert.match(html(), /data-action="restore-selected-groups" disabled/);
  assert.match(html(), /data-action="refresh-all"[^>]*disabled/);
  state.selectedGroupIds = [];
  assert.ok(!html().includes('class="bulk-toolbar"'));
  assert.ok(!html().includes('data-action="select-visible-groups"'), 'Clearing selection also hides select all');
  state.allGroups = [];
  assert.ok(html().includes('保存済みグループはありません。'));
  state.authStatus = '未ログイン';
  assert.ok(html().includes('ログインすると保存したタブを表示できます。'));
  dashboards[surface] = null;
}
console.log('Dashboard UI rendering checks passed.');
