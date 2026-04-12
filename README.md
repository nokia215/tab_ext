# Tab Saver

ブラウザのタブグループを Supabase に保存し、あとから復元できるブラウザ拡張です。

シンプルで高速、そして 複数デバイス間で同期できます。

一般的なタブ管理拡張と違い、保存されたタブはローカルではなく クラウドデータベースに保存されるため、別のPCやブラウザからでもアクセスできます。

## 特徴

- 現在のウィンドウのタブを保存
- 現在のタブのみ保存
- 保存されたタブグループの一覧表示
- 保存後のグループ名編集
- ダッシュボード検索はグループ名 / タブ名 / URL / 端末名に対応
- ダッシュボードでお気に入り固定し、常に先頭表示 + お気に入りのみ絞り込み
- 折りたたみ時も先頭タブをプレビュー表示する高密度一覧
- Android 版 Firefox では GitHub Pages 上のタブレット向け軽量ダッシュボードへ自動で切り替え
- タブの復元
- 保存済みタブを開くと 自動でリストから削除
- Supabase による デバイス間同期
- Popup UI + New Tab ダッシュボード

## 今後追加すると良い機能

- タグやメモを付けて、あとで見返すグループの文脈も残せるようにする
- 複数選択による一括復元 / 一括削除で、保存済みグループの整理を速くする
- 自動アーカイブや保存期限ルールで、古いグループを自然に掃除できるようにする
- 端末別 / ブラウザ別 / 日付別のクイックフィルタで、必要な保存をすぐ見つけられるようにする
- 大量データ向けのページングや仮想スクロールで、モバイル環境でも一覧を軽く保つ

## なぜ作ったのか

既存のタブ管理ツールには、主に次の2つの問題があります。

1. タブがローカルにしか保存されない

デバイスを変えるとアクセスできません。

2. 保存されたタブが永遠に増え続ける

結果としてリストが散らかります。

この拡張は、保存されたタブを **「一時的なキュー」**として扱います。

保存されたタブを開くと、そのタブは 自動的にリストから削除されます。

これにより、リストは常に整理された状態を保てます。

## アーキテクチャ

### フロントエンド

Chrome / Firefox 拡張

TypeScript

Vite (ビルド)

### ストレージ

Supabase

Row Level Security

クラウド同期

### データ構造

#### tables

**tab_groups**

保存されたタブグループ（ウィンドウ状態）

**tabs**

各タブの情報

## 開発環境でのインストール

npm install
npm run build:chrome

ビルド後、以下から拡張を読み込みます。

chrome://extensions

dist/chrome ディレクトリを 「パッケージ化されていない拡張機能を読み込む」 から追加してください。

## GitHub Pages 版タブレット UI

Android 版 Firefox 向けには、拡張内の `newtab.html` ではなく GitHub Pages 上の軽量ダッシュボードを使います。

このダッシュボードは `index.html` と `tablet.html` の 2 つのエントリで配信され、ルートURLへアクセスした場合は `tablet.html` へ遷移します。

ダッシュボードのお気に入り固定はローカル保存です。拡張内ダッシュボードと GitHub Pages 版ダッシュボードでは保存先が別になるため、それぞれの環境で独立して保持されます。

```bash
npm run build:pages
```

出力先は `dist/pages/` です。`main` への push 時は `.github/workflows/deploy-pages.yml` から GitHub Pages へデプロイされます。

公開URLは以下です。

- `https://nokia215.github.io/tab_ext/`
- `https://nokia215.github.io/tab_ext/tablet.html`

ルートURLには `index.html` を置き、`tablet.html` へリダイレクトしています。

初回のみ、GitHub のリポジトリ設定で Pages を有効にしてください。

1. `Settings`
2. `Pages`
3. `Build and deployment` の `Source` を `GitHub Actions` にする

これが未設定だと `actions/deploy-pages` は `404 Not Found` で失敗します。

### GitHub Actions メモ

- Pages workflow は Node 24 前提で実行するため `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` を設定しています。
- `checkout` / `setup-node` / `configure-pages` は Node 24 対応版を使っています。
- `deploy-pages` 側は GitHub 提供 action の更新状況により一時的に非推奨警告が残る場合がありますが、Node 24 での実行を強制しているため現時点ではそのまま運用できます。

## プロジェクト構造
```
docs/             # 設計メモ・ガイドライン
src/
  popup/        # ポップアップUI
  newtab/       # 新しいタブページ
  background/   # background script
  shared/       # 共通ロジック

manifests/      # browser manifest
scripts/        # build scripts
```

## UI ドキュメント

- 一覧性を重視した UI 方針: `docs/ui-guidelines.md`
