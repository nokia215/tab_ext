# Tab Saver

Chrome / Firefox 向けのタブ保存・復元拡張です。タブを Supabase に保存し、同じアカウントを使う別の端末やブラウザから再開できます。

## 主な機能

- ウィンドウまたはタブをグループとして保存
- グループや URL を検索し、選択して復元・削除
- 通常グループは復元したタブを保存一覧から削除し、固定グループは内容を保持
- URL リストの貼り付けによるインポートとコピーによるエクスポート
- Android 版 Firefox 向け [タブレット画面](https://nokia215.github.io/tab_ext/tablet.html)

保存元のタブは閉じません。ブラウザ内の特殊ページやピン留めタブは保存対象外です。

### タブレット画面の制限

GitHub Pages 上で動作するタブレット画面は、ブラウザで開いているタブを自動取得できません。URL リストを貼り付けて保存してください。現在のウィンドウやタブを直接保存するには、拡張機能を使います。

## セットアップ

1. Supabase プロジェクトを作成し、[初期スキーマ](sql/schema.sql)を適用します。
2. `npm install` を実行します。
3. `npm run build:chrome` または `npm run build:firefox` を実行します。
4. Chrome は `dist/chrome/` を `chrome://extensions` から読み込みます。Firefox は `npm run run:firefox` で起動できます。
5. 拡張の設定画面で Supabase Project URL と publishable / anon key を入力し、アカウントを作成またはログインします。

`service_role` キーは使用しません。既存の Supabase データベースを更新する場合は、[マイグレーション](supabase/migrations/)を適用してください。

## 開発

```bash
npm run typecheck
npm test
npm run build          # Chrome と Firefox の展開用ディレクトリを生成
npm run release        # 上記に加えて Firefox 用 XPI を生成
npm run build:pages    # タブレット画面
```

`npm run build` は ZIP / XPI を作りません。Firefox 用の配布パッケージは `npm run release` で生成され、`dist/firefox-artifacts/` に出力されます。Chrome は `dist/chrome/` をそのまま読み込みます。

GitHub Pages のビルド成果物は `dist/pages/` に出力されます。
