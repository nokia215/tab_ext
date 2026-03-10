<script lang="ts">
  import { onMount } from 'svelte';
  import ConfigPanel from '../shared/components/ConfigPanel.svelte';
  import AuthPanel from '../shared/components/AuthPanel.svelte';
  import SavePanel from '../shared/components/SavePanel.svelte';
  import { createTab, getRuntimeUrl } from '../shared/browser-api';
  import { lineListToText, textToLineList } from '../shared/format';
  import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
  import { getActiveTab, getCurrentWindowTabs } from '../shared/tabs';
  import {
    getCurrentUser,
    listGroups,
    saveTabGroup,
    signIn,
    signOut,
    signUp
  } from '../shared/supabase';
  import type { AppConfig, TabGroup } from '../shared/types';

  let authStatus = '状態を確認しています。';
  let saveStatus = '';
  let allGroups: TabGroup[] = [];

  let email = '';
  let password = '';
  let groupTitle = '';

  let configBusy = false;
  let authBusy = false;
  let refreshBusy = false;
  let saveWindowBusy = false;
  let saveTabBusy = false;

  let config: AppConfig = {
    supabaseUrl: '',
    supabaseKey: '',
    ignoreDomains: [],
    ignoreTitles: []
  };

  let ignoreDomainsText = '';
  let ignoreTitlesText = '';

  $: totalTabs = allGroups.reduce((sum, group) => sum + group.tabs.length, 0);
  $: deviceCount = new Set(allGroups.map((group) => group.device_id)).size;
  $: recentGroups = allGroups.slice(0, 5);

  function setConfigFields(next: AppConfig) {
    config = next;
    ignoreDomainsText = lineListToText(next.ignoreDomains);
    ignoreTitlesText = lineListToText(next.ignoreTitles);
  }

  async function refreshAuthStatus() {
    try {
      const user = await getCurrentUser();
      authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';
    } catch (error) {
      authStatus = `状態確認失敗: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function refreshGroups() {
    try {
      allGroups = await listGroups();
    } catch (error) {
      console.error('refreshGroups failed', error);
      allGroups = [];
    }
  }

  async function bootstrap() {
    refreshBusy = true;
    try {
      setConfigFields(await getConfig());
      await refreshAuthStatus();
      await refreshGroups();
    } finally {
      refreshBusy = false;
    }
  }

  function configPayload(): AppConfig {
    return {
      supabaseUrl: config.supabaseUrl.trim(),
      supabaseKey: config.supabaseKey.trim(),
      ignoreDomains: textToLineList(ignoreDomainsText),
      ignoreTitles: textToLineList(ignoreTitlesText)
    };
  }

  async function handleSaveConfig() {
    configBusy = true;
    try {
      const next = configPayload();
      await saveConfig(next);
      setConfigFields(next);
      authStatus = '設定を保存しました。';
      await refreshAuthStatus();
      await refreshGroups();
    } catch (error) {
      authStatus = `設定保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      configBusy = false;
    }
  }

  async function handleSignUp() {
    authBusy = true;
    try {
      const { data, error } = await signUp(email.trim(), password);
      if (error) throw error;
      authStatus = data.user && !data.session
        ? '登録しました。確認メールが必要なら確認してください。'
        : '登録しました。';
      await refreshAuthStatus();
    } catch (error) {
      authStatus = `登録失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      authBusy = false;
    }
  }

  async function handleSignIn() {
    authBusy = true;
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) throw error;
      authStatus = 'ログインしました。';
      await refreshAuthStatus();
      await refreshGroups();
    } catch (error) {
      authStatus = `ログイン失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      authBusy = false;
    }
  }

  async function handleSignOut() {
    authBusy = true;
    try {
      const { error } = await signOut();
      if (error) throw error;
      authStatus = 'ログアウトしました。';
      await refreshAuthStatus();
      await refreshGroups();
    } catch (error) {
      authStatus = `ログアウト失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      authBusy = false;
    }
  }

  async function saveTabs(tabs: chrome.tabs.Tab[]) {
    const deviceId = await getOrCreateDeviceId();
    const result = await saveTabGroup({
      title: groupTitle,
      deviceId,
      tabs
    });
    saveStatus = `${result.count} 件保存しました。`;
    await refreshGroups();
  }

  async function handleSaveWindow() {
    if (saveWindowBusy || saveTabBusy) return;
    saveWindowBusy = true;
    try {
      await saveTabs(await getCurrentWindowTabs());
    } catch (error) {
      saveStatus = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saveWindowBusy = false;
    }
  }

  async function handleSaveTab() {
    if (saveWindowBusy || saveTabBusy) return;
    saveTabBusy = true;
    try {
      const tab = await getActiveTab();
      if (!tab) throw new Error('現在タブが取得できません。');
      await saveTabs([tab]);
    } catch (error) {
      saveStatus = `保存失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saveTabBusy = false;
    }
  }

  async function handleRefresh() {
    refreshBusy = true;
    await refreshAuthStatus();
    await refreshGroups();
    refreshBusy = false;
  }

  async function openDashboard() {
    await createTab({ url: getRuntimeUrl('newtab.html'), active: true });
  }

  onMount(() => {
    void bootstrap();
  });
