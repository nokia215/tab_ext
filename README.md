# Tab Saver

Tab Saver は、ブラウザのタブをローカルに閉じ込めず、Supabase に保存してあとから復元できる Chrome / Firefox 向け拡張です。

単なる「タブを溜め込む箱」ではなく、保存済みタブを **一時的なキュー** として扱い、必要なものを復元したら自然に片づいていく体験を目指しています。

## 何がうれしいのか

- 今のウィンドウをそのまま退避して、別の PC や別ブラウザで続きを再開できる
- 保存済みタブを検索、絞り込み、整理しながら扱えるので、リストが肥大化しにくい
- Android 版 Firefox では GitHub Pages 上の軽量ダッシュボードに自動で切り替わる

## この拡張の思想

多くのタブ管理ツールには、次の 2 つの悩みがあります。

1. 保存先がローカル中心で、端末をまたぐと取り出しづらい
2. 保存済みタブが増え続けて、結局あとで見返しにくくなる

Tab Saver はこの問題に対して、保存済みタブを **長期保管庫** ではなく **一時キュー** として扱います。

- 個別に開いた保存済みタブは復元済みとして記録され、未復元キューと履歴を分けて扱える
- グループ単位の復元や保管、削除を一覧からすばやく実行できる
- グループ単位 / 選択グループ単位で URL リストをコピーし、バックアップや共有に回せる
- 30 日以上経ったグループをまとめて選び、古いキューを掃除しやすい

「あとで見る」が永遠に積み上がるのではなく、必要なときに戻して、使い終わったら自然に消えていくのが基本設計です。

## 主な機能

### 保存

- 現在のウィンドウのタブをまとめて保存
- 現在のタブだけを単体で保存
- テキスト貼り付けによる URL リストのインポート
- 保存後のグループ名編集

### 探す

- グループ名 / タブ名 / URL / 端末名の横断検索
- 日付クイックフィルタ
  - 今日
  - 7日以内
  - 30日未満
  - 30日以上
- 端末フィルタで、特定デバイスの保存だけを素早く絞り込み
- 折りたたみ時も先頭タブをプレビュー表示する高密度一覧
- お気に入り固定と「お気に入りのみ」表示

### 整理する

- 複数グループの一括選択
- 一括復元 / 一括保管 / 一括削除
- グループ単位 / 選択グループ単位の URL リストコピー
- 30日以上経過したグループを一括選択して、そのまま整理
- 各グループに経過日数を表示し、古い保存を見つけやすくする

### 同期する

- Supabase によるデバイス間同期
- Chrome / Firefox の両対応
- Android 版 Firefox では GitHub Pages 上のタブレット向け軽量ダッシュボードへ自動切り替え

## 保存時のルール

- `about:` / `chrome://` / `edge://` / `moz-extension://` などの内部 URL は保存対象外
- ピン留めタブは保存対象外
- 除外ドメイン / 除外タイトルを設定できる
- URL は正規化され、重複や追跡パラメータをある程度落として保存される

## 状態管理

Tab Saver は、グループの保管状態とタブの復元状態を分けて管理します。

- グループの保管状態は `tab_groups.archived_at` で管理
- タブの復元状態は `tabs.status` の `saved` / `restored` と `tabs.restored_at` で管理
- グループ復元では未復元のタブだけを開いて `restored` に更新
- 復元済みタブも個別に開くことができ、一覧では未復元タブの下に表示されます
- 保管済みグループは通常一覧から外れ、`保管済み` フィルタで確認・復帰できます

## インポート / エクスポート形式

テキストインポートと URL コピーは同じ形式を使います。

```text
https://example.com | Example
https://another.example.com | Another Tab

https://group-two.example.com | Group Two
```

- 1 行につき `URL | タブ名`
- タブ名は省略可能
- 空行でグループを分割
- ダッシュボードでは各グループの `URLコピー`、または複数選択後の `URLコピー` からクリップボードへ出力できます

## 使いどころ

- 作業中のタブ群をいったん退避して、PC をまたいで再開したい
- 調査用に大量のタブを開いたが、あとで少しずつ見返したい
- Android タブレット上で、保存済みリンクを軽い UI で確認したい
- 「とりあえず保存」が増えがちなので、古いものから整理したい

## セットアップ

### 1. Supabase プロジェクトを用意する

Supabase で新しいプロジェクトを作成し、[sql/schema.sql](sql/schema.sql) を実行してください。

既存プロジェクトへの変更は、[supabase/migrations](supabase/migrations) に差分 SQL として追加します。Supabase CLI を使う場合は、次のように migration を作ってから差分を記述します。

