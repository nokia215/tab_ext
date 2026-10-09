<script lang="ts">
  import { dashboards } from '../shared/dashboard-state.svelte';
  import { isDashboardBusy, queryGroups, collectDeviceFilterOptions, summarizeSelectedGroups } from '../shared/dashboard-model';
  import { reconcileExpandedGroupIds, visibleGroups } from '../shared/group-state';
  import { isErrorStatus } from '../shared/status';
  import StatusBanner from '../shared/ui/StatusBanner.svelte';
  import GroupList from '../shared/ui/GroupList.svelte';
  import SaveDestination from '../shared/ui/SaveDestination.svelte';
  import AuthPanel from '../shared/ui/AuthPanel.svelte';
  import ConfigPanel from '../shared/ui/ConfigPanel.svelte';
  import '../shared/redesign.css';

  let state = $derived(dashboards.tablet);
  let view = $derived.by(() => {
    if (!state) return null;
    const filteredGroups = queryGroups(state.allGroups, state);
    const shownGroups = visibleGroups(filteredGroups, state.visibleGroupCount);
    return {
      state,
      selectedSummary: summarizeSelectedGroups(state.allGroups, state.selectedGroupIds),
      bulkSelectableCount: shownGroups.length,
      deviceFilterOptions: collectDeviceFilterOptions(state.allGroups),
      filteredGroups,
      visibleGroups: shownGroups,
      visibleExpandedGroupIds: reconcileExpandedGroupIds(state.expandedGroupIds, shownGroups, 1),
      pageStatusIsError: isErrorStatus(state.pageStatus)
    };
  });
</script>

