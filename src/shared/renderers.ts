import { formatDate } from './format';
import { escapeHtml, renderDisabled, renderStatusBanner } from './html';
import type { SavedTab, TabGroup } from './types';

export interface SavePanelView {
  title: string;
  status: string;
  windowBusy: boolean;
  tabBusy: boolean;
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
  extraActionLabel?: string;
}

function isExpanded(group: TabGroup, expandedGroupIds: string[], collapsible: boolean) {
  return !collapsible || expandedGroupIds.includes(group.id);
}

function renderGroupTab(tab: SavedTab, busy: boolean): string {
  return `
    <button class="tab-row" type="button" data-action="open-tab" data-tab-id="${escapeHtml(tab.id)}"${renderDisabled(busy)}>
      <span class="tab-row-title">${escapeHtml(tab.title || '(no title)')}</span>
      <span class="tab-row-url">${escapeHtml(tab.url)}</span>
    </button>
  `;
}

export function renderSavePanel(view: SavePanelView): string {
  const busy = view.windowBusy || view.tabBusy;

  return `
    <section class="panel save-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Capture</p>
          <h2 class="section-title">今の作業をスナップショット化</h2>
          <p class="section-copy">ウィンドウ全体か、選択中のタブだけを保存できます。</p>
        </div>
      </div>

      <label class="field">
        <span class="field-label">グループ名</span>
        <input name="groupTitle" type="text" value="${escapeHtml(view.title)}" placeholder="例: 2026-03-11 調査タブ" />
      </label>

      <div class="actions">
        <button type="button" data-action="save-window"${renderDisabled(busy)}>
          現在ウィンドウを保存
        </button>
        <button class="secondary" type="button" data-action="save-tab"${renderDisabled(busy)}>
          現在タブのみ保存
        </button>
      </div>

      ${renderStatusBanner(view.status, view.status.startsWith('保存失敗'))}
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

          const header = view.collapsible
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
                  <h3>${escapeHtml(group.title ?? '(untitled)')}</h3>
                  <p>${escapeHtml(formatDate(group.created_at))} · ${group.tabs.length} tabs · ${escapeHtml(group.device_id)}</p>
                </div>
                <span class="indicator">${expanded ? '−' : '+'}</span>
              </button>
            `
            : `
              <div class="group-trigger static-header">
                <div class="group-text">
                  <h3>${escapeHtml(group.title ?? '(untitled)')}</h3>
                  <p>${escapeHtml(formatDate(group.created_at))} · ${group.tabs.length} tabs · ${escapeHtml(group.device_id)}</p>
                </div>
              </div>
            `;

          return `
            <article class="group-card panel">
              <div class="group-header">
                ${header}

                <div class="actions">
                  ${extraAction}
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
                expanded
                  ? `
                    <div class="tab-list">
                      ${group.tabs.map((tab) => renderGroupTab(tab, view.busy)).join('')}
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
