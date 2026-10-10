# Computer-useでのUI確認

Computer-useで確認する画面は、ローカルHTTPサーバーから開く。
この作業環境では拡張機能タブへのアクセスを前提にできないため、`chrome-extension://`、`moz-extension://`、ブラウザーの新規タブ画面には自動操作で移動しない。
アクセスエラーが出ても繰り返さず、以下のWeb版またはプレビューに切り替える。

## Web版を確認する

リポジトリのルートで、既存のViteを起動する。

```sh
npx --no-install vite --host 127.0.0.1 --port 5173 --strictPort
```

起動ログを確認してから、Computer-useで `http://127.0.0.1:5173/dashboard.html` を新しいタブに開く。
`dashboard.html` はタブレット用Web画面で、拡張機能のデスクトップ画面とは異なる。
ポートが使用中なら別のポートを指定し、ログに出たURLを使う。
サーバーの起動がサンドボックスで拒否された場合は、実行ツールの承認手順に従う。

Web版の認証情報は拡張機能とは別に保存されるため、未ログイン表示はアクセス失敗を意味しない。
見た目だけの確認には、次の架空データを使うプレビューを利用できる。

## 拡張機能のレイアウトを確認する

実際のSvelteコンポーネントに架空の状態を渡す、一時的なプレビューを作る。
HTMLやCSSを手で模写すると変更内容を検証できないため、対象コンポーネントと既存CSSを直接読み込む。
ビルド済み拡張機能のHTMLをHTTPで配信する方法は、ブラウザー拡張APIへの依存が残るため使わない。

ルートに `ui-preview.local.html` を作成する。

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tab Saver UI preview</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/ui-preview.local.ts"></script>
  </body>
</html>
```

同じ場所に `ui-preview.local.ts` を作成する。

```ts
import { mount } from 'svelte';
import Dashboard from './src/newtab/Dashboard.svelte';
import { dashboards } from './src/shared/dashboard-state.svelte';
import { createInitialState } from './src/shared/dashboard-model';
import './src/shared/ui.css';
import './src/shared/panels.css';
import './src/newtab/newtab.css';

const state = createInitialState({ isAndroidFirefox: false, uiMode: 'default' });
state.authStatus = 'ログイン中: preview@example.com';
state.syncStatus = '最終同期: 12:34:56';
state.allGroups = Array.from({ length: 84 }, (_, i) => ({
  id: `preview-group-${i}`, title: `資料 ${i + 1}`, device_id: 'Preview PC',
  created_at: new Date().toISOString(), is_fixed: i < 12,
  tabs: [{ id: `preview-tab-${i}`, title: '確認用のタブ', url: 'https://example.com/', position: 0 }]
}));
state.groupFilter = 'fixed';
dashboards.desktop = state;
mount(Dashboard, { target: document.getElementById('app')! });
```

同じViteサーバーで `http://127.0.0.1:5173/ui-preview.local.html` を開く。
通常表示は `groupFilter = 'all'`、軽量表示は初期状態の `isAndroidFirefox: true, uiMode: 'lightweight'` に切り替える。
タブレットのプレビューには `TabletDashboard.svelte` と `dashboards.tablet` を使い、`src/tablet/tablet.css` も読み込む。

このプレビューは表示確認用で、`main.ts`を読み込まないため保存、更新、フィルタのクリック処理は動かない。
表示状態はプレビューコードで変更し、操作の検証にはWeb版や既存の `tests/dashboard-ui.ts` などを使う。

## 確認結果を記録する

デスクトップ幅と狭い幅で、件数、長いタイトル、空の検索結果、操作アイコンの配置を確認する。
狭い幅はブラウザーのレスポンシブ表示か指定幅のiframeで再現し、メディアクエリも適用させる。
外側のウィンドウが広いまま `.page-shell` の幅だけを縮めても、狭い画面向けのメディアクエリは検証できない。

Web版、架空データのプレビュー、拡張機能本体のどこで確認したかを報告する。
拡張機能のタブ取得、バックグラウンド通信、復元後の削除は、Web版や表示プレビューの確認だけでは検証済みにしない。
作業後は、自分が作成した一時プレビューの2ファイルを削除し、自分が起動したサーバーを停止する。
