<script lang="ts">
  import StatusBanner from './StatusBanner.svelte';
  import type { AuthPanelView } from '../view-types';

  let { view }: { view: AuthPanelView } = $props();
</script>

<section class="panel auth-panel">
  <div class="section-head">
    <div><h2 class="section-title">アカウント</h2><p class="section-copy">共有されたアカウントでログインすると、保存したタブを同期できます。</p></div>
  </div>
  <form name="sign-in" class="field-grid">
    <label class="field"><span class="field-label">メールアドレス</span><input name="email" type="email" value={view.email} autocomplete="username" required disabled={view.busy} placeholder="you@example.com" /></label>
    <label class="field"><span class="field-label">パスワード</span><input name="password" type="password" value={view.password} autocomplete="current-password" required disabled={view.busy} /></label>
    <div class="actions"><button type="submit" disabled={view.busy}>{view.busy ? '処理中…' : 'ログイン'}</button><button class="ghost" type="button" data-action="sign-out" disabled={view.busy}>ログアウト</button></div>
  </form>
  <StatusBanner status={view.status} error={view.status.includes('失敗')} />
</section>
