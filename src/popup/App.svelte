<script lang="ts">
  import { onMount } from 'svelte';
  import ConfigPanel from '../shared/components/ConfigPanel.svelte';
  import AuthPanel from '../shared/components/AuthPanel.svelte';
  import GroupList from '../shared/components/GroupList.svelte';
  import SavePanel from '../shared/components/SavePanel.svelte';
  import { createTab, getRuntimeUrl } from '../shared/browser-api';
  import { lineListToText, textToLineList } from '../shared/format';
  import { filterGroups } from '../shared/search';
  import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
  import { getActiveTab, getCurrentWindowTabs, openSavedTab, restoreTabs } from '../shared/tabs';
  import {
    deleteGroup,
    deleteSavedTab,
    getCurrentUser,
    listGroups,
    markGroupRestored,
    saveTabGroup,
    signIn,
    signOut,
    signUp
  } from '../shared/supabase';
  import type { AppConfig, TabGroup } from '../shared/types';

  let authStatus = '状態を確認しています。';
  let saveStatus = '';
  let searchQuery = '';
  let allGroups: TabGroup[] = [];
  let expandedGroupIds: string[] = [];

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

  $: filteredGroups = filterGroups(allGroups, searchQuery);
  $: totalTabs = allGroups.reduce((sum, group) => sum + group.tabs.length, 0);
  $: deviceCount = new Set(allGroups.map((group) => group.device_id)).size;

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
      const existingIds = new Set(allGroups.map((group) => group.id));
      expandedGroupIds = expandedGroupIds.filter((id) => existingIds.has(id));
    } catch (error) {
      console.error('refreshGroups failed', error);
      allGroups = [];
      expandedGroupIds = [];
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
    if (result.group?.id) {
      expandedGroupIds = [...new Set([...expandedGroupIds, result.group.id])];
    }
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

  async function handleRestore(group: TabGroup) {
    await restoreTabs(group.tabs.map((tab) => tab.url));
    await markGroupRestored(group.id);
    await refreshGroups();
  }

  async function handleDeleteGroup(group: TabGroup) {
    await deleteGroup(group.id);
    expandedGroupIds = expandedGroupIds.filter((id) => id !== group.id);
    await refreshGroups();
  }

  async function handleOpenTab(tab: TabGroup['tabs'][number]) {
    await openSavedTab(tab.url);
    await deleteSavedTab(tab.id);
    await refreshGroups();
  }

  function handleToggleGroup(group: TabGroup) {
    expandedGroupIds = expandedGroupIds.includes(group.id)
      ? expandedGroupIds.filter((id) => id !== group.id)
      : [...expandedGroupIds, group.id];
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

  <section class="panel search-panel">
    <div>
      <h2 class="section-title">保存済み一覧</h2>
      <p class="section-copy">グループ名、URL、タブ名で絞り込めます。</p>
    </div>
    <label class="field">
      <span class="field-label">検索</span>
      <input bind:value={searchQuery} type="search" placeholder="グループ名・タブ名・URL で検索" />
    </label>
  </section>

  <GroupList
    groups={filteredGroups}
    emptyLabel="まだ保存済みグループはありません。"
    {expandedGroupIds}
    onToggleGroup={handleToggleGroup}
    onRestore={handleRestore}
    onDeleteGroup={handleDeleteGroup}
    onOpenTab={handleOpenTab}
  />

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
  .search-panel {
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

  .search-panel {
    display: grid;
    gap: 14px;
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
