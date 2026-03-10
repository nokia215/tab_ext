<script lang="ts">
  export let title = '';
  export let status = '';
  export let windowBusy = false;
  export let tabBusy = false;
  export let onSaveWindow: () => Promise<void>;
  export let onSaveTab: () => Promise<void>;
</script>

<section class="panel save-panel">
  <div class="section-head">
    <div>
      <p class="eyebrow">Capture</p>
      <h2 class="section-title">今の作業をスナップショット化</h2>
      <p class="section-copy">ウィンドウ全体か、選択中のタブだけを保存できます。</p>
    </div>
  </div>

  <label class="field">
    <span class="field-label">グループ名</span>
    <input bind:value={title} type="text" placeholder="例: 2026-03-11 調査タブ" />
  </label>

  <div class="actions">
    <button type="button" disabled={windowBusy || tabBusy} on:click={() => void onSaveWindow()}>
      現在ウィンドウを保存
    </button>
    <button class="secondary" type="button" disabled={windowBusy || tabBusy} on:click={() => void onSaveTab()}>
      現在タブのみ保存
    </button>
  </div>

  {#if status}
    <p class="status-banner">{status}</p>
  {/if}
</section>

<style>
  .save-panel {
    display: grid;
    gap: 16px;
    padding: 20px;
    border-radius: 24px;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: var(--accent);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 800;
  }

  .section-copy {
    margin: 10px 0 0;
  }
</style>
