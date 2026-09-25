<script lang="ts">
  import { dashboards } from '../shared/dashboard-state.svelte';
  import { countStaleGroups, isDashboardBusy, LIGHTWEIGHT_GROUP_BATCH_SIZE, queryGroups, collectDeviceFilterOptions, summarizeSelectedGroups } from '../shared/dashboard-model';
  import { countFavoriteGroups } from '../shared/favorites';
  import { reconcileExpandedGroupIds, visibleGroups } from '../shared/group-state';
  import { summarizeGroupCollection } from '../shared/group-summary';
  import { isErrorStatus } from '../shared/status';
  import StatusBanner from '../shared/ui/StatusBanner.svelte';
  import GroupList from '../shared/ui/GroupList.svelte';
  import SavePanel from '../shared/ui/SavePanel.svelte';
  import AuthPanel from '../shared/ui/AuthPanel.svelte';
  import ConfigPanel from '../shared/ui/ConfigPanel.svelte';
  import '../shared/redesign.css';

  const dateFilters = [
    ['all', '全期間'], ['today', '今日'], ['week', '7日以内'], ['month', '30日未満'], ['stale', '30日以上']
  ] as const;
  let state = $derived(dashboards.desktop);
  let view = $derived.by(() => {
    if (!state) return null;
    const filteredGroups = queryGroups(state.allGroups, state);
    const shownGroups = state.uiMode === 'lightweight' ? visibleGroups(filteredGroups, state.visibleGroupCount) : filteredGroups;
    const bulkGroups = state.uiMode === 'lightweight' ? shownGroups : filteredGroups;
    return {
      state,
      summary: summarizeGroupCollection(state.allGroups),
      selectedSummary: summarizeSelectedGroups(state.allGroups, state.selectedGroupIds),
      bulkSelectableCount: bulkGroups.length,
      staleSelectableCount: countStaleGroups(bulkGroups),
      filteredStaleGroupCount: countStaleGroups(filteredGroups),
      staleSelectLabel: state.uiMode === 'lightweight' ? '表示中の30日以上を選択' : '30日以上を選択',
      favoriteGroupCount: countFavoriteGroups(state.allGroups, state.favoriteGroupIds),
      deviceFilterOptions: collectDeviceFilterOptions(state.allGroups),
      filteredGroups,
      visibleGroups: shownGroups,
      visibleExpandedGroupIds: reconcileExpandedGroupIds(state.expandedGroupIds, shownGroups, state.uiMode === 'lightweight' ? 1 : null),
      pageStatusIsError: isErrorStatus(state.pageStatus)
    };
  });
</script>

