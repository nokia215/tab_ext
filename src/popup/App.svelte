<script lang="ts">
  import { onMount } from 'svelte';
  import { getOrCreateDeviceId } from '../shared/storage';
  import { requestActiveTab, requestCurrentWindowTabs } from '../shared/messages';
  import { getErrorMessage } from '../shared/status';
  import { getCurrentSessionUser, listGroups, saveTabGroup, signIn, signOut } from '../shared/supabase';
  import type { TabGroup } from '../shared/types';
  import { getRuntimeUrl, createTab } from '../shared/browser-api';

  let email = $state('');
  let password = $state('');
  let groups = $state<TabGroup[]>([]);
  let groupId = $state('');
  let title = $state('');
  let userEmail = $state('');
  let status = $state('');
  let busy = $state(false);

  async function refresh() {
    const user = await getCurrentSessionUser();
    userEmail = user?.email ?? '';
    groups = user ? await listGroups(user.id) : [];
  }

  onMount(() => {
    void refresh().catch((error) => status = getErrorMessage(error));
  });

  async function run(action: () => Promise<void>) {
    if (busy) return;
    busy = true;
    status = '';
    try {
      await action();
    } catch (error) {
      status = getErrorMessage(error);
    } finally {
      busy = false;
    }
  }

  function login(event: SubmitEvent) {
    event.preventDefault();
    return run(async () => {
      const { error } = await signIn(email.trim(), password);
      if (error) throw error;
      password = '';
      await refresh();
      status = 'ログインしました。';
    });
  }

  function save(tabs: chrome.tabs.Tab[]) {
    return run(async () => {
      const result = await saveTabGroup({ title, groupId: groupId || undefined,
        deviceId: await getOrCreateDeviceId(), tabs });
      status = `${result.count} 件保存しました。${result.duplicateCount ? ` 重複 ${result.duplicateCount} 件をスキップしました。` : ''}`;
      groups = await listGroups();
    });
  }
</script>

<main class="shell popup-shell">
  <header class="panel">
    <p class="hero-kicker">Tab Saver</p>
    <h1>タブを保存</h1>
    {#if userEmail}
      <p class="muted">{userEmail} でログイン中</p>
    {:else}
      <form onsubmit={login}>
        <label>メールアドレス<input type="email" bind:value={email} autocomplete="username" required /></label>
        <label>パスワード<input type="password" bind:value={password} autocomplete="current-password" required /></label>
        <button type="submit" disabled={busy}>ログイン</button>
      </form>
    {/if}
  </header>

  {#if userEmail}
    <section class="panel">
      <label>保存先グループ
        <select bind:value={groupId}>
          <option value="">新しいグループ</option>
          {#each groups as group (group.id)}
            <option value={group.id}>{group.title || '無題のグループ'}</option>
          {/each}
        </select>
      </label>
      {#if !groupId}<label>グループ名<input bind:value={title} placeholder="空欄で自動設定" /></label>{/if}
      <div class="actions">
        <button onclick={() => void requestCurrentWindowTabs().then(save)} disabled={busy}>ウィンドウを保存</button>
        <button class="secondary" onclick={() => void requestActiveTab().then((tab) => tab && save([tab]))} disabled={busy}>現在のタブを保存</button>
      </div>
      <button class="ghost" onclick={() => void run(async () => { const { error } = await signOut(); if (error) throw error; await refresh(); })} disabled={busy}>ログアウト</button>
    </section>
  {/if}

  <p role="status" aria-live="polite">{status}</p>
  <button class="secondary" onclick={() => void createTab({ url: getRuntimeUrl('dashboard.html'), active: true })}>一覧を開く</button>
</main>
