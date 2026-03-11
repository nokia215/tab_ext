<script lang="ts">
  import { onMount } from 'svelte';
  import AuthPanel from '../shared/components/AuthPanel.svelte';
  import ConfigPanel from '../shared/components/ConfigPanel.svelte';
  import GroupList from '../shared/components/GroupList.svelte';
  import SavePanel from '../shared/components/SavePanel.svelte';
  import { runtimeSendMessage } from '../shared/browser-api';
  import { lineListToText, textToLineList } from '../shared/format';
  import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
  import { filterGroups } from '../shared/search';
  import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
  import { getActiveTab, getCurrentWindowTabs } from '../shared/tabs';
  import {
    deleteGroup,
    getCurrentSessionUser,
    listGroups,
    saveTabGroup,
    signIn,
    signOut,
    signUp
  } from '../shared/supabase';
  import type { AppConfig, TabGroup } from '../shared/types';

  type GroupFilter = 'all' | 'saved' | 'restored';
  type SortMode = 'newest' | 'oldest' | 'tabCount';

  let authStatus = '状態を確認しています。';
  let saveStatus = '';
  let pageStatus = '';
  let searchQuery = '';
  let groupFilter: GroupFilter = 'all';
  let sortMode: SortMode = 'newest';
  let allGroups: TabGroup[] = [];
  let expandedGroupIds: string[] = [];
  let visibleExpandedGroupIds: string[] = [];
  let totalTabs = 0;
  let deviceCount = 0;
  let restoredTabs = 0;
  let savedTabs = 0;

  let email = '';
  let password = '';
  let groupTitle = '';

  let configBusy = false;
  let authBusy = false;
  let refreshBusy = false;
  let saveWindowBusy = false;
  let saveTabBusy = false;
  let actionBusy = false;

  let config: AppConfig = {
    supabaseUrl: '',
    supabaseKey: '',
    ignoreDomains: [],
    ignoreTitles: []
  };

  let ignoreDomainsText = '';
  let ignoreTitlesText = '';

  $: searchedGroups = filterGroups(allGroups, searchQuery);
  $: filteredGroups = searchedGroups
    .filter((group) => matchesGroupFilter(group, groupFilter))
    .sort(sortGroups(sortMode));
  $: visibleExpandedGroupIds = expandedGroupIds.filter((groupId) =>
    filteredGroups.some((group) => group.id === groupId)
  );
  $: ({ totalTabs, restoredTabs, savedTabs, deviceCount } = summarizeGroups(allGroups));

  function setConfigFields(next: AppConfig) {
    config = next;
    ignoreDomainsText = lineListToText(next.ignoreDomains);
    ignoreTitlesText = lineListToText(next.ignoreTitles);
  }

  function matchesGroupFilter(group: TabGroup, filter: GroupFilter) {
    if (filter === 'all') return true;
    return group.tabs.some((tab) => tab.status === filter);
  }

  function summarizeGroups(groups: TabGroup[]) {
    let totalTabs = 0;
    let restoredTabs = 0;
    let savedTabs = 0;
    const devices = new Set<string>();

    for (const group of groups) {
      devices.add(group.device_id);

      for (const tab of group.tabs) {
        totalTabs += 1;
        if (tab.status === 'restored') restoredTabs += 1;
        if (tab.status === 'saved') savedTabs += 1;
      }
    }

    return {
      totalTabs,
      restoredTabs,
      savedTabs,
      deviceCount: devices.size
    };
  }

  function sortGroups(mode: SortMode) {
    return (a: TabGroup, b: TabGroup) => {
      if (mode === 'oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (mode === 'tabCount') {
        return b.tabs.length - a.tabs.length || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };
  }

  async function refreshAll() {
    refreshBusy = true;
    try {
      const nextConfig = await getConfig();
      setConfigFields(nextConfig);

      if (!nextConfig.supabaseUrl || !nextConfig.supabaseKey) {
        authStatus = 'Supabase 設定を入力してください。';
        pageStatus = '設定が未完了です。';
        allGroups = [];
        expandedGroupIds = [];
        return;
      }

      const user = await getCurrentSessionUser();
      authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        allGroups = [];
        expandedGroupIds = [];
        pageStatus = 'ログインすると保存済みグループを表示します。';
        return;
      }

      allGroups = await listGroups(false, user.id);
      expandedGroupIds = [];
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

  function handleToggleGroup(group: TabGroup) {
    if (expandedGroupIds.includes(group.id)) {
      expandedGroupIds = expandedGroupIds.filter((groupId) => groupId !== group.id);
      return;
    }

    expandedGroupIds = [...expandedGroupIds, group.id];
  }

  async function runGroupAction(message: PopupActionMessage, successMessage: string) {
    if (actionBusy) return;
    actionBusy = true;

    try {
      const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>(message);
      if (!result?.ok) {
        throw new Error(result?.error ?? '操作に失敗しました。');
      }

      pageStatus = successMessage;
      await refreshAll();
    } catch (error) {
      pageStatus = `操作失敗: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      actionBusy = false;
    }
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
    await runGroupAction(
      {
        type: 'restore-group',
        groupId: group.id,
        urls: group.tabs.map((tab) => tab.url)
      },
      `「${group.title ?? '(untitled)'}」を復元しました。`
    );
  }

  async function handleDeleteGroup(group: TabGroup) {
    await deleteGroup(group.id);
    await refreshAll();
  }

  async function handleOpenTab(tab: TabGroup['tabs'][number]) {
    await runGroupAction(
      {
        type: 'open-saved-tab',
        tabId: tab.id,
        url: tab.url
      },
      'タブを開きました。'
    );
  }

  async function handleCopyGroup(group: TabGroup) {
    const text = group.tabs.map((tab) => tab.url).join('\n');
    await navigator.clipboard.writeText(text);
    pageStatus = `「${group.title ?? '(untitled)'}」のURLをコピーしました。`;
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
        <p class="metric-label">Saved only</p>
        <p class="metric-value">{savedTabs}</p>
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
        </div>

        <div class="toolbar">
          <label class="field search-field">
            <span class="field-label">検索</span>
            <input bind:value={searchQuery} type="search" placeholder="例: docs, supabase, design" />
          </label>

          <label class="field compact-field">
            <span class="field-label">並び順</span>
            <select bind:value={sortMode}>
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
              <option value="tabCount">タブ数順</option>
            </select>
          </label>
        </div>

        <div class="filter-row">
          <button class:active-chip={groupFilter === 'all'} class="chip" type="button" on:click={() => (groupFilter = 'all')}>
            すべて
          </button>
          <button class:active-chip={groupFilter === 'saved'} class="chip" type="button" on:click={() => (groupFilter = 'saved')}>
            未復元あり
          </button>
          <button class:active-chip={groupFilter === 'restored'} class="chip" type="button" on:click={() => (groupFilter = 'restored')}>
            復元済みあり
          </button>
          <div class="result-meta">{filteredGroups.length} groups</div>
        </div>

        <GroupList
          groups={filteredGroups}
          emptyLabel="まだ保存済みグループはありません。"
          expandedGroupIds={visibleExpandedGroupIds}
          collapsible={true}
          busy={actionBusy}
          onToggleGroup={handleToggleGroup}
          extraActionLabel="URL をコピー"
          onExtraAction={handleCopyGroup}
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
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }

  .section-copy {
    margin: 8px 0 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: end;
  }

  .search-field {
    width: min(100%, 360px);
  }

  .compact-field {
    width: 180px;
  }

  .filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .chip {
    background: rgba(255, 255, 255, 0.04);
    border-color: var(--line);
    color: var(--muted);
    box-shadow: none;
  }

  .active-chip {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
    border-color: transparent;
    color: #03101d;
  }

  .result-meta {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.84rem;
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