{#if view}
  {@const args = view}
  {@const state = args.state}
  {@const busy = isDashboardBusy(state)}
  {@const lightweight = state.uiMode === 'lightweight'}
  {@const remaining = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0)}
  <main class={`shell page-shell${lightweight ? ' lightweight-shell' : ''}`}>
    {#if lightweight}
      <section class="panel lightweight-hero">
        <div class="lightweight-hero-top">
          <div><p class="hero-kicker">Tab Saver Lite</p><h1>保存したタブ</h1><p class="muted">必要なタブを検索して、すぐに再開できます。</p></div>
          <div class="actions lightweight-actions"><span class="badge accent-badge">Android Firefox</span><span class="badge">{state.authStatus}</span><button class="ghost" data-action="refresh-all" disabled={busy}>更新</button></div>
        </div>
        <div class="lightweight-summary">
          {#each [['グループ', args.summary.groupCount], ['タブ', args.summary.totalTabs], ['端末', args.summary.deviceCount], ['お気に入り', args.favoriteGroupCount], ['30日以上', args.summary.staleGroupCount]] as metric (metric[0])}
            <article class="mini-metric"><span class="mini-metric-label">{metric[0]}</span><strong class="mini-metric-value">{metric[1]}</strong></article>
          {/each}
        </div>
      </section>
    {:else}
      <section class="masthead panel">
        <div class="masthead-layout"><div class="headline"><p class="hero-kicker">TAB SAVER / WORKSPACE</p><h1>保存したセッションを見つける</h1><p class="muted">検索から復元まで、この一覧で操作できます。</p></div>
          <div class="masthead-side"><span class="badge">{state.authStatus}</span><button class="ghost" data-action="refresh-all" disabled={busy}>更新</button></div>
        </div>
        <div class="metric-grid masthead-metrics">
          {#each [['グループ', args.summary.groupCount], ['タブ', args.summary.totalTabs], ['端末', args.summary.deviceCount], ['お気に入り', args.favoriteGroupCount], ['30日以上', args.summary.staleGroupCount]] as metric (metric[0])}
            <article class="metric-card"><p class="metric-label">{metric[0]}</p><p class="metric-value">{metric[1]}</p></article>
          {/each}
        </div>
      </section>
    {/if}

    <StatusBanner status={state.pageStatus} error={args.pageStatusIsError} />
    {#if state.pageStatus.includes('削除同期に失敗')}<button class="secondary" data-action="refresh-all" disabled={state.actionBusy || state.refreshBusy}>削除の同期を再試行</button>{/if}

    <section class={`panel explorer-panel${lightweight ? ' lightweight-explorer' : ''}`}>
      <div class="explorer-head"><div><h2 class="section-title">保存済みグループ</h2><p class="section-copy">タブ名、URL、グループ名、端末名で検索できます。</p></div></div>
      <div class={`toolbar${lightweight ? ' compact-toolbar' : ''}`}>
        <label class="field search-field"><span class="field-label">検索</span><input name="searchQuery" type="search" value={state.searchQuery} placeholder="タブ名、URL、グループ名" /></label>
        <label class="field compact-field"><span class="field-label">並び順</span><select name="sortMode" value={state.sortMode}><option value="newest">新しい順</option><option value="oldest">古い順</option><option value="tabCount">タブ数順</option></select></label>
        <label class="field compact-field device-field"><span class="field-label">端末</span><select name="deviceFilter" value={state.deviceFilter}><option value="all">すべての端末</option>{#each args.deviceFilterOptions as device}<option value={device.value}>{device.label}</option>{/each}</select></label>
      </div>
      <div class="filter-row filter-row-secondary">{#each dateFilters as [value, label] (value)}<button class={`chip${state.dateRangeFilter === value ? ' active-chip' : ''}`} data-action="set-date-range-filter" data-value={value}>{label}</button>{/each}</div>
      <div class="filter-row">
        <button class={`chip${state.groupFilter === 'all' ? ' active-chip' : ''}`} data-action="set-group-filter" data-value="all">すべて</button>
        <button class={`chip${state.groupFilter === 'fixed' ? ' active-chip' : ''}`} data-action="set-group-filter" data-value="fixed">固定のみ</button>
        <button class={`chip${state.favoriteOnly ? ' active-chip' : ''}`} data-action="toggle-favorite-only">お気に入り</button>
        <span class="result-meta">{args.visibleGroups.length} / {args.filteredGroups.length} 件 · 30日以上 {args.filteredStaleGroupCount} 件</span>
      </div>
      <section class="bulk-toolbar"><div class="bulk-toolbar-copy"><strong>一括操作</strong><p class="section-copy">{args.selectedSummary.selectedCount ? `${args.selectedSummary.selectedCount} グループ / ${args.selectedSummary.selectedTabCount} タブを選択中` : '複数のグループをまとめて整理できます。'}</p></div>
        <div class="actions bulk-toolbar-actions"><button class="ghost" data-action="select-visible-groups" disabled={busy || !args.bulkSelectableCount}>{lightweight ? '表示中を選択' : '検索結果を選択'}</button><button class="ghost" data-action="select-stale-groups" disabled={busy || !args.staleSelectableCount}>{args.staleSelectLabel}</button><button class="ghost" data-action="clear-group-selection" disabled={busy || !args.selectedSummary.selectedCount}>選択解除</button><button class="secondary" data-action="restore-selected-groups" disabled={busy || !args.selectedSummary.restorableGroupCount}>まとめて復元</button><button class="secondary" data-action="copy-selected-groups" disabled={busy || !args.selectedSummary.selectedCount}>URLコピー</button><button class="danger" data-action="delete-selected-groups" disabled={busy || !args.selectedSummary.selectedCount}>まとめて削除</button></div>
      </section>
      <GroupList view={{ groups: lightweight ? args.visibleGroups : args.filteredGroups, emptyLabel: '保存済みグループはありません。', expandedGroupIds: args.visibleExpandedGroupIds, collapsible: true, busy, selectedGroupIds: state.selectedGroupIds, favoriteGroupIds: state.favoriteGroupIds, extraActionLabel: 'URLコピー', editableGroupId: state.editingGroupId, editableGroupTitle: state.editingGroupTitle }} />
      {#if lightweight && remaining > 0}<div class="load-more-row"><button class="secondary" data-action="show-more-groups">さらに{Math.min(remaining, LIGHTWEIGHT_GROUP_BATCH_SIZE)}件表示</button><span class="result-meta">残り {remaining} 件</span></div>{/if}
    </section>

    {#if lightweight}
      <section class="lightweight-panel-stack">
        <section class="panel lightweight-utility-panel"><div><h2 class="section-title">管理</h2><p class="section-copy">保存先やアカウント設定を管理します。</p></div><div class="actions"><button class="secondary" data-action="toggle-save-panel">{state.savePanelOpen ? '保存を閉じる' : '保存とインポート'}</button><button class="ghost" data-action="toggle-settings-panel">{state.settingsPanelOpen ? '設定を閉じる' : '設定とログイン'}</button></div></section>
        {#if state.savePanelOpen}<SavePanel view={{ title: state.groupTitle, groups: state.allGroups, groupId: state.saveGroupId, status: state.saveStatus, windowBusy: state.saveWindowBusy, tabBusy: state.saveTabBusy, importText: state.importText, importBusy: state.importBusy }} />{/if}
        {#if state.settingsPanelOpen}<section class="lightweight-settings-grid"><AuthPanel view={{ email: state.email, password: state.password, status: state.authStatus, busy: state.authBusy }} /><ConfigPanel view={{ ignoreDomainsText: state.ignoreDomainsText, ignoreTitlesText: state.ignoreTitlesText, busy: state.configBusy }} /></section>{/if}
      </section>
    {:else}
      <aside class="side-column"><SavePanel view={{ title: state.groupTitle, groups: state.allGroups, groupId: state.saveGroupId, status: state.saveStatus, windowBusy: state.saveWindowBusy, tabBusy: state.saveTabBusy, importText: state.importText, importBusy: state.importBusy }} /><AuthPanel view={{ email: state.email, password: state.password, status: state.authStatus, busy: state.authBusy }} /><ConfigPanel view={{ ignoreDomainsText: state.ignoreDomainsText, ignoreTitlesText: state.ignoreTitlesText, busy: state.configBusy }} /></aside>
    {/if}
  </main>
{/if}
