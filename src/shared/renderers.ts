import { describeGroupAge } from './group-age';
import { formatDate } from './format';
import { isArchivedGroup } from './group-helpers';
import { escapeHtml, renderDisabled, renderStatusBanner } from './html';
import type { SavedTab, TabGroup } from './types';

export interface SavePanelView {
  title: string;
  status: string;
  windowBusy: boolean;
  tabBusy: boolean;
  importText: string;
  importBusy: boolean;
}

export interface AuthPanelView {
  email: string;
  password: string;
  status: string;
  busy: boolean;
}

export interface ConfigPanelView {
  supabaseUrl: string;
  supabaseKey: string;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
  busy: boolean;
}

export interface GroupListView {
  groups: TabGroup[];
  emptyLabel: string;
  expandedGroupIds: string[];
  collapsible: boolean;
  busy: boolean;
  selectedGroupIds?: string[];
  favoriteGroupIds?: string[];
  extraActionLabel?: string;
  editableGroupId?: string | null;
  editableGroupTitle?: string;
}

function isExpanded(group: TabGroup, expandedGroupIds: string[], collapsible: boolean) {
  return !collapsible || expandedGroupIds.includes(group.id);
}

function formatHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function renderTabStatus(status: SavedTab['status']): string {
  const labels = {
    saved: '未復元',
    restored: '復元済み'
  } as const;

  return `<span class="tab-status tab-status-${status}">${labels[status]}</span>`;
}

function renderGroupTab(tab: SavedTab, busy: boolean): string {
  return `
    <button class="tab-row" type="button" data-action="open-tab" data-tab-id="${escapeHtml(tab.id)}"${renderDisabled(busy)}>
      <span class="tab-row-main">
        <span class="tab-row-title">${escapeHtml(tab.title || '(no title)')}</span>
        <span class="tab-row-url">${escapeHtml(formatHostname(tab.url))}</span>
      </span>
      <span class="tab-row-meta">
        ${renderTabStatus(tab.status)}
      </span>
    </button>
  `;
}

export function renderSavePanel(view: SavePanelView): string {
  const busy = view.windowBusy || view.tabBusy || view.importBusy;

  return `
    <section class="panel save-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Capture</p>
          <h2 class="section-title">今の作業をスナップショット化</h2>
          <p class="section-copy">ウィンドウ全体、1タブ単位、テキスト貼り付けの3通りで保存できます。</p>
        </div>
      </div>

      <label class="field">
        <span class="field-label">グループ名</span>
        <input name="groupTitle" type="text" value="${escapeHtml(view.title)}" placeholder="未入力なら端末情報つきで自動命名" />
      </label>

      <div class="actions">
        <button type="button" data-action="save-window"${renderDisabled(busy)}>
          現在ウィンドウを保存
        </button>
        <button class="secondary" type="button" data-action="save-tab"${renderDisabled(busy)}>
          現在タブのみ保存
        </button>
      </div>

      <label class="field">
        <span class="field-label">インポート</span>
        <textarea
          name="importText"
          rows="7"
          placeholder="https://example.com | Example&#10;https://another.example.com | Another Tab&#10;&#10;https://group-two.example.com | Group Two"
        >${escapeHtml(view.importText)}</textarea>
      </label>

      <div class="actions">
        <button class="secondary" type="button" data-action="import-tabs"${renderDisabled(busy)}>
          テキストからインポート
        </button>
      </div>

      <p class="section-copy"><code>URL | タブ名</code> を1行ずつ貼り付け、空行でグループを分けられます。</p>

      ${renderStatusBanner(view.status, view.status.includes('失敗'))}
    </section>
  `;
}

export function renderAuthPanel(view: AuthPanelView): string {
  return `
    <section class="panel auth-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Account</p>
          <h2 class="section-title">Supabase 認証</h2>
          <p class="section-copy">設定保存後にログインすると、保存済みグループを端末間で同期できます。</p>
        </div>
        <div class="badge">Sync ready</div>
      </div>

      <div class="field-grid">
        <label class="field">
          <span class="field-label">Email</span>
          <input name="email" type="email" value="${escapeHtml(view.email)}" placeholder="you@example.com" />
        </label>

        <label class="field">
          <span class="field-label">Password</span>
          <input name="password" type="password" value="${escapeHtml(view.password)}" placeholder="password" />
        </label>
      </div>

      <div class="actions">
        <button class="secondary" type="button" data-action="sign-up"${renderDisabled(view.busy)}>
          新規登録
        </button>
        <button type="button" data-action="sign-in"${renderDisabled(view.busy)}>
          ログイン
        </button>
        <button class="ghost" type="button" data-action="sign-out"${renderDisabled(view.busy)}>
          ログアウト
        </button>
      </div>

      ${renderStatusBanner(view.status, view.status.includes('失敗'))}
    </section>
  `;
}

