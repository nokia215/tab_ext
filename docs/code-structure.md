# ダッシュボードのコード構成

画面のイベントから処理を追うときは、`src/newtab/main.ts` または `src/tablet/main.ts` の `handleClick` を入口にする。
両画面は同じ状態と操作モジュールを使い、画面側には入力イベント、IME 対応、フォーカス、画面固有の表示設定を残している。

| ファイル（`src/shared/`） | 責務 |
| --- | --- |
| `dashboard-model.ts` | 状態の型と初期値、検索、並べ替え、集計 |
| `dashboard-state.svelte.ts` | Svelte が監視する画面ごとの状態 |
| `dashboard-session.ts` | 認証、設定、キャッシュの表示と保存、初回読み込み、手動更新 |
| `auto-sync.ts` | フォーカス、オンライン復帰、定期ポーリングによる自動同期 |
| `dashboard-save.ts` | ブラウザーのタブ保存、URL インポート |
| `dashboard-groups.ts` | グループの選択、展開、名前編集、固定、お気に入り、コピー、削除 |
| `dashboard-restore.ts` | 復元要求の直列化、即時表示更新、重複クリック防止、失敗時の巻き戻し |
| `restoration.ts` | 実際のタブ復元、復元済みタブの削除同期と永続的な再試行 |
| `ui/` | Svelte の表示コンポーネント |

操作モジュールは画面の状態を直接更新し、渡された `render` コールバックでキャッシュ保存やフォーカス処理を要求する。
ページのクラスを操作モジュールへ渡したり、継承したりしない。
`DashboardSession` と `DashboardRestore` は、選択やグループ検索に `DashboardGroups` を使う。

拡張機能の復元は `prepareExtensionRestore` からバックグラウンドへ送る。
Web の復元は `prepareDashboardWebRestore` を使い、クリック中にウィンドウを確保してから非同期処理を始める。
復元の待ち行列は各ダッシュボードが持ち、他の画面と共有しない。

## Supabase

`supabase.ts` は既存の呼び出し元向けの公開窓口で、実装は次のファイルに分けている。

| ファイル（`src/shared/`） | 責務 |
| --- | --- |
| `supabase-client.ts` | クライアントの生成、認証情報の保存、ログイン、ログアウト、ユーザー取得 |
| `supabase-groups.ts` | グループの読み取りと変更、お気に入りの移行、復元済みタブ削除の RPC |
| `supabase-save.ts` | 保存対象の絞り込み、既定タイトル、URL 重複排除、既存または新規グループへの保存 |

内部の各ファイルは `supabase-client.ts` を直接参照する。
公開窓口を内部から参照しないことで循環依存を避ける。

`npm test` で保存、復元、同期と操作モジュールの回帰チェックを実行できる。
