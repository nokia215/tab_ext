import { renderConfigPanel, renderSavePanel, renderAuthPanel } from '../shared/renderers';
import type { GroupCollectionSummary } from '../shared/group-summary';
import { escapeHtml, renderDisabled } from '../shared/html';
import type { PopupState } from './model';

interface PopupViewArgs {
  state: PopupState;
  summary: GroupCollectionSummary;
  setupComplete: boolean;
  signedIn: boolean;
}

function renderHealthCard(label: string, value: string, tone: 'good' | 'neutral') {
  return `
    <article class="insight-card">
      <p class="insight-label">${escapeHtml(label)}</p>
      <p class="insight-value${tone === 'good' ? ' success-text' : ''}">${escapeHtml(value)}</p>
    </article>
  `;
}

function renderNextStep(args: PopupViewArgs) {
  if (!args.setupComplete) {
    return 'まずは接続設定を保存すると、保存済みグループの同期が有効になります。';
  }

  if (!args.signedIn) {
    return '設定ができているので、次はログインして同期を開始できます。';
  }

  if (args.summary.groupCount === 0) {
    return '準備完了です。現在のウィンドウを保存して、最初のグループを作成しましょう。';
  }

  return 'いまの状態なら、保存とダッシュボード確認をこのポップアップから素早く回せます。';
}

export function renderPopupView(args: PopupViewArgs): string {
  return `
    <main class="shell popup-shell">
      <section class="hero panel">
        <div class="hero-layout">
          <div class="hero-copy">
            <p class="hero-kicker">Tab Saver</p>
            <h1>いまの作業を迷わず退避して、別環境へ引き継ぐ</h1>
            <p class="muted">${renderNextStep(args)}</p>
          </div>

          <div class="hero-status">
            <div class="badge">${escapeHtml(args.state.authStatus)}</div>
            <div class="actions">
              <button class="secondary" type="button" data-action="open-dashboard">ダッシュボードを開く</button>
              <button class="ghost" type="button" data-action="refresh"${renderDisabled(args.state.refreshBusy)}>
                更新
              </button>
            </div>
          </div>
        </div>

        <div class="metric-grid hero-metrics">
          <article class="metric-card">
            <p class="metric-label">Saved groups</p>
            <p class="metric-value">${args.summary.groupCount}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Tabs</p>
            <p class="metric-value">${args.summary.totalTabs}</p>
          </article>
          <article class="metric-card">
            <p class="metric-label">Needs restore</p>
            <p class="metric-value">${args.summary.restorableGroupCount}</p>
          </article>
        </div>
      </section>

      <section class="popup-overview">
        ${renderHealthCard('接続設定', args.setupComplete ? '完了' : '未設定', args.setupComplete ? 'good' : 'neutral')}
        ${renderHealthCard('ログイン状態', args.signedIn ? 'ログイン済み' : '未ログイン', args.signedIn ? 'good' : 'neutral')}
        ${renderHealthCard('同期元デバイス', `${args.summary.deviceCount} 台`, 'neutral')}
      </section>

      ${renderSavePanel({
        title: args.state.groupTitle,
        status: args.state.saveStatus,
        windowBusy: args.state.saveWindowBusy,
        tabBusy: args.state.saveTabBusy,
        importText: args.state.importText,
        importBusy: args.state.importBusy
      })}

      <details class="settings-wrap"${args.state.settingsOpen ? ' open' : ''}>
        <summary>設定と認証を確認する</summary>
        <p class="settings-copy muted">
          接続設定を保存してからログインすると、ダッシュボードで保存済みグループを一覧できます。
        </p>
        <div class="settings-grid">
          ${renderConfigPanel({
            supabaseUrl: args.state.config.supabaseUrl,
            supabaseKey: args.state.config.supabaseKey,
            ignoreDomainsText: args.state.ignoreDomainsText,
            ignoreTitlesText: args.state.ignoreTitlesText,
            busy: args.state.configBusy
          })}
          ${renderAuthPanel({
            email: args.state.email,
            password: args.state.password,
            status: args.state.authStatus,
            busy: args.state.authBusy
          })}
        </div>
      </details>
    </main>
  `;
}
