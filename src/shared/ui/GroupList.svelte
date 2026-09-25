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
    return tab.title || '(no title)';
  }
</script>

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
            <button class={`group-select${selected ? ' selected-group-select' : ''}`} type="button" data-action="toggle-group-selection" data-group-id={group.id} aria-pressed={selected} aria-label={selected ? 'グループ選択を解除' : 'グループを選択'} disabled={view.busy}>{selected ? '選択中' : '選択'}</button>
            {#if view.collapsible && !editing}
              <button aria-expanded={expanded} class="group-trigger" type="button" data-action="toggle-group" data-group-id={group.id} disabled={view.busy}>
                <div class="group-text"><div class="group-title-row"><h3>{group.title ?? '(untitled)'}</h3><p>{formatDate(group.created_at)}</p></div>
                  <div class="group-meta"><span class="meta-pill">{group.tabs.length} tabs</span><span class={`meta-pill meta-pill-${age.tone}`}>{age.label}</span><span class="meta-pill">{group.device_id}</span>{#if favorite}<span class="meta-pill favorite-pill">お気に入り</span>{/if}{#if group.is_fixed}<span class="meta-pill">固定 · 復元後も保持</span>{/if}</div>
                </div><span class="indicator">{expanded ? '−' : '+'}</span>
              </button>
            {:else}
              <div class="group-trigger static-header"><div class="group-text">
                {#if editing}<div class="group-title-editor"><input name="groupTitleEdit" type="text" value={view.editableGroupTitle ?? ''} data-group-id={group.id} placeholder="グループ名を入力" disabled={view.busy} /></div>
                {:else}<div class="group-title-row"><h3>{group.title ?? '(untitled)'}</h3><p>{formatDate(group.created_at)}</p></div>{/if}
                <div class="group-meta"><span class="meta-pill">{group.tabs.length} tabs</span><span class={`meta-pill meta-pill-${age.tone}`}>{age.label}</span><span class="meta-pill">{group.device_id}</span>{#if favorite}<span class="meta-pill favorite-pill">お気に入り</span>{/if}{#if group.is_fixed}<span class="meta-pill">固定 · 復元後も保持</span>{/if}</div>
              </div></div>
            {/if}
          </div>
          <div class="actions">
            {#if view.extraActionLabel}<button class="ghost" type="button" data-action="copy-group" data-group-id={group.id} disabled={view.busy}>{view.extraActionLabel}</button>{/if}
            <button class={`ghost${favorite ? ' favorite-toggle-active' : ''}`} type="button" data-action="toggle-favorite-group" data-group-id={group.id} disabled={view.busy}>{favorite ? 'お気に入り解除' : 'お気に入り'}</button>
            {#if editing}
              <button type="button" data-action="save-group-title" data-group-id={group.id} disabled={view.busy}>名前を保存</button>
              <button class="ghost" type="button" data-action="cancel-edit-group-title" data-group-id={group.id} disabled={view.busy}>キャンセル</button>
            {:else}
              <button class="ghost" type="button" data-action="edit-group-title" data-group-id={group.id} disabled={view.busy}>名前編集</button>
            {/if}
            <button class="secondary" type="button" data-action="restore-group" data-group-id={group.id} disabled={view.busy}>{group.is_fixed ? '全部復元' : '復元して削除'}</button>
            <button class="ghost" type="button" data-action="toggle-fixed-group" aria-pressed={group.is_fixed} data-group-id={group.id} disabled={view.busy}>{group.is_fixed ? '固定を解除' : '固定（復元後も保持）'}</button>
            <button class="danger" type="button" data-action="delete-group" data-group-id={group.id} disabled={view.busy}>グループ削除</button>
          </div>
        </div>
        {#if visibleTabs.length > 0}
          <div class={`tab-list${expanded ? '' : ' tab-list-preview'}`}>
            {#each visibleTabs as tab (tab.id)}
              <button class="tab-row" type="button" data-action="open-tab" data-tab-id={tab.id} title={group.is_fixed ? '復元（内容を保持）' : '復元して削除'} disabled={view.busy}>
                <span class="tab-row-main"><span class="tab-row-title">{tabTitle(tab)}</span><span class="tab-row-url">{hostname(tab.url)}</span></span>
                <span class="tab-row-meta">{group.is_fixed ? '復元' : '復元して削除'}</span>
              </button>
            {/each}
            {#if !expanded && hiddenTabCount > 0}<button class="ghost tab-row-more" type="button" data-action="toggle-group" data-group-id={group.id} disabled={view.busy}>残り {hiddenTabCount} 件を表示</button>{/if}
          </div>
        {/if}
      </article>
    {/each}
  </div>
{/if}
