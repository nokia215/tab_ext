<script lang="ts">
  export let email = '';
  export let password = '';
  export let status = '';
  export let busy = false;
  export let onSignUp: () => Promise<void>;
  export let onSignIn: () => Promise<void>;
  export let onSignOut: () => Promise<void>;
</script>

<section class="panel auth-panel">
  <div class="section-head">
    <div>
      <p class="eyebrow">Account</p>
      <h2 class="section-title">Supabase 認証</h2>
    </div>
    <div class="badge">Sync ready</div>
  </div>

  <div class="field-grid">
    <label class="field">
      <span class="field-label">Email</span>
      <input bind:value={email} type="email" placeholder="you@example.com" />
    </label>

    <label class="field">
      <span class="field-label">Password</span>
      <input bind:value={password} type="password" placeholder="password" />
    </label>
  </div>

  <div class="actions">
    <button class="secondary" type="button" disabled={busy} on:click={() => void onSignUp()}>
      新規登録
    </button>
    <button type="button" disabled={busy} on:click={() => void onSignIn()}>
      ログイン
    </button>
    <button class="ghost" type="button" disabled={busy} on:click={() => void onSignOut()}>
      ログアウト
    </button>
  </div>

  {#if status}
    <p class="status-banner">{status}</p>
  {/if}
</section>

<style>
  .auth-panel {
    display: grid;
    gap: 16px;
    padding: 20px;
    border-radius: 24px;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: var(--accent);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 800;
  }

  .field-grid {
    display: grid;
    gap: 12px;
  }
</style>
