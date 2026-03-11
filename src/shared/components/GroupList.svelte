<script lang="ts">
  import type { SavedTab, TabGroup } from '../types';
  import { formatDate } from '../format';

  export let groups: TabGroup[] = [];
  export let emptyLabel = 'まだ何もありません。';
  export let expandedGroupIds: string[] = [];
  export let collapsible = true;
  export let busy = false;
  export let onToggleGroup: (group: TabGroup) => void = () => {};
  export let onRestore: (group: TabGroup) => Promise<void>;
  export let onDeleteGroup: (group: TabGroup) => Promise<void>;
  export let onOpenTab: (tab: SavedTab) => Promise<void>;
  export let extraActionLabel = '';
  export let onExtraAction: ((group: TabGroup) => Promise<void>) | null = null;

  function isExpanded(group: TabGroup) {
    return !collapsible || expandedGroupIds.includes(group.id);
  }

  function handleHeaderClick(group: TabGroup) {
    if (!collapsible) return;
    onToggleGroup(group);
  }
</script>

{#if groups.length === 0}
  <div class="empty-state panel">
    <p>{emptyLabel}</p>
  </div>
{:else}
  <div class="group-list">
    {#each groups as group (group.id)}
      <article class="group-card panel">
        <div class="group-header">
          {#if collapsible}
            <button
              aria-expanded={isExpanded(group)}
              class="group-trigger"
              disabled={busy}
              type="button"
              on:click={() => handleHeaderClick(group)}
            >
              <div class="group-text">
                <h3>{group.title ?? '(untitled)'}</h3>
                <p>{formatDate(group.created_at)} · {group.tabs.length} tabs · {group.device_id}</p>
              </div>
              <span class="indicator">{isExpanded(group) ? '−' : '+'}</span>
            </button>
          {:else}
            <div class="group-trigger static-header">
              <div class="group-text">
                <h3>{group.title ?? '(untitled)'}</h3>
                <p>{formatDate(group.created_at)} · {group.tabs.length} tabs · {group.device_id}</p>
              </div>
            </div>
          {/if}

          <div class="actions">
            {#if extraActionLabel && onExtraAction}
              <button class="ghost" type="button" disabled={busy} on:click={() => void onExtraAction?.(group)}>
                {extraActionLabel}
              </button>
            {/if}
            <button class="secondary" type="button" disabled={busy} on:click={() => void onRestore(group)}>
              全部復元
            </button>
            <button class="danger" type="button" disabled={busy} on:click={() => void onDeleteGroup(group)}>
              グループ削除
            </button>
          </div>
        </div>

        {#if isExpanded(group)}
          <div class="tab-list">
            {#each group.tabs as tab (tab.id)}
              <button class="tab-row" type="button" disabled={busy} on:click={() => void onOpenTab(tab)}>
                <span class="tab-row-title">{tab.title || '(no title)'}</span>
                <span class="tab-row-url">{tab.url}</span>
              </button>
            {/each}
          </div>
        {/if}
      </article>
    {/each}
  </div>
{/if}

<style>
  .group-list {
    display: grid;
    gap: 14px;
  }

  .empty-state {
    border-radius: 24px;
    padding: 24px;
    text-align: center;
    color: var(--muted);
  }

  .group-card {
    border-radius: 24px;
    padding: 18px;
    display: grid;
    gap: 16px;
  }

  .group-header {
    display: grid;
    gap: 12px;
  }

  .group-trigger {
    width: 100%;
    padding: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    background: transparent;
    border: none;
    color: inherit;
    box-shadow: none;
    text-align: left;
    cursor: pointer;
  }

  .group-trigger:hover {
    transform: none;
  }

  .static-header {
    cursor: default;
  }

  .group-text h3 {
    margin: 0 0 6px;
    font-size: 1rem;
  }

  .group-text p {
    margin: 0;
    color: var(--muted);
    font-size: 0.82rem;
    word-break: break-word;
  }

  .indicator {
    width: 32px;
    height: 32px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid var(--line);
    color: var(--accent);
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .tab-list {
    display: grid;
    gap: 10px;
  }

  .tab-row {
    width: 100%;
    display: grid;
    gap: 6px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    text-align: left;
    box-shadow: none;
  }

  .tab-row-title {
    font-weight: 700;
    word-break: break-word;
  }

  .tab-row-url {
    color: var(--muted);
    font-size: 0.8rem;
    word-break: break-all;
  }
</style>
