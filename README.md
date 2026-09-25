# Tab Saver

Chrome・FirefoxのタブをSupabaseに保存し、同じアカウントで別の端末から検索・復元する拡張機能です。Android版FirefoxではGitHub Pagesの[タブレット画面](https://nokia215.github.io/tab_ext/tablet.html)を使います。

## 機能

- ウィンドウやタブをグループとして保存
- グループとURLの検索、選択、復元、削除
- 通常グループは復元後に保存一覧から削除し、固定グループは内容を保持
- URLリストのインポートとエクスポート
- Android版Firefox向けのタブレット画面

保存元のタブは閉じません。ブラウザの特殊ページとピン留めタブは保存対象外です。GitHub Pagesの画面は開いているタブを自動取得できないため、URLを貼り付けて保存します。

## セットアップ

SupabaseのURLとpublishable keyはアプリに含まれています。`service_role`やsecret keyは含めません。Supabaseで利用者アカウントを作成し、アプリからメールアドレスとパスワードでログインしてください。

```bash
npm install
npm run build:chrome
```

Chromeには`dist/chrome-mv3/`を`chrome://extensions`から読み込みます。Firefoxは`npm run run:firefox`で起動します。既存データベースを更新する場合は、[増分マイグレーション](supabase/migrations/)を適用してください。

## 開発

```bash
npm run typecheck
npm test
npm run build          # ChromeとFirefox
npm run release        # 両ブラウザとFirefox XPI
npm run build:pages    # タブレットWeb
```

Firefoxの展開用ビルドは`dist/firefox-mv3/`、XPIは`dist/firefox-artifacts/`、Pages用ファイルは`dist/pages/`に出力されます。