{#if view}
  {@const args = view}
  {@const state = args.state}
  {@const busy = isDashboardBusy(state)}
  {@const syncStatusIsError = isErrorStatus(state.syncStatus)}
  {@const remaining = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0)}
  <main class="shell page-shell lightweight-shell tablet-shell">
    <section class="masthead panel">
      <div class="masthead-layout">
        <div class="headline"><h1>保存したタブ</h1></div>
        <div class="actions masthead-side"><span class="badge">{state.authStatus}</span>
          {#if state.pageStatus && !args.pageStatusIsError}<span class="badge" role="status">{state.pageStatus}</span>{/if}
          {#if state.syncStatus && !syncStatusIsError}<span class="badge" role="status">{state.syncStatus}</span>{/if}
          <button class="ghost" data-action="refresh-all" disabled={busy}>更新</button></div>
      </div>
    </section>

    {#if args.pageStatusIsError || syncStatusIsError}
      <div class="status-stack">
        {#if args.pageStatusIsError}<StatusBanner status={state.pageStatus} error />{/if}
        {#if syncStatusIsError}<StatusBanner status={state.syncStatus} error />{/if}
      </div>
    {/if}
    {#if state.pageStatus.includes('削除同期に失敗')}<button class="secondary" data-action="refresh-all" disabled={state.actionBusy || state.refreshBusy}>削除の同期を再試行</button>{/if}

    <section class="panel lightweight-explorer tablet-explorer">
      <div class="explorer-head"><div><h2 class="section-title">保存済みグループ</h2></div></div>
      <div class="toolbar compact-toolbar">
        <label class="field search-field"><span class="field-label">検索</span><input name="searchQuery" type="search" value={state.searchQuery} placeholder="タブ名、URL、グループ名、端末名" /></label>
        <label class="field compact-field"><span class="field-label">並び順</span><select name="sortMode" value={state.sortMode}><option value="newest">新しい順</option><option value="oldest">古い順</option><option value="tabCount">タブ数順</option></select></label>
        <label class="field compact-field device-field"><span class="field-label">端末</span><select name="deviceFilter" value={state.deviceFilter}><option value="all">すべての端末</option>{#each args.deviceFilterOptions as device}<option value={device.value}>{device.label}</option>{/each}</select></label>
      </div>
      <div class="filter-row"><button class={`chip${state.groupFilter === 'all' ? ' active-chip' : ''}`} aria-pressed={state.groupFilter === 'all'} data-action="set-group-filter" data-value="all">すべて</button><button class={`chip${state.groupFilter === 'fixed' ? ' active-chip' : ''}`} aria-pressed={state.groupFilter === 'fixed'} data-action="set-group-filter" data-value="fixed">固定</button><button class={`chip${state.favoriteOnly ? ' active-chip' : ''}`} aria-pressed={state.favoriteOnly} data-action="toggle-favorite-only">お気に入り</button><span class="result-meta">{args.visibleGroups.length} / {args.filteredGroups.length} 件</span></div>
      {#if args.selectedSummary.selectedCount}
        <section class="bulk-toolbar" aria-label="選択したグループの一括操作">
          <span class="result-meta">{args.selectedSummary.selectedCount} グループ / {args.selectedSummary.selectedTabCount} タブを選択中</span>
          <div class="actions bulk-toolbar-actions">
            <button class="ghost" data-action="select-visible-groups" disabled={busy || !args.bulkSelectableCount}>表示中を選択</button>
            <button class="ghost" data-action="clear-group-selection" disabled={busy}>選択解除</button>
            <button data-action="restore-selected-groups" disabled={busy || !args.selectedSummary.restorableGroupCount}>まとめて復元</button>
            <button class="secondary" data-action="copy-selected-groups" disabled={busy}>URLコピー</button>
            <button class="danger" data-action="delete-selected-groups" disabled={busy}>まとめて削除</button>
          </div>
        </section>
      {:else}
        <button class="ghost bulk-select" data-action="select-visible-groups" disabled={busy || !args.bulkSelectableCount}>表示中を選択</button>
      {/if}
      <GroupList view={{ groups: args.visibleGroups, emptyLabel: state.authStatus === '未ログイン' ? 'ログインすると保存したタブを表示できます。' : state.allGroups.length ? '条件に一致するグループはありません。検索語やフィルタを変更してください。' : '保存済みグループはありません。', expandedGroupIds: args.visibleExpandedGroupIds, collapsible: true, busy, selectedGroupIds: state.selectedGroupIds, favoriteGroupIds: state.favoriteGroupIds, extraActionLabel: 'URLコピー', editableGroupId: state.editingGroupId, editableGroupTitle: state.editingGroupTitle }} />
      {#if remaining > 0}<div class="load-more-row"><button class="secondary" data-action="show-more-groups">さらに表示</button><span class="result-meta">残り {remaining} 件</span></div>{/if}
    </section>

    <section class="lightweight-panel-stack">
      <section class="panel lightweight-utility-panel tablet-import-panel">
        <div class="section-head"><div><h2 class="section-title">URLリストから追加</h2><p class="section-copy">現在のタブを自動取得しないため、保存するURLを貼り付けてください。</p></div><span class="badge">Web</span></div>
        <SaveDestination groups={state.allGroups} groupId={state.saveGroupId} busy={state.importBusy} />
        <label class="field"><span class="field-label">新規グループ名</span><input name="groupTitle" type="text" value={state.groupTitle} disabled={state.importBusy || Boolean(state.saveGroupId)} placeholder="未入力なら自動命名" /></label>
        <label class="field"><span class="field-label">URLとタイトル</span><textarea name="importText" rows="7" placeholder="https://example.com | Example&#10;https://another.example.com | Another Tab&#10;&#10;空行でグループを分けます">{state.importText}</textarea></label>
        <div class="actions"><button class="secondary" data-action="import-tabs" disabled={state.importBusy}>テキストから保存</button></div>
        <p class="section-copy"><code>URL | タブ名</code> を1行ずつ入力します。空行でグループを分けられます。</p>
        <StatusBanner status={state.saveStatus} error={state.saveStatus.includes('失敗')} />
      </section>
      <AuthPanel view={{ email: state.email, password: state.password, status: state.authStatus, busy: state.authBusy }} />
      <ConfigPanel view={{ ignoreDomainsText: state.ignoreDomainsText, ignoreTitlesText: state.ignoreTitlesText, busy: state.configBusy }} />
    </section>
  </main>
{/if}
