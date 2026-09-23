# Tab Saver

Tab Saver は、ブラウザのタブをローカルに閉じ込めず、Supabase に保存してあとから復元できる Chrome / Firefox 向け拡張です。

保存済みタブを一時的な置き場として扱い、復元したタブは保存一覧から削除します。
繰り返し使うセットは固定グループとして残せます。

## 何がうれしいのか

- 今のウィンドウをそのまま退避して、別の PC や別ブラウザで続きを再開できる
- 保存済みタブを検索、絞り込み、整理しながら扱えるので、リストが肥大化しにくい
- Android 版 Firefox では GitHub Pages 上の軽量ダッシュボードに自動で切り替わる

## この拡張の思想

多くのタブ管理ツールには、次の 2 つの悩みがあります。

1. 保存先がローカル中心で、端末をまたぐと取り出しづらい
2. 保存済みタブが増え続けて、結局あとで見返しにくくなる

Tab Saver は、別のブラウザや端末で使うまでタブを一時保存します。

- 通常グループは、個別に開いたタブも保存一覧から削除する
- 固定グループは、何度復元しても内容を保持する
- グループ単位 / 選択グループ単位で URL リストをコピーし、バックアップや共有に回せる
- 30 日以上経ったグループをまとめて選び、古いキューを掃除しやすい

「あとで見る」が永遠に積み上がるのではなく、必要なときに戻して、使い終わったら自然に消えていくのが基本設計です。

## 主な機能

### 保存

- 現在のウィンドウのタブをまとめて保存
- 現在のタブだけを単体で保存
- 全グループ間で同じ URL を重複保存せず、リクエストパラメーターが異なる URL は別タブとして扱う
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
- お気に入りの優先表示と「お気に入りのみ」「固定のみ」の絞り込み

### 整理する

- 複数グループの一括選択
- 一括復元 / 一括削除
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

## グループの運用

**お気に入り**は見つけやすくする印、**固定**は復元後も内容を保持する設定です。
両方を同じグループに設定できます。

| 設定 | 個別復元 | 全体復元 |
| --- | --- | --- |
| 通常 / お気に入り | 開けたタブを削除 | 開けたタブを削除 |
| 固定 / 固定＋お気に入り | 内容を保持 | 内容を保持 |

- 通常グループは最後のタブを復元すると削除されます。お気に入りも同じ扱いです。
- 固定解除だけでは内容を削除しません。次の復元から通常グループとして扱います。
- 保存するのは URL、タイトル、並び順です。保存元のタブは閉じません。
- URLコピーとエクスポートでは内容を保持します。
- 明示的なグループ削除は確認後に実行します。固定グループも削除できます。
- 操作結果を画面へ先行反映し、失敗した対象だけを戻します。

復元途中で失敗した場合、開けなかったタブは残ります。
タブを開いた後に削除の同期が失敗した場合は、端末に対象IDを記録します。
「削除の同期を再試行」または一覧更新では、タブを開き直さず削除だけを再試行します。
端末への記録は接続先とユーザーごとに分けます。
複数端末での同時復元を一度だけに制限する保証はありません。

タブレットではクリック時に復元先の空タブを確保し、最新の保存内容を確認してから移動します。
ポップアップがブロックされたタブは削除しません。

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

既存プロジェクトへの変更は、[supabase/migrations](supabase/migrations) に差分 SQL として追加します。
マイグレーション用の npm コマンドは、PATH 上の Supabase CLI を使用します。この開発環境ではインストール済みです。
別の環境では Supabase CLI をインストールし、初回にログインと接続先の設定を行ってください。

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

接続先の情報は Git 管理外の `supabase/.temp/` に保存されます。CLI の認証情報は拡張に設定する publishable / anon key とは別です。

```bash
# 差分 SQL ファイルを作成し、そのファイルに変更を記述する
npm run db:migrate:new -- add_example_column

# 適用履歴と適用予定の SQL を確認する（DB は変更しない）
npm run db:migrate:status
npm run db:migrate:check

# 接続済みリモート DB に未適用のマイグレーションを適用する
npm run db:migrate
```

`db:migrate` は CLI の確認プロンプトを表示します。確認を省略する場合は `npm run db:migrate -- --yes` を使います。

お気に入り同期を利用する既存プロジェクトにも、上記のコマンドで[お気に入り同期の migration](supabase/migrations/20260922000000_sync_group_favorites.sql)を適用できます。
更新版を各端末で開くと、その端末に保存されていたお気に入りが同じユーザーのグループへ移行されます。
同じ Supabase プロジェクト・アカウントの端末で、画面の更新時にお気に入りの追加・解除が反映されます。

固定グループと復元後の削除には、[新しいマイグレーション](supabase/migrations/20260923000000_consume_restored_tabs.sql)が必要です。
`npm run db:migrate` を実行してから、各ブラウザの拡張と Pages を更新してください。
旧クライアントは新しい復元ルールに対応していないため、更新完了後に復元操作を再開してください。
既存の復元済みタブとアーカイブ済みグループは自動削除せず、すべて保存中として表示します。
旧カラムは互換性のためDBに残しますが、新クライアントでは使用しません。
既存グループの固定設定はすべてオフで、お気に入り設定は引き継ぎます。

このスキーマでは次を用意しています。

- `tab_groups`
  - 保存されたグループ本体、お気に入り、固定設定
- `tabs`
  - 各タブの URL / title / position
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

- お気に入りと固定設定は同じ Supabase アカウントで共有します
- 接続設定と認証情報、削除同期の再試行記録は、拡張と GitHub Pages 版で個別に保持します

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
  - 保存されたタブグループ、`is_favorite`、`is_fixed`
- `tabs`
  - 各タブの URL / title / position

## 開発用コマンド

`npm test` は設定変換、タブ取得メッセージ、一覧操作、保存、復元途中の失敗、削除同期の再試行を検証します（Node 24）。

```bash
npm test
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
- 端末フィルタをブラウザ種別や OS 単位にも広げる
- 大量データ向けのページングや仮想スクロールを導入する
