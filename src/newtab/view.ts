import { escapeHtml, renderDisabled, renderStatusBanner } from '../shared/html';
import { renderAuthPanel, renderConfigPanel, renderGroupList, renderSavePanel } from '../shared/renderers';
import type { TabGroup } from '../shared/types';
import {
  LIGHTWEIGHT_GROUP_BATCH_SIZE,
  type DateRangeFilter,
  type DeviceFilterOption,
  type GroupFilter,
  type GroupSummary,
  type NewtabState,
  type SelectedGroupSummary
} from './model';

interface BaseLayoutArgs {
  state: NewtabState;
  summary: GroupSummary;
  selectedSummary: SelectedGroupSummary;
  bulkSelectableCount: number;
  staleSelectableCount: number;
  filteredStaleGroupCount: number;
  staleSelectLabel: string;
  favoriteGroupCount: number;
  deviceFilterOptions: DeviceFilterOption[];
  archiveActionLabel: string;
  archiveActionName: string;
  pageStatusIsError: boolean;
}

interface DefaultLayoutArgs extends BaseLayoutArgs {
  filteredGroups: TabGroup[];
  visibleExpandedGroupIds: string[];
}

interface LightweightLayoutArgs extends BaseLayoutArgs {
  filteredGroups: TabGroup[];
  visibleGroups: TabGroup[];
  visibleExpandedGroupIds: string[];
}

export interface NewtabViewArgs {
  state: NewtabState;
  summary: GroupSummary;
  selectedSummary: SelectedGroupSummary;
  bulkSelectableCount: number;
  staleSelectableCount: number;
  filteredStaleGroupCount: number;
  staleSelectLabel: string;
  favoriteGroupCount: number;
  deviceFilterOptions: DeviceFilterOption[];
  archiveActionLabel: string;
  archiveActionName: string;
  filteredGroups: TabGroup[];
  visibleGroups: TabGroup[];
  visibleExpandedGroupIds: string[];
  pageStatusIsError: boolean;
}

function renderChip(args: {
  active: boolean;
  action: string;
  label: string;
  value?: string;
}) {
  const activeClass = args.active ? ' active-chip' : '';
  const valueAttr = args.value ? ` data-value="${escapeHtml(args.value)}"` : '';

  return `
    <button class="chip${activeClass}" type="button" data-action="${escapeHtml(args.action)}"${valueAttr}>
      ${escapeHtml(args.label)}
    </button>
  `;
}

function renderFilterButton(activeFilter: GroupFilter, value: GroupFilter, label: string) {
  return renderChip({
    active: activeFilter === value,
    action: 'set-group-filter',
    label,
    value
  });
}

function renderDateFilterButton(activeFilter: DateRangeFilter, value: DateRangeFilter, label: string) {
  return renderChip({
    active: activeFilter === value,
    action: 'set-date-range-filter',
    label,
    value
  });
}

function renderDeviceFilter(options: DeviceFilterOption[], selectedValue: string) {
  return `
    <label class="field compact-field device-field">
      <span class="field-label">端末</span>
      <select name="deviceFilter">
        <option value="all">すべての端末</option>
        ${options
          .map((option) => `
            <option value="${escapeHtml(option.value)}"${selectedValue === option.value ? ' selected' : ''}>
              ${escapeHtml(option.label)}
            </option>
          `)
          .join('')}
      </select>
    </label>
  `;
}

function renderMiniMetric(label: string, value: number) {
  return `
    <article class="mini-metric">
      <span class="mini-metric-label">${escapeHtml(label)}</span>
      <strong class="mini-metric-value">${value}</strong>
    </article>
  `;
}

function renderBulkActionBar(args: {
  busy: boolean;
  selectedSummary: SelectedGroupSummary;
  bulkSelectableCount: number;
  staleSelectableCount: number;
  staleSelectLabel: string;
  selectLabel: string;
  archiveActionLabel: string;
  archiveActionName: string;
}) {
  const { selectedSummary } = args;
  const hasSelection = selectedSummary.selectedCount > 0;

  return `
    <section class="bulk-toolbar">
      <div class="bulk-toolbar-copy">
        <strong>一括整理</strong>
        <p class="section-copy">
          ${
            hasSelection
              ? `${selectedSummary.selectedCount} groups / ${selectedSummary.selectedTabCount} tabs を選択中`
              : '複数のグループを選んで、まとめて復元・整理できます。'
          }
        </p>
      </div>

      <div class="actions bulk-toolbar-actions">
        <button
          class="ghost"
          type="button"
          data-action="select-visible-groups"
          ${renderDisabled(args.busy || args.bulkSelectableCount === 0)}
        >
          ${escapeHtml(args.selectLabel)}
        </button>
        <button
          class="ghost"
          type="button"
          data-action="select-stale-groups"
          ${renderDisabled(args.busy || args.staleSelectableCount === 0)}
        >
          ${escapeHtml(args.staleSelectLabel)}
        </button>
        <button
          class="ghost"
          type="button"
          data-action="clear-group-selection"
          ${renderDisabled(args.busy || !hasSelection)}
        >
          選択解除
        </button>
        <button
          class="secondary"
          type="button"
          data-action="restore-selected-groups"
          ${renderDisabled(args.busy || selectedSummary.restorableGroupCount === 0)}
        >
          まとめて復元
        </button>
        <button
          class="secondary"
          type="button"
          data-action="copy-selected-groups"
          ${renderDisabled(args.busy || !hasSelection)}
        >
          URLコピー
        </button>
        <button
          class="secondary"
          type="button"
          data-action="${escapeHtml(args.archiveActionName)}"
          ${renderDisabled(args.busy || !hasSelection)}
        >
          ${escapeHtml(args.archiveActionLabel)}
        </button>
        <button
          class="danger"
          type="button"
          data-action="delete-selected-groups"
          ${renderDisabled(args.busy || !hasSelection)}
        >
          まとめて削除
        </button>
      </div>
    </section>
  `;
}

