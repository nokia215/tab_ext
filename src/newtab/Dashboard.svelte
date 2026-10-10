<script lang="ts">
  import { dashboards } from '../shared/dashboard-state.svelte';
  import { isDashboardBusy, LIGHTWEIGHT_GROUP_BATCH_SIZE, queryGroups, collectDeviceFilterOptions, summarizeSelectedGroups } from '../shared/dashboard-model';
  import { reconcileExpandedGroupIds, visibleGroups } from '../shared/group-state';
  import { isErrorStatus } from '../shared/status';
  import StatusBanner from '../shared/ui/StatusBanner.svelte';
  import GroupList from '../shared/ui/GroupList.svelte';
  import SavePanel from '../shared/ui/SavePanel.svelte';
  import AuthPanel from '../shared/ui/AuthPanel.svelte';
  import ConfigPanel from '../shared/ui/ConfigPanel.svelte';
  import '../shared/redesign.css';

  let state = $derived(dashboards.desktop);
  let view = $derived.by(() => {
    if (!state) return null;
    const filteredGroups = queryGroups(state.allGroups, state);
    const shownGroups = state.uiMode === 'lightweight' ? visibleGroups(filteredGroups, state.visibleGroupCount) : filteredGroups;
    const bulkGroups = state.uiMode === 'lightweight' ? shownGroups : filteredGroups;
    return {
      state,
      selectedSummary: summarizeSelectedGroups(state.allGroups, state.selectedGroupIds),
      bulkSelectableCount: bulkGroups.length,
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
  {@const syncStatusIsError = isErrorStatus(state.syncStatus)}
  {@const lightweight = state.uiMode === 'lightweight'}
  {@const remaining = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0)}
  <main class={`shell page-shell${lightweight ? ' lightweight-shell' : ''}`}>
    <section class="masthead panel">
      <div class="masthead-layout">
        <div class="headline"><h1>保存したタブ</h1></div>
        <div class="actions masthead-side">{#if lightweight}<span class="badge accent-badge">Android Firefox</span>{/if}<span class="badge">{state.authStatus}</span>
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

    <section class={`panel explorer-panel${lightweight ? ' lightweight-explorer' : ''}`}>
      <div class="explorer-head"><div><h2 class="section-title">保存済みグループ</h2></div></div>
      <div class={`toolbar${lightweight ? ' compact-toolbar' : ''}`}>
        <label class="field search-field"><span class="field-label">検索</span><input name="searchQuery" type="search" value={state.searchQuery} placeholder="タブ名、URL、グループ名、端末名" /></label>
        <label class="field compact-field"><span class="field-label">並び順</span><select name="sortMode" value={state.sortMode}><option value="newest">新しい順</option><option value="oldest">古い順</option><option value="tabCount">タブ数順</option></select></label>
        <label class="field compact-field device-field"><span class="field-label">端末</span><select name="deviceFilter" value={state.deviceFilter}><option value="all">すべての端末</option>{#each args.deviceFilterOptions as device}<option value={device.value}>{device.label}</option>{/each}</select></label>
      </div>
      <div class="filter-row">
        <button class={`chip${state.groupFilter === 'all' ? ' active-chip' : ''}`} aria-pressed={state.groupFilter === 'all'} data-action="set-group-filter" data-value="all">すべて</button>
        <button class={`chip${state.groupFilter === 'fixed' ? ' active-chip' : ''}`} aria-pressed={state.groupFilter === 'fixed'} data-action="set-group-filter" data-value="fixed">固定のみ</button>
        <button class={`chip${state.favoriteOnly ? ' active-chip' : ''}`} aria-pressed={state.favoriteOnly} data-action="toggle-favorite-only">お気に入り</button>
        <span class="result-meta">{args.visibleGroups.length} / {args.filteredGroups.length} 件</span>
      </div>
      {#if args.selectedSummary.selectedCount}
        <section class="bulk-toolbar" aria-label="選択したグループの一括操作">
          <span class="result-meta">{args.selectedSummary.selectedCount} グループ / {args.selectedSummary.selectedTabCount} タブを選択中</span>
          <div class="actions bulk-toolbar-actions">
            <button class="ghost" data-action="select-visible-groups" title={lightweight ? '表示中のグループをすべて選択' : '現在の検索・フィルタに一致するグループをすべて選択'} disabled={busy || !args.bulkSelectableCount}>全選択</button>
            <button class="ghost" data-action="clear-group-selection" disabled={busy}>選択解除</button>
            <button data-action="restore-selected-groups" disabled={busy || !args.selectedSummary.restorableGroupCount}>まとめて復元</button>
            <button class="secondary" data-action="copy-selected-groups" disabled={busy}>URLコピー</button>
            <button class="danger" data-action="delete-selected-groups" disabled={busy}>まとめて削除</button>
          </div>
        </section>
      {/if}
      <GroupList view={{ groups: lightweight ? args.visibleGroups : args.filteredGroups, emptyLabel: state.authStatus === '未ログイン' ? 'ログインすると保存したタブを表示できます。' : state.allGroups.length ? '条件に一致するグループはありません。検索語やフィルタを変更してください。' : '保存済みグループはありません。', expandedGroupIds: args.visibleExpandedGroupIds, collapsible: true, busy, selectedGroupIds: state.selectedGroupIds, favoriteGroupIds: state.favoriteGroupIds, extraActionLabel: 'URLコピー', editableGroupId: state.editingGroupId, editableGroupTitle: state.editingGroupTitle }} />
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