```bash
supabase migration new split_group_archive_tab_restore
```

このスキーマでは次を用意しています。

- `tab_groups`
  - 保存されたグループ本体、保管状態
- `tabs`
  - 各タブの URL / title / position / 復元状態
- Row Level Security
  - ログインユーザー本人のデータだけを読み書き可能

拡張側で必要なのは次の 2 つです。

- Project URL
- Publishable / anon key

`service_role` は使いません。

### 2. 依存関係をインストールする

```bash
npm install
```

### 3. 拡張をビルドする

Chrome:

```bash
npm run build:chrome
```

Firefox:

```bash
npm run build:firefox
```

### 4. ブラウザに読み込む

Chrome:

1. `chrome://extensions` を開く
2. デベロッパーモードを有効にする
3. `dist/chrome` を「パッケージ化されていない拡張機能を読み込む」から追加する

Firefox:

- 開発中は `npm run run:firefox` でも確認できます

### 5. 拡張内で接続設定を保存する

Popup またはダッシュボードの設定画面で、次を入力します。

- Supabase Project URL
- Supabase Publishable / anon key
- 必要に応じて除外ドメイン / 除外タイトル

その後、メールアドレスとパスワードで新規登録またはログインすると同期を使い始められます。

## 画面構成

### Popup UI

- 現在ウィンドウ / 現在タブの保存
- ダッシュボードを開く導線
- 接続設定と認証の確認

### New Tab ダッシュボード

- 保存済みグループの一覧、検索、復元、整理の中心画面
- お気に入りや古い保存の管理に向いた高密度 UI

### Tablet ダッシュボード

- Android 版 Firefox 向けの軽量 UI
- 表示負荷を抑えつつ、検索・復元・整理に必要な機能を残した構成

## GitHub Pages 版タブレット UI

Android 版 Firefox では、拡張内の `newtab.html` ではなく GitHub Pages 上の `tablet.html` を使います。

- ルート URL: [https://nokia215.github.io/tab_ext/](https://nokia215.github.io/tab_ext/)
- 直接 URL: [https://nokia215.github.io/tab_ext/tablet.html](https://nokia215.github.io/tab_ext/tablet.html)

このダッシュボードは `index.html` と `tablet.html` の 2 エントリで配信され、ルートへアクセスすると `tablet.html` へリダイレクトします。

ビルド:

```bash
npm run build:pages
```

出力先は `dist/pages/` です。`main` への push 時は `.github/workflows/deploy-pages.yml` から GitHub Pages にデプロイされます。

注意点:

- お気に入り固定はローカル保存です
- 拡張内ダッシュボードと GitHub Pages 版ダッシュボードでは保存先が別のため、それぞれ独立して保持されます

初回のみ、GitHub のリポジトリ設定で Pages を有効にしてください。

1. `Settings`
2. `Pages`
3. `Build and deployment` の `Source` を `GitHub Actions` にする

これが未設定だと `actions/deploy-pages` は `404 Not Found` で失敗します。

### GitHub Actions メモ

- Pages workflow は Node 24 前提で実行するため `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` を設定しています
- `checkout` / `setup-node` / `configure-pages` は Node 24 対応版を使っています
- `deploy-pages` 側は GitHub 提供 action の更新状況により一時的に非推奨警告が残る場合があります

## 技術構成

### フロントエンド

- TypeScript
- Vite
- Chrome / Firefox Extension

### ストレージ

- Supabase
- Row Level Security
- クラウド同期

### データモデル

- `tab_groups`
  - 保存されたタブグループ、`archived_at`
- `tabs`
  - 各タブの URL / title / position / `status` / `restored_at`

## 開発用コマンド

```bash
npm run typecheck
npm run build:chrome
npm run build:firefox
npm run build:pages
npm run run:firefox
```

## プロジェクト構造

```text
docs/             # 設計メモ・ガイドライン
sql/              # Supabase schema
src/
  background/     # background script
  newtab/         # 新しいタブページ
  popup/          # popup UI
  shared/         # 共通ロジック
  tablet/         # GitHub Pages / tablet UI

manifests/        # browser manifest
scripts/          # build scripts
```

## 関連ドキュメント

- UI ガイドライン: [docs/ui-guidelines.md](docs/ui-guidelines.md)

## 今後のアイデア

- タグやメモを付けて、あとで見返す文脈も残せるようにする
- 自動アーカイブや保存期限ルールで、古いグループを自然に掃除する
- 端末フィルタをブラウザ種別や OS 単位にも広げる
- 大量データ向けのページングや仮想スクロールを導入する
