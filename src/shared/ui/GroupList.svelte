<script lang="ts">
  import { describeGroupAge } from '../group-age';
  import { formatDate } from '../format';
  import type { SavedTab } from '../types';
  import type { GroupListView } from '../view-types';

  let { view }: { view: GroupListView } = $props();

  function hostname(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  function tabTitle(tab: SavedTab) {
    return tab.title || '無題のタブ';
  }
</script>

{#snippet icon(path: string, filled = false)}
  <svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d={path} /></svg>
{/snippet}

{#snippet restoreIcon(fixed: boolean)}
  {@render icon(fixed ? 'M14 3h7v7 M21 3 10 14 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5' : 'M14 3h7v7 M21 3 10 14 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7 M17 17l5 5 M22 17l-5 5')}
{/snippet}

{#if view.groups.length === 0}
  <div class="empty-state panel"><p>{view.emptyLabel}</p></div>
{:else}
  <div class="group-list">
    {#each view.groups as group (group.id)}
      {@const expanded = !view.collapsible || view.expandedGroupIds.includes(group.id)}
      {@const selected = Boolean(view.selectedGroupIds?.includes(group.id))}
      {@const favorite = Boolean(view.favoriteGroupIds?.includes(group.id))}
      {@const editing = view.editableGroupId === group.id}
      {@const age = describeGroupAge(group.created_at)}
      {@const previewTabs = group.tabs.slice(0, 6)}
      {@const visibleTabs = expanded ? group.tabs : previewTabs}
      {@const hiddenTabCount = Math.max(group.tabs.length - previewTabs.length, 0)}
      <article class={`group-card panel${selected ? ' group-card-selected' : ''}${favorite ? ' group-card-favorite' : ''}`}>
        <div class="group-header">
          <div class="group-header-main">
            <button class={`group-select icon-button${selected ? ' selected-group-select' : ''}`} type="button" data-action="toggle-group-selection" data-group-id={group.id} aria-pressed={selected} title={selected ? 'グループ選択を解除' : 'グループを選択'} aria-label={selected ? 'グループ選択を解除' : 'グループを選択'} disabled={view.busy}>{@render icon(selected ? 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8 M8 10l4 4L21 5' : 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2')}</button>
            {#if view.collapsible && !editing}
              <button aria-expanded={expanded} class="group-trigger" type="button" data-action="toggle-group" data-group-id={group.id} disabled={view.busy}>
                <div class="group-text"><div class="group-title-row"><h3>{group.title ?? '無題のグループ'}</h3></div>
                  <div class="group-meta">
                    <span class="group-meta-item group-tab-count">{group.tabs.length} タブ</span>
                    <time class="group-meta-item" datetime={group.created_at} title={`作成日時: ${formatDate(group.created_at)}`} aria-label={`${age.label}に作成 · ${formatDate(group.created_at)}`}>{age.label}</time>
                    <span class="group-meta-item group-device" title={`保存元: ${group.device_id}`}><span>{group.device_id}</span></span>
                    {#if group.is_fixed}<span class="group-meta-item group-fixed">固定 · 復元後も保持</span>{/if}
                  </div>
                </div><span class="indicator">{expanded ? '−' : '+'}</span>
              </button>
            {:else}
              <div class="group-trigger static-header"><div class="group-text">
                {#if editing}<div class="group-title-editor"><input name="groupTitleEdit" aria-label="グループ名" type="text" value={view.editableGroupTitle ?? ''} data-group-id={group.id} placeholder="グループ名を入力" disabled={view.busy} /></div>
                {:else}<div class="group-title-row"><h3>{group.title ?? '無題のグループ'}</h3></div>{/if}
                <div class="group-meta">
                  <span class="group-meta-item group-tab-count">{group.tabs.length} タブ</span>
                  <time class="group-meta-item" datetime={group.created_at} title={`作成日時: ${formatDate(group.created_at)}`} aria-label={`${age.label}に作成 · ${formatDate(group.created_at)}`}>{age.label}</time>
                  <span class="group-meta-item group-device" title={`保存元: ${group.device_id}`}><span>{group.device_id}</span></span>
                  {#if group.is_fixed}<span class="group-meta-item group-fixed">固定 · 復元後も保持</span>{/if}
                </div>
              </div></div>
            {/if}
          </div>
          <div class="actions">
            <button class="icon-button" type="button" data-action="restore-group" data-group-id={group.id} title={group.is_fixed ? '全部復元（復元後も保持）' : '復元して削除'} aria-label={group.is_fixed ? '全部復元（復元後も保持）' : '復元して削除'} disabled={view.busy || group.tabs.length === 0}>{@render restoreIcon(group.is_fixed)}</button>
            {#if view.extraActionLabel}<button class="ghost icon-button" type="button" data-action="copy-group" data-group-id={group.id} title={view.extraActionLabel} aria-label={view.extraActionLabel} disabled={view.busy}>{@render icon('M9 9h12v12H9z M5 15H3V3h12v2')}</button>{/if}
            <button class={`ghost icon-button${favorite ? ' favorite-toggle-active' : ''}`} type="button" data-action="toggle-favorite-group" data-group-id={group.id} title={favorite ? 'お気に入り解除' : 'お気に入り'} aria-label={favorite ? 'お気に入り解除' : 'お気に入り'} aria-pressed={favorite} disabled={view.busy}>{@render icon('m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z', favorite)}</button>
            {#if editing}
              <button class="icon-button" type="button" data-action="save-group-title" data-group-id={group.id} title="名前を保存" aria-label="名前を保存" disabled={view.busy}>{@render icon('m5 12 4 4L19 6')}</button>
              <button class="ghost icon-button" type="button" data-action="cancel-edit-group-title" data-group-id={group.id} title="キャンセル" aria-label="キャンセル" disabled={view.busy}>{@render icon('m6 6 12 12 M18 6 6 18')}</button>
            {:else}
              <button class="ghost icon-button" type="button" data-action="edit-group-title" data-group-id={group.id} title="名前編集" aria-label="名前編集" disabled={view.busy}>{@render icon('m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5')}</button>
            {/if}
            <button class="ghost icon-button" type="button" data-action="toggle-fixed-group" aria-pressed={group.is_fixed} data-group-id={group.id} title={group.is_fixed ? '固定を解除' : '固定（復元後も保持）'} aria-label={group.is_fixed ? '固定を解除' : '固定（復元後も保持）'} disabled={view.busy}>{@render icon('M8 3h8 M9 3v6l-3 4v2h12v-2l-3-4V3 M12 15v6')}</button>
            <button class="danger icon-button" type="button" data-action="delete-group" data-group-id={group.id} title="グループ削除" aria-label="グループ削除" disabled={view.busy}>{@render icon('M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7')}</button>
          </div>
        </div>
        {#if visibleTabs.length > 0}
          <div class={`tab-list${expanded ? '' : ' tab-list-preview'}`}>
            {#each visibleTabs as tab (tab.id)}
              <button class="tab-row" type="button" data-action="open-tab" data-tab-id={tab.id} title={`${tabTitle(tab)}\n${tab.url}\n${group.is_fixed ? '復元（内容を保持）' : '復元して削除'}`} aria-label={`${tabTitle(tab)} · ${hostname(tab.url)} · ${group.is_fixed ? '復元（内容を保持）' : '復元して削除'}`} disabled={view.busy}>
                <span class="tab-row-main"><span class="tab-row-title">{tabTitle(tab)}</span><span class="tab-row-url">{hostname(tab.url)}</span></span>
                <span class="tab-row-meta">{@render restoreIcon(group.is_fixed)}</span>
              </button>
            {/each}
            {#if !expanded && hiddenTabCount > 0}<button class="ghost tab-row-more" type="button" data-action="toggle-group" data-group-id={group.id} disabled={view.busy}>残り {hiddenTabCount} 件を表示</button>{/if}
          </div>
        {:else}
          <p>タブはありません。</p>
        {/if}
      </article>
    {/each}
  </div>
{/if}