function renderDefaultLayout(args: DefaultLayoutArgs) {
  return `
    <main class="shell page-shell">
      <section class="masthead panel">
        <div class="masthead-layout">
          <div class="headline">
            <p class="hero-kicker">Shared Workspace</p>
            <h1>保存済みタブをすばやく見渡せる一覧ダッシュボード</h1>
            <p class="muted">
              検索、並び替え、復元を最短導線に寄せて、一覧を中心に確認できるレイアウトです。
            </p>
          </div>

          <div class="masthead-side">
            <div class="badge">${escapeHtml(args.state.authStatus)}</div>
            <button class="ghost" type="button" data-action="refresh-all"${args.state.refreshBusy ? ' disabled' : ''}>
              更新
            </button>
          </div>
        </div>

        <div class="metric-grid masthead-metrics">
          <article class="metric-card">
            <p class="metric-label">Saved groups</p>
            <p class="metric-value">${args.summary.groupCount}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Active tabs</p>
            <p class="metric-value">${args.summary.totalTabs}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Restored</p>
            <p class="metric-value">${args.summary.restoredTabs}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Saved only</p>
            <p class="metric-value">${args.summary.savedTabs}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Devices</p>
            <p class="metric-value">${args.summary.deviceCount}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Favorites</p>
            <p class="metric-value">${args.favoriteGroupCount}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">30d+ queue</p>
            <p class="metric-value">${args.summary.staleGroupCount}</p>
          </article>
        </div>
      </section>

      ${renderStatusBanner(args.state.pageStatus, args.pageStatusIsError)}

      <section class="workspace-grid">
        <div class="primary-column">
          <section class="panel explorer-panel">
            <div class="explorer-head">
              <div>
                <h2 class="section-title">保存済みグループ</h2>
                <p class="section-copy">タブ名、URL、グループ名、端末名で横断検索できます。</p>
              </div>
            </div>

            <div class="toolbar">
              <label class="field search-field">
                <span class="field-label">検索</span>
                <input
                  name="searchQuery"
                  type="search"
                  value="${escapeHtml(args.state.searchQuery)}"
                  placeholder="例: docs, github.com, Firefox Android"
                />
              </label>

              <label class="field compact-field">
                <span class="field-label">並び順</span>
                <select name="sortMode">
                  <option value="newest"${args.state.sortMode === 'newest' ? ' selected' : ''}>新しい順</option>
                  <option value="oldest"${args.state.sortMode === 'oldest' ? ' selected' : ''}>古い順</option>
                  <option value="tabCount"${args.state.sortMode === 'tabCount' ? ' selected' : ''}>タブ数順</option>
                </select>
              </label>

              ${renderDeviceFilter(args.deviceFilterOptions, args.state.deviceFilter)}
            </div>

            <div class="filter-row filter-row-secondary">
              ${renderDateFilterButton(args.state.dateRangeFilter, 'all', '全期間')}
              ${renderDateFilterButton(args.state.dateRangeFilter, 'today', '今日')}
              ${renderDateFilterButton(args.state.dateRangeFilter, 'week', '7日以内')}
              ${renderDateFilterButton(args.state.dateRangeFilter, 'month', '30日未満')}
              ${renderDateFilterButton(args.state.dateRangeFilter, 'stale', '30日以上')}
            </div>

            <div class="filter-row">
              ${renderFilterButton(args.state.groupFilter, 'all', 'すべて')}
              ${renderFilterButton(args.state.groupFilter, 'saved', '未復元あり')}
              ${renderFilterButton(args.state.groupFilter, 'restored', '復元済みあり')}
              ${renderFilterButton(args.state.groupFilter, 'archived', '保管済み')}
              ${renderChip({
                active: args.state.favoriteOnly,
                action: 'toggle-favorite-only',
                label: 'お気に入りのみ'
              })}
              <div class="result-meta">
                ${args.filteredGroups.length} groups / 30日以上 ${args.filteredStaleGroupCount} groups
              </div>
            </div>

            ${renderBulkActionBar({
              busy: args.state.actionBusy,
              selectedSummary: args.selectedSummary,
              bulkSelectableCount: args.bulkSelectableCount,
              staleSelectableCount: args.staleSelectableCount,
              staleSelectLabel: args.staleSelectLabel,
              selectLabel: '検索結果を選択',
              archiveActionLabel: args.archiveActionLabel,
              archiveActionName: args.archiveActionName
            })}

            ${renderGroupList({
              groups: args.filteredGroups,
              emptyLabel: 'まだ保存済みグループはありません。',
              expandedGroupIds: args.visibleExpandedGroupIds,
              collapsible: true,
              busy: args.state.actionBusy,
              selectedGroupIds: args.state.selectedGroupIds,
              favoriteGroupIds: args.state.favoriteGroupIds,
              extraActionLabel: 'URLコピー',
              editableGroupId: args.state.editingGroupId,
              editableGroupTitle: args.state.editingGroupTitle
            })}
          </section>
        </div>

        <aside class="side-column">
          ${renderSavePanel({
            title: args.state.groupTitle,
            status: args.state.saveStatus,
            windowBusy: args.state.saveWindowBusy,
            tabBusy: args.state.saveTabBusy,
            importText: args.state.importText,
            importBusy: args.state.importBusy
          })}
          ${renderAuthPanel({
            email: args.state.email,
            password: args.state.password,
            status: args.state.authStatus,
            busy: args.state.authBusy
          })}
          ${renderConfigPanel({
            supabaseUrl: args.state.config.supabaseUrl,
            supabaseKey: args.state.config.supabaseKey,
            ignoreDomainsText: args.state.ignoreDomainsText,
            ignoreTitlesText: args.state.ignoreTitlesText,
            busy: args.state.configBusy
          })}
        </aside>
      </section>
    </main>
  `;
}