export function renderConfigPanel(view: ConfigPanelView): string {
  return `
    <section class="panel config-panel">
      <div>
        <p class="eyebrow">Control</p>
        <h2 class="section-title">接続設定と除外ルール</h2>
        <p class="section-copy">
          \`service_role\` は使わず、保存対象から除外したいドメインやタイトルを行単位で指定します。
        </p>
      </div>

      <div class="field-grid">
        <label class="field">
          <span class="field-label">Project URL</span>
          <input
            name="supabaseUrl"
            type="url"
            value="${escapeHtml(view.supabaseUrl)}"
            placeholder="https://xxxx.supabase.co"
          />
        </label>

        <label class="field">
          <span class="field-label">Publishable / anon key</span>
          <textarea name="supabaseKey" rows="4" placeholder="eyJ...">${escapeHtml(view.supabaseKey)}</textarea>
        </label>
      </div>

      <div class="field-grid split">
        <label class="field">
          <span class="field-label">Ignore domains</span>
          <textarea
            name="ignoreDomainsText"
            rows="5"
            placeholder="mail.google.com&#10;slack.com&#10;chatgpt.com"
          >${escapeHtml(view.ignoreDomainsText)}</textarea>
        </label>

        <label class="field">
          <span class="field-label">Ignore titles</span>
          <textarea
            name="ignoreTitlesText"
            rows="5"
            placeholder="Inbox&#10;Notifications"
          >${escapeHtml(view.ignoreTitlesText)}</textarea>
        </label>
      </div>

      <div class="actions">
        <button type="button" data-action="save-config"${renderDisabled(view.busy)}>
          設定を保存
        </button>
      </div>
    </section>
  `;
}

