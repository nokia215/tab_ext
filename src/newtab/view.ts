import { escapeHtml, renderStatusBanner } from '../shared/html';
import { renderAuthPanel, renderConfigPanel, renderGroupList, renderSavePanel } from '../shared/renderers';
import type { TabGroup } from '../shared/types';
import { LIGHTWEIGHT_GROUP_BATCH_SIZE, type GroupFilter, type GroupSummary, type NewtabState } from './model';

interface BaseLayoutArgs {
  state: NewtabState;
  summary: GroupSummary;
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
  filteredGroups: TabGroup[];
  visibleGroups: TabGroup[];
  visibleExpandedGroupIds: string[];
  pageStatusIsError: boolean;
}

function renderFilterButton(activeFilter: GroupFilter, value: GroupFilter, label: string) {
  const activeClass = activeFilter === value ? ' active-chip' : '';
  return `<button class="chip${activeClass}" type="button" data-action="set-group-filter" data-value="${value}">${label}</button>`;
}

function renderMiniMetric(label: string, value: number) {
  return `
    <article class="mini-metric">
      <span class="mini-metric-label">${escapeHtml(label)}</span>
      <strong class="mini-metric-value">${value}</strong>
    </article>
  `;
}

function renderDefaultLayout(args: DefaultLayoutArgs) {
  return `
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
            <p class="metric-value">${args.state.allGroups.length}</p>
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
        </div>

        <div class="actions">
          <div class="badge">${escapeHtml(args.state.authStatus)}</div>
          <button class="ghost" type="button" data-action="refresh-all"${args.state.refreshBusy ? ' disabled' : ''}>
            更新
          </button>
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
            </div>

            <div class="filter-row">
              ${renderFilterButton(args.state.groupFilter, 'all', 'すべて')}
              ${renderFilterButton(args.state.groupFilter, 'saved', '未復元あり')}
              ${renderFilterButton(args.state.groupFilter, 'restored', '復元済みあり')}
              <div class="result-meta">${args.filteredGroups.length} groups</div>
            </div>

            ${renderGroupList({
              groups: args.filteredGroups,
              emptyLabel: 'まだ保存済みグループはありません。',
              expandedGroupIds: args.visibleExpandedGroupIds,
              collapsible: true,
              busy: args.state.actionBusy
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
          ${renderMiniMetric('Groups', args.state.allGroups.length)}
          ${renderMiniMetric('Tabs', args.summary.totalTabs)}
          ${renderMiniMetric('Devices', args.summary.deviceCount)}
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
        </div>

        <div class="filter-row">
          ${renderFilterButton(args.state.groupFilter, 'all', 'すべて')}
          ${renderFilterButton(args.state.groupFilter, 'saved', '未復元あり')}
          ${renderFilterButton(args.state.groupFilter, 'restored', '復元済みあり')}
          <div class="result-meta">${args.visibleGroups.length} / ${args.filteredGroups.length} groups</div>
        </div>

        ${renderGroupList({
          groups: args.visibleGroups,
          emptyLabel: 'まだ保存済みグループはありません。',
          expandedGroupIds: args.visibleExpandedGroupIds,
          collapsible: true,
          busy: args.state.actionBusy
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