</script>

<svelte:head>
  <title>Tab Saver</title>
</svelte:head>

<main class="shell popup-shell">
  <section class="hero panel">
    <div class="hero-copy">
      <p class="hero-kicker">Tab Saver</p>
      <h1>ワンクリックで作業中のタブ群を退避</h1>
      <p class="muted">
        現在のウィンドウをスナップショット化し、別ブラウザや別マシンから復元できます。
      </p>
    </div>

    <div class="metric-grid hero-metrics">
      <article class="metric-card">
        <p class="metric-label">Groups</p>
        <p class="metric-value">{allGroups.length}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Tabs</p>
        <p class="metric-value">{totalTabs}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Devices</p>
        <p class="metric-value">{deviceCount}</p>
      </article>
    </div>

    <div class="actions">
      <button class="secondary" type="button" on:click={openDashboard}>ダッシュボードを開く</button>
      <button class="ghost" type="button" disabled={refreshBusy} on:click={() => void handleRefresh()}>
        更新
      </button>
    </div>
  </section>

  <SavePanel
    bind:title={groupTitle}
    status={saveStatus}
    windowBusy={saveWindowBusy}
    tabBusy={saveTabBusy}
    onSaveWindow={handleSaveWindow}
    onSaveTab={handleSaveTab}
  />

  <section class="panel recent-panel">
    <div>
      <h2 class="section-title">最近の保存</h2>
      <p class="section-copy">popup では概要だけを表示し、詳細操作はダッシュボードで行います。</p>
    </div>
    {#if recentGroups.length === 0}
      <div class="empty-mini">まだ保存済みグループはありません。</div>
    {:else}
      <div class="recent-list">
        {#each recentGroups as group (group.id)}
          <article class="recent-item">
            <div class="recent-main">
              <h3>{group.title ?? '(untitled)'}</h3>
              <p>{group.tabs.length} tabs · {group.device_id}</p>
            </div>
          </article>
        {/each}
      </div>
    {/if}
    <button class="secondary" type="button" on:click={openDashboard}>詳細はダッシュボードで開く</button>
  </section>

  <details class="settings-wrap">
    <summary>設定と認証</summary>
    <div class="settings-grid">
      <ConfigPanel
        bind:supabaseUrl={config.supabaseUrl}
        bind:supabaseKey={config.supabaseKey}
        bind:ignoreDomainsText
        bind:ignoreTitlesText
        busy={configBusy}
        onSave={handleSaveConfig}
      />
      <AuthPanel
        bind:email
        bind:password
        status={authStatus}
        busy={authBusy}
        onSignUp={handleSignUp}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    </div>
  </details>
</main>

<style>
  .popup-shell {
    width: 420px;
    min-height: 100vh;
    padding: 18px;
    display: grid;
    gap: 16px;
  }

  .hero,
  .recent-panel {
    padding: 20px;
    border-radius: 28px;
  }

  .hero {
    display: grid;
    gap: 18px;
    background:
      linear-gradient(135deg, rgba(131, 224, 255, 0.14), transparent 46%),
      var(--panel-strong);
  }

  .hero-kicker {
    margin: 0 0 8px;
    color: var(--accent);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 800;
  }

  .hero h1 {
    margin: 0 0 10px;
    font-size: 1.5rem;
    line-height: 1.05;
  }

  .hero-copy p {
    margin: 0;
  }

  .hero-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .recent-panel {
    display: grid;
    gap: 14px;
  }

  .recent-list {
    display: grid;
    gap: 10px;
  }

  .recent-item {
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.04);
  }

  .recent-main h3 {
    margin: 0 0 6px;
    font-size: 0.95rem;
    word-break: break-word;
  }

  .recent-main p {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
    word-break: break-all;
  }

  .empty-mini {
    padding: 14px;
    border-radius: 18px;
    border: 1px dashed var(--line);
    color: var(--muted);
    text-align: center;
  }

  .section-copy {
    margin: 8px 0 0;
  }

  .settings-wrap {
    border: 1px solid var(--line);
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.04);
    padding: 0 18px 18px;
  }

  .settings-wrap summary {
    cursor: pointer;
    padding: 16px 0;
    font-weight: 700;
  }

  .settings-grid {
    display: grid;
    gap: 16px;
  }
</style>