export function renderGroupList(view: GroupListView): string {
  if (view.groups.length === 0) {
    return `
      <div class="empty-state panel">
        <p>${escapeHtml(view.emptyLabel)}</p>
      </div>
    `;
  }

  return `
    <div class="group-list">
      ${view.groups
        .map((group) => {
          const expanded = isExpanded(group, view.expandedGroupIds, view.collapsible);
          const selected = Boolean(view.selectedGroupIds?.includes(group.id));
          const favorite = Boolean(view.favoriteGroupIds?.includes(group.id));
          const archived = isArchivedGroup(group);
          const isEditing = Boolean(view.editableGroupId && view.editableGroupId === group.id);
          const editingTitle = isEditing ? (view.editableGroupTitle ?? '') : (group.title ?? '');
          const age = describeGroupAge(group.created_at);
          const previewTabs = group.tabs.slice(0, 6);
          const visibleTabs = expanded ? group.tabs : previewTabs;
          const hiddenTabCount = Math.max(group.tabs.length - previewTabs.length, 0);
          const extraAction = view.extraActionLabel
            ? `
              <button
                class="ghost"
                type="button"
                data-action="copy-group"
                data-group-id="${escapeHtml(group.id)}"
                ${renderDisabled(view.busy)}
              >
                ${escapeHtml(view.extraActionLabel)}
              </button>
            `
            : '';

          const titleBlock = isEditing
            ? `
              <div class="group-title-editor">
                <input
                  name="groupTitleEdit"
                  type="text"
                  value="${escapeHtml(editingTitle)}"
                  data-group-id="${escapeHtml(group.id)}"
                  placeholder="グループ名を入力"
                  ${renderDisabled(view.busy)}
                />
              </div>
            `
            : `
              <div class="group-title-row">
                <h3>${escapeHtml(group.title ?? '(untitled)')}</h3>
                <p>${escapeHtml(formatDate(group.created_at))}</p>
              </div>
            `;

          const header = view.collapsible && !isEditing
            ? `
              <button
                aria-expanded="${expanded ? 'true' : 'false'}"
                class="group-trigger"
                type="button"
                data-action="toggle-group"
                data-group-id="${escapeHtml(group.id)}"
                ${renderDisabled(view.busy)}
              >
                <div class="group-text">
                  ${titleBlock}
                  <div class="group-meta">
                    <span class="meta-pill">${group.tabs.length} tabs</span>
                    <span class="meta-pill meta-pill-${age.tone}">${escapeHtml(age.label)}</span>
                    <span class="meta-pill">${escapeHtml(group.device_id)}</span>
                    ${favorite ? '<span class="meta-pill favorite-pill">お気に入り</span>' : ''}
                    ${archived ? '<span class="meta-pill archived-pill">保管済み</span>' : ''}
                  </div>
                </div>
                <span class="indicator">${expanded ? '−' : '+'}</span>
              </button>
            `
            : `
              <div class="group-trigger static-header">
                <div class="group-text">
                  ${titleBlock}
                  <div class="group-meta">
                    <span class="meta-pill">${group.tabs.length} tabs</span>
                    <span class="meta-pill meta-pill-${age.tone}">${escapeHtml(age.label)}</span>
                    <span class="meta-pill">${escapeHtml(group.device_id)}</span>
                    ${favorite ? '<span class="meta-pill favorite-pill">お気に入り</span>' : ''}
                    ${archived ? '<span class="meta-pill archived-pill">保管済み</span>' : ''}
                  </div>
                </div>
              </div>
            `;

          return `
            <article class="group-card panel${selected ? ' group-card-selected' : ''}${favorite ? ' group-card-favorite' : ''}">
              <div class="group-header">
                <div class="group-header-main">
                  <button
                    class="group-select${selected ? ' selected-group-select' : ''}"
                    type="button"
                    data-action="toggle-group-selection"
                    data-group-id="${escapeHtml(group.id)}"
                    aria-pressed="${selected ? 'true' : 'false'}"
                    aria-label="${selected ? 'グループ選択を解除' : 'グループを選択'}"
                    ${renderDisabled(view.busy)}
                  >
                    ${selected ? '選択中' : '選択'}
                  </button>
                  ${header}
                </div>

                <div class="actions">
                  ${extraAction}
                  <button
                    class="ghost${favorite ? ' favorite-toggle-active' : ''}"
                    type="button"
                    data-action="toggle-favorite-group"
                    data-group-id="${escapeHtml(group.id)}"
                    ${renderDisabled(view.busy)}
                  >
                    ${favorite ? 'お気に入り解除' : 'お気に入り'}
                  </button>
                  ${
                    isEditing
                      ? `
                        <button
                          type="button"
                          data-action="save-group-title"
                          data-group-id="${escapeHtml(group.id)}"
                          ${renderDisabled(view.busy)}
                        >
                          名前を保存
                        </button>
                        <button
                          class="ghost"
                          type="button"
                          data-action="cancel-edit-group-title"
                          data-group-id="${escapeHtml(group.id)}"
                          ${renderDisabled(view.busy)}
                        >
                          キャンセル
                        </button>
                      `
                      : `
                        <button
                          class="ghost"
                          type="button"
                          data-action="edit-group-title"
                          data-group-id="${escapeHtml(group.id)}"
                          ${renderDisabled(view.busy)}
                        >
                          名前編集
                        </button>
                      `
                  }
                  <button
                    class="secondary"
                    type="button"
                    data-action="restore-group"
                    data-group-id="${escapeHtml(group.id)}"
                    ${renderDisabled(view.busy)}
                  >
                    全部復元
                  </button>
                  <button
                    class="ghost"
                    type="button"
                    data-action="${archived ? 'unarchive-group' : 'archive-group'}"
                    data-group-id="${escapeHtml(group.id)}"
                    ${renderDisabled(view.busy)}
                  >
                    ${archived ? '一覧に戻す' : '一覧から外す'}
                  </button>
                  <button
                    class="danger"
                    type="button"
                    data-action="delete-group"
                    data-group-id="${escapeHtml(group.id)}"
                    ${renderDisabled(view.busy)}
                  >
                    グループ削除
                  </button>
                </div>
              </div>

              ${
                visibleTabs.length > 0
                  ? `
                    <div class="tab-list${expanded ? '' : ' tab-list-preview'}">
                      ${visibleTabs.map((tab) => renderGroupTab(tab, view.busy)).join('')}
                      ${
                        !expanded && hiddenTabCount > 0
                          ? `
                            <button
                              class="ghost tab-row-more"
                              type="button"
                              data-action="toggle-group"
                              data-group-id="${escapeHtml(group.id)}"
                              ${renderDisabled(view.busy)}
                            >
                              残り ${hiddenTabCount} 件を表示
                            </button>
                          `
                          : ''
                      }
                    </div>
                  `
                  : ''
              }
            </article>
          `;
        })
        .join('')}
    </div>
  `;
}
