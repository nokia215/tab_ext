<script lang="ts">
  import { onMount } from 'svelte';
  import AuthPanel from '../shared/components/AuthPanel.svelte';
  import ConfigPanel from '../shared/components/ConfigPanel.svelte';
  import GroupList from '../shared/components/GroupList.svelte';
  import SavePanel from '../shared/components/SavePanel.svelte';
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
  let pageStatus = '';
  let searchQuery = '';
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

  $: filteredGroups = filterGroups(allGroups, searchQuery);
  $: totalTabs = allGroups.reduce((sum, group) => sum + group.tabs.length, 0);
  $: deviceCount = new Set(allGroups.map((group) => group.device_id)).size;
  $: restoredTabs = allGroups.reduce(
    (sum, group) => sum + group.tabs.filter((tab) => tab.status === 'restored').length,
    0
  );

  function setConfigFields(next: AppConfig) {
    config = next;
    ignoreDomainsText = lineListToText(next.ignoreDomains);
    ignoreTitlesText = lineListToText(next.ignoreTitles);
  }

  async function refreshAll() {
    refreshBusy = true;
    try {
      setConfigFields(await getConfig());
      const user = await getCurrentUser();
      authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';
      allGroups = await listGroups();
      pageStatus = `${allGroups.length} グループを表示中`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      authStatus = `表示失敗: ${message}`;
      pageStatus = 'データを読み込めませんでした。';
      allGroups = [];
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
      pageStatus = '設定を保存しました。';
      await refreshAll();
    } catch (error) {
      pageStatus = `設定保存失敗: ${error instanceof Error ? error.message : String(error)}`;
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
      await refreshAll();
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
      await refreshAll();
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
      await refreshAll();
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
    await refreshAll();
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
    await refreshAll();
  }

  async function handleDeleteGroup(group: TabGroup) {
    await deleteGroup(group.id);
    await refreshAll();
  }

  async function handleOpenTab(tab: TabGroup['tabs'][number]) {
    await openSavedTab(tab.url);
    await deleteSavedTab(tab.id);
    await refreshAll();
  }

  onMount(() => {
    void refreshAll();
  });
</script>

<svelte:head>
  <title>Tab Saver Dashboard</title>
</svelte:head>

<main class="shell page-shell">
  <section class="masthead panel">
    <div class="headline">
      <p class="hero-kicker">Shared Workspace</p>
      <h1>ブラウザをまたいで、タブ作業をそのまま引き継ぐ</h1>
      <p class="muted">
        保存、検索、復元、整理を 1 画面に集約したダッシュボードです。現在の状態を確認しながら次の作業へ移れます。
      </p>
    </div>

    <div class="metric-grid masthead-metrics">
      <article class="metric-card">
        <p class="metric-label">Saved groups</p>
        <p class="metric-value">{allGroups.length}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Active tabs</p>
        <p class="metric-value">{totalTabs}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Restored</p>
        <p class="metric-value">{restoredTabs}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Devices</p>
        <p class="metric-value">{deviceCount}</p>
      </article>
    </div>

    <div class="actions">
      <div class="badge">{authStatus}</div>
      <button class="ghost" type="button" disabled={refreshBusy} on:click={() => void refreshAll()}>
        更新
      </button>
    </div>
  </section>

  {#if pageStatus}
    <p class="status-banner">{pageStatus}</p>
  {/if}

  <section class="workspace-grid">
    <div class="primary-column">
      <section class="panel explorer-panel">
        <div class="explorer-head">
          <div>
            <h2 class="section-title">保存済みグループ</h2>
            <p class="section-copy">タブ名・URL・グループ名で横断検索できます。</p>
          </div>
          <label class="field search-field">
            <span class="field-label">検索</span>
            <input bind:value={searchQuery} type="search" placeholder="例: docs, supabase, design" />
          </label>
        </div>

        <GroupList
          groups={filteredGroups}
          emptyLabel="まだ保存済みグループはありません。"
          expandedGroupIds={filteredGroups.map((group) => group.id)}
          collapsible={false}
          onRestore={handleRestore}
          onDeleteGroup={handleDeleteGroup}
          onOpenTab={handleOpenTab}
        />
      </section>
    </div>

    <aside class="side-column">
      <SavePanel
        bind:title={groupTitle}
        status={saveStatus}
        windowBusy={saveWindowBusy}
        tabBusy={saveTabBusy}
        onSaveWindow={handleSaveWindow}
        onSaveTab={handleSaveTab}
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
      <ConfigPanel
        bind:supabaseUrl={config.supabaseUrl}
        bind:supabaseKey={config.supabaseKey}
        bind:ignoreDomainsText
        bind:ignoreTitlesText
        busy={configBusy}
        onSave={handleSaveConfig}
      />
    </aside>
  </section>
</main>

<style>
  .page-shell {
    max-width: 1440px;
    margin: 0 auto;
    padding: 32px 24px 48px;
    display: grid;
    gap: 20px;
  }

  .masthead {
    padding: 28px;
    border-radius: 32px;
    display: grid;
    gap: 24px;
    background:
      radial-gradient(circle at top right, rgba(131, 224, 255, 0.24), transparent 24%),
      radial-gradient(circle at left center, rgba(20, 255, 194, 0.12), transparent 28%),
      var(--panel-strong);
  }

  .headline h1 {
    margin: 0 0 12px;
    max-width: 12ch;
    font-size: clamp(2.4rem, 4vw, 4.8rem);
    line-height: 0.96;
  }

  .headline p {
    margin: 0;
    max-width: 65ch;
  }

  .hero-kicker {
    margin: 0 0 12px;
    color: var(--accent);
    font-size: 0.76rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 800;
  }

  .masthead-metrics {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .workspace-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
    gap: 20px;
    align-items: start;
  }

  .primary-column,
  .side-column {
    display: grid;
    gap: 20px;
  }

  .explorer-panel {
    padding: 22px;
    border-radius: 28px;
    display: grid;
    gap: 18px;
  }

  .explorer-head {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
  }

  .section-copy {
    margin: 8px 0 0;
  }

  .search-field {
    width: min(100%, 360px);
  }

  @media (max-width: 980px) {
    .page-shell {
      padding-inline: 16px;
    }

    .workspace-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
