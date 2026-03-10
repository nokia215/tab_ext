<script lang="ts">
  export let supabaseUrl = '';
  export let supabaseKey = '';
  export let ignoreDomainsText = '';
  export let ignoreTitlesText = '';
  export let busy = false;
  export let onSave: () => Promise<void>;
</script>

<section class="panel config-panel">
  <div>
    <p class="eyebrow">Control</p>
    <h2 class="section-title">接続設定と除外ルール</h2>
    <p class="section-copy">
      `service_role` は使わず、保存対象から除外したいドメインやタイトルを行単位で指定します。
    </p>
  </div>

  <div class="field-grid">
    <label class="field">
      <span class="field-label">Project URL</span>
      <input bind:value={supabaseUrl} type="url" placeholder="https://xxxx.supabase.co" />
    </label>

    <label class="field">
      <span class="field-label">Publishable / anon key</span>
      <textarea bind:value={supabaseKey} rows="4" placeholder="eyJ..."></textarea>
    </label>
  </div>

  <div class="field-grid split">
    <label class="field">
      <span class="field-label">Ignore domains</span>
      <textarea
        bind:value={ignoreDomainsText}
        rows="5"
        placeholder="mail.google.com&#10;slack.com&#10;chatgpt.com"
      ></textarea>
    </label>

    <label class="field">
      <span class="field-label">Ignore titles</span>
      <textarea bind:value={ignoreTitlesText} rows="5" placeholder="Inbox&#10;Notifications"></textarea>
    </label>
  </div>

  <div class="actions">
    <button type="button" disabled={busy} on:click={() => void onSave()}>
      設定を保存
    </button>
  </div>
</section>

<style>
  .config-panel {
    display: grid;
    gap: 18px;
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

  .field-grid {
    display: grid;
    gap: 12px;
  }

  .split {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
</style>