function renderLightweightLayout(args: LightweightLayoutArgs) {
  const remainingCount = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0);
  const loadMoreLabel = remainingCount > LIGHTWEIGHT_GROUP_BATCH_SIZE
    ? `さらに ${LIGHTWEIGHT_GROUP_BATCH_SIZE} 件表示`
    : `残り ${remainingCount} 件を表示`;

  return `
    <main class="shell page-shell lightweight-shell">
      <section class="panel lightweight-hero">
        <div class="lightweight-hero-top">
          <div>
            <p class="hero-kicker">Tab Saver Lite</p>
            <h1>軽量ダッシュボード</h1>
            <p class="muted">
              Android 版 Firefox ではスクロールを優先し、描画負荷の低い構成に切り替えています。
            </p>
          </div>

          <div class="actions lightweight-actions">
            <div class="badge accent-badge">Android Firefox 軽量表示</div>
            <div class="badge">${escapeHtml(args.state.authStatus)}</div>
            <button class="ghost" type="button" data-action="refresh-all"${args.state.refreshBusy ? ' disabled' : ''}>
              更新
            </button>
          </div>
        </div>

          <div class="lightweight-summary">
          ${renderMiniMetric('Groups', args.summary.groupCount)}
          ${renderMiniMetric('Tabs', args.summary.totalTabs)}
          ${renderMiniMetric('Devices', args.summary.deviceCount)}
          ${renderMiniMetric('Favorites', args.favoriteGroupCount)}
          ${renderMiniMetric('30d+', args.summary.staleGroupCount)}
        </div>
      </section>

      ${renderStatusBanner(args.state.pageStatus, args.pageStatusIsError)}

      <section class="panel lightweight-explorer">
        <div class="explorer-head">
          <div>
            <h2 class="section-title">保存済みグループ</h2>
            <p class="section-copy">検索対象はタブ名、URL、グループ名、端末名です。</p>
          </div>
        </div>

        <div class="toolbar compact-toolbar">
          <label class="field search-field">
            <span class="field-label">検索</span>
            <input
              name="searchQuery"
              type="search"
              value="${escapeHtml(args.state.searchQuery)}"
              placeholder="例: docs, github.com, Firefox Android"
            />
          </label>

          <label class="field compact-field">
            <span class="field-label">並び順</span>
            <select name="sortMode">
              <option value="newest"${args.state.sortMode === 'newest' ? ' selected' : ''}>新しい順</option>
              <option value="oldest"${args.state.sortMode === 'oldest' ? ' selected' : ''}>古い順</option>
              <option value="tabCount"${args.state.sortMode === 'tabCount' ? ' selected' : ''}>タブ数順</option>
            </select>
          </label>

          ${renderDeviceFilter(args.deviceFilterOptions, args.state.deviceFilter)}
        </div>

        <div class="filter-row filter-row-secondary">
          ${renderDateFilterButton(args.state.dateRangeFilter, 'all', '全期間')}
          ${renderDateFilterButton(args.state.dateRangeFilter, 'today', '今日')}
          ${renderDateFilterButton(args.state.dateRangeFilter, 'week', '7日以内')}
          ${renderDateFilterButton(args.state.dateRangeFilter, 'month', '30日未満')}
          ${renderDateFilterButton(args.state.dateRangeFilter, 'stale', '30日以上')}
        </div>

        <div class="filter-row">
          ${renderFilterButton(args.state.groupFilter, 'all', 'すべて')}
          ${renderFilterButton(args.state.groupFilter, 'saved', '未復元あり')}
          ${renderFilterButton(args.state.groupFilter, 'restored', '復元済みあり')}
          ${renderFilterButton(args.state.groupFilter, 'archived', '保管済み')}
          ${renderChip({
            active: args.state.favoriteOnly,
            action: 'toggle-favorite-only',
            label: 'お気に入りのみ'
          })}
          <div class="result-meta">
            ${args.visibleGroups.length} / ${args.filteredGroups.length} groups / 30日以上 ${args.filteredStaleGroupCount}
          </div>
        </div>

        ${renderBulkActionBar({
          busy: args.state.actionBusy,
          selectedSummary: args.selectedSummary,
          bulkSelectableCount: args.bulkSelectableCount,
          staleSelectableCount: args.staleSelectableCount,
          staleSelectLabel: args.staleSelectLabel,
          selectLabel: '表示中を選択',
          archiveActionLabel: args.archiveActionLabel,
          archiveActionName: args.archiveActionName
        })}

        ${renderGroupList({
          groups: args.visibleGroups,
          emptyLabel: 'まだ保存済みグループはありません。',
          expandedGroupIds: args.visibleExpandedGroupIds,
          collapsible: true,
          busy: args.state.actionBusy,
          selectedGroupIds: args.state.selectedGroupIds,
          favoriteGroupIds: args.state.favoriteGroupIds,
          extraActionLabel: 'URLコピー',
          editableGroupId: args.state.editingGroupId,
          editableGroupTitle: args.state.editingGroupTitle
        })}

        ${
          remainingCount > 0
            ? `
              <div class="load-more-row">
                <button class="secondary" type="button" data-action="show-more-groups">
                  ${loadMoreLabel}
                </button>
                <p class="result-meta">${remainingCount} groups remaining</p>
              </div>
            `
            : ''
        }
      </section>

      <section class="lightweight-panel-stack">
        <section class="panel lightweight-utility-panel">
          <div>
            <h2 class="section-title">管理パネル</h2>
            <p class="section-copy">保存や設定は必要なときだけ展開し、スクロール負荷を抑えます。</p>
          </div>

          <div class="actions">
            <button
              class="${args.state.savePanelOpen ? '' : 'secondary'}"
              type="button"
              data-action="toggle-save-panel"
            >
              ${args.state.savePanelOpen ? '保存パネルを閉じる' : '保存パネルを開く'}
            </button>
            <button
              class="${args.state.settingsPanelOpen ? '' : 'ghost'}"
              type="button"
              data-action="toggle-settings-panel"
            >
              ${args.state.settingsPanelOpen ? '設定と認証を閉じる' : '設定と認証を開く'}
            </button>
          </div>
        </section>

        ${
          args.state.savePanelOpen
            ? renderSavePanel({
                title: args.state.groupTitle,
                status: args.state.saveStatus,
                windowBusy: args.state.saveWindowBusy,
                tabBusy: args.state.saveTabBusy,
                importText: args.state.importText,
                importBusy: args.state.importBusy
              })
            : ''
        }

        ${
          args.state.settingsPanelOpen
            ? `
              <section class="lightweight-settings-grid">
                ${renderAuthPanel({
                  email: args.state.email,
                  password: args.state.password,
                  status: args.state.authStatus,
                  busy: args.state.authBusy
                })}
                ${renderConfigPanel({
                  supabaseUrl: args.state.config.supabaseUrl,
                  supabaseKey: args.state.config.supabaseKey,
                  ignoreDomainsText: args.state.ignoreDomainsText,
                  ignoreTitlesText: args.state.ignoreTitlesText,
                  busy: args.state.configBusy
                })}
              </section>
            `
            : ''
        }
      </section>
    </main>
  `;
}

export function renderNewtabView(args: NewtabViewArgs) {
  return args.state.uiMode === 'lightweight'
    ? renderLightweightLayout(args)
    : renderDefaultLayout(args);
}
