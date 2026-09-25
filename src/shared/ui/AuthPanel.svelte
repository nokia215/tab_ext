<script lang="ts">
  import StatusBanner from './StatusBanner.svelte';
  import type { AuthPanelView } from '../view-types';

  let { view }: { view: AuthPanelView } = $props();
</script>

<section class="panel auth-panel">
  <div class="section-head">
    <div><p class="eyebrow">Account</p><h2 class="section-title">Supabase 認証</h2><p class="section-copy">アカウントは管理者から共有されたものを使います。</p></div>
    <div class="badge">Sync ready</div>
  </div>
  <div class="field-grid">
    <label class="field"><span class="field-label">Email</span><input name="email" type="email" value={view.email} placeholder="you@example.com" /></label>
    <label class="field"><span class="field-label">Password</span><input name="password" type="password" value={view.password} placeholder="password" /></label>
  </div>
  <div class="actions"><button type="button" data-action="sign-in" disabled={view.busy}>ログイン</button><button class="ghost" type="button" data-action="sign-out" disabled={view.busy}>ログアウト</button></div>
  <StatusBanner status={view.status} error={view.status.includes('失敗')} />
</section>
