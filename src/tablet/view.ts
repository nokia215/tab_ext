import { escapeHtml, renderDisabled, renderStatusBanner } from '../shared/html';
import { renderAuthPanel, renderConfigPanel, renderGroupList } from '../shared/renderers';
import type { TabGroup } from '../shared/types';
import type {
  DateRangeFilter,
  DeviceFilterOption,
  GroupFilter,
  NewtabState,
  SelectedGroupSummary,
  SortMode
} from '../newtab/model';

export interface TabletViewArgs {
  state: NewtabState;
  summary: {
    groupCount: number;
    totalTabs: number;
    restoredTabs: number;
    savedTabs: number;
    deviceCount: number;
    staleGroupCount: number;
  };
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

function renderSortOption(current: SortMode, value: SortMode, label: string) {
  return `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;
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

function renderImportPanel(state: NewtabState) {
  return `
    <section class="panel lightweight-utility-panel tablet-import-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Capture</p>
          <h2 class="section-title">Web ダッシュボード経由で追加</h2>
          <p class="section-copy">
            タブレット版は GitHub Pages で動作します。現在開いているタブの自動取得は行わず、URL リストの貼り付けで保存します。
          </p>
        </div>
        <div class="badge">GitHub Pages</div>
      </div>

      <label class="field">
        <span class="field-label">グループ名</span>
        <input name="groupTitle" type="text" value="${escapeHtml(state.groupTitle)}" placeholder="未入力なら自動命名" />
      </label>

      <label class="field">
        <span class="field-label">インポート</span>
        <textarea
          name="importText"
          rows="7"
          placeholder="https://example.com | Example&#10;https://another.example.com | Another Tab&#10;&#10;https://group-two.example.com | Group Two"
        >${escapeHtml(state.importText)}</textarea>
      </label>

      <div class="actions">
        <button class="secondary" type="button" data-action="import-tabs"${state.importBusy ? ' disabled' : ''}>
          テキストから保存
        </button>
      </div>

      <p class="section-copy"><code>URL | タブ名</code> を1行ずつ貼り付け、空行でグループを分けられます。</p>
      ${renderStatusBanner(state.saveStatus, state.saveStatus.includes('失敗'))}
    </section>
  `;
}

function renderBulkActionBar(args: {
  busy: boolean;
  selectedSummary: SelectedGroupSummary;
  bulkSelectableCount: number;
  staleSelectableCount: number;
  staleSelectLabel: string;
  archiveActionLabel: string;
  archiveActionName: string;
}) {
  const hasSelection = args.selectedSummary.selectedCount > 0;

  return `
    <section class="bulk-toolbar">
      <div class="bulk-toolbar-copy">
        <strong>一括整理</strong>
        <p class="section-copy">
          ${
            hasSelection
              ? `${args.selectedSummary.selectedCount} groups / ${args.selectedSummary.selectedTabCount} tabs を選択中`
              : '表示中のグループをまとめて復元・整理できます。'
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
          表示中を選択
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
          ${renderDisabled(args.busy || args.selectedSummary.restorableGroupCount === 0)}
        >
          まとめて復元
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

export function renderTabletView(args: TabletViewArgs) {
  const remainingCount = Math.max(args.filteredGroups.length - args.visibleGroups.length, 0);

  return `
    <main class="shell page-shell lightweight-shell tablet-shell">
      <section class="panel lightweight-hero tablet-hero">
        <div class="lightweight-hero-top">
          <div>
            <p class="hero-kicker">Tab Saver Tablet</p>
            <h1>タブレット用ダッシュボード</h1>
            <p class="muted">
              GitHub Pages 上で保存済みタブを一覧・検索・復元できる軽量UIです。
            </p>
          </div>

          <div class="actions lightweight-actions">
            <div class="badge accent-badge">${escapeHtml(args.state.authStatus)}</div>
            <button class="ghost" type="button" data-action="refresh-all"${args.state.refreshBusy ? ' disabled' : ''}>
              更新
            </button>
          </div>
        </div>

        <div class="lightweight-summary">
          <article class="mini-metric">
            <span class="mini-metric-label">Groups</span>
            <strong class="mini-metric-value">${args.summary.groupCount}</strong>
          </article>
          <article class="mini-metric">
            <span class="mini-metric-label">Tabs</span>
            <strong class="mini-metric-value">${args.summary.totalTabs}</strong>
          </article>
          <article class="mini-metric">
            <span class="mini-metric-label">Devices</span>
            <strong class="mini-metric-value">${args.summary.deviceCount}</strong>
          </article>
          <article class="mini-metric">
            <span class="mini-metric-label">Favorites</span>
            <strong class="mini-metric-value">${args.favoriteGroupCount}</strong>
          </article>
          <article class="mini-metric">
            <span class="mini-metric-label">30d+</span>
            <strong class="mini-metric-value">${args.summary.staleGroupCount}</strong>
          </article>
        </div>
      </section>

      ${renderStatusBanner(args.state.pageStatus, args.pageStatusIsError)}

      <section class="panel lightweight-explorer tablet-explorer">
        <div class="explorer-head">
          <div>
            <h2 class="section-title">保存済みグループ</h2>
            <p class="section-copy">タブ名、URL、グループ名、端末名で横断検索できます。</p>
          </div>
        </div>

        <div class="toolbar compact-toolbar">
          <label class="field search-field">
            <span class="field-label">検索</span>
            <input
              name="searchQuery"
              type="search"
              value="${escapeHtml(args.state.searchQuery)}"
              placeholder="例: docs, github.com, tablet"
            />
          </label>

          <label class="field compact-field">
            <span class="field-label">並び順</span>
            <select name="sortMode">
              ${renderSortOption(args.state.sortMode, 'newest', '新しい順')}
              ${renderSortOption(args.state.sortMode, 'oldest', '古い順')}
              ${renderSortOption(args.state.sortMode, 'tabCount', 'タブ数順')}
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
          editableGroupId: args.state.editingGroupId,
          editableGroupTitle: args.state.editingGroupTitle
        })}

        ${
          remainingCount > 0
            ? `
              <div class="load-more-row">
                <button class="secondary" type="button" data-action="show-more-groups">
                  さらに表示
                </button>
                <p class="result-meta">${remainingCount} groups remaining</p>
              </div>
            `
            : ''
        }
      </section>

      <section class="lightweight-panel-stack">
        ${renderImportPanel(args.state)}
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
    </main>
  `;
}
