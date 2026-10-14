# データベースのテーブルと関数

この説明は、[sql/schema.sql](../sql/schema.sql)と[増分マイグレーション](../supabase/migrations/)に定義された現在の構成に基づく。
マイグレーションは `20261014020000_drop_legacy_favorite_support.sql` までを対象とする。
本番DBへの適用状況は、このドキュメントでは確認していない。

## テーブルの関係

アプリが使うテーブルは `public.tab_groups` と `public.tabs` の2つである。
Supabase Authが管理する `auth.users` の1ユーザーが複数のグループを持ち、各グループが複数のタブを持つ。
ユーザーを削除すると、そのユーザーのグループとタブも外部キーの `ON DELETE CASCADE` で削除される。
グループを削除すると、そのグループ内のタブも削除される。

### `public.tab_groups`

保存したタブをまとめるグループと、その表示設定を保持する。

| カラム | 型 | NULL | 既定値 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | 不可 | `gen_random_uuid()` | グループの主キー |
| `user_id` | `uuid` | 不可 | なし | 所有者。`auth.users(id)` を参照 |
| `device_id` | `text` | 不可 | なし | グループを作成した端末の識別文字列。端末による表示と絞り込みに使用 |
| `title` | `text` | 可 | なし | グループ名。アプリは新規保存時に空欄なら既定名を生成 |
| `created_at` | `timestamptz` | 不可 | `now()` | 作成日時。更新日時ではない |
| `is_favorite` | `boolean` | 不可 | `false` | お気に入り。復元でタブがなくなってもグループを保持 |
| `is_fixed` | `boolean` | 不可 | `false` | 固定。復元後もタブを保持 |

「お気に入り」と「固定」は独立した設定である。
固定していないお気に入りグループでは、復元済みタブを削除しても空のグループは残る。
明示的なグループ削除では、どちらの設定も削除を妨げない。
既存グループへの追加保存では、`device_id` と `title` は変更しない。

### `public.tabs`

グループに保存されたURLと、その表示順を保持する。
復元後の履歴テーブルではなく、現在保存されているタブの一覧である。

| カラム | 型 | NULL | 既定値 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | 不可 | `gen_random_uuid()` | 保存タブの主キー。ブラウザー側のタブIDとは別 |
| `group_id` | `uuid` | 不可 | なし | 所属グループ。`public.tab_groups(id)` を参照 |
| `user_id` | `uuid` | 不可 | なし | 所有者。`auth.users(id)` を参照。RLSとURL重複判定に使用 |
| `url` | `text` | 不可 | なし | 保存したURLの文字列 |
| `title` | `text` | 不可 | `''` | タブのタイトル |
| `position` | `integer` | 不可 | なし | グループ内の表示順。保存RPCは新規グループで0から開始 |
| `created_at` | `timestamptz` | 不可 | `now()` | 作成日時 |

アプリは取得したタブを `position` の昇順に並べる。
重複タブのスキップや復元済みタブの削除により、番号には欠番が生じる。
`position` には一意制約や非負制約を設けていない。

### インデックス

主キーのインデックスに加え、次のインデックスを定義している。

| 名前 | 対象 | 用途 |
| --- | --- | --- |
| `idx_tab_groups_user_created_at` | `tab_groups(user_id, created_at DESC)` | ユーザーのグループを作成日時順に取得 |
| `idx_tabs_group_position` | `tabs(group_id, position)` | グループ内のタブ取得と並び順。`group_id` 単独の検索にも使用可能 |
| `tabs_user_url_hash_unique` | `tabs(user_id, public.tab_url_key(url))` | 同じユーザーのURL重複をグループをまたいで禁止する一意インデックス |

同じURLを別のユーザーが保存することはできる。
同じユーザーの固定グループにあるURLも、他のグループへ重複保存できない。

## アクセス制御

両テーブルで **RLS（Row Level Security）** を有効にし、各操作で `auth.uid() = user_id` を確認する。
グループのSELECT、INSERT、UPDATE、DELETEは自分の行に限定され、UPDATE後の所有者も自分でなければならない。
タブのSELECTとDELETEも自分の行に限定される。
タブのINSERTとUPDATEでは、変更後の `group_id` が自分のグループを指すことも確認する。
この親グループの所有者確認はRLSポリシーによるもので、外部キーだけで所有者の一致を保証しているわけではない。

保存と復元後の削除に使うRPCは `SECURITY INVOKER` で実行するため、呼び出したユーザーの権限とRLSを使う。
両RPCの実行権限は `PUBLIC` と `anon` から取り消し、`authenticated` に付与している。
アプリのpublishable keyとログインセッションを使い、RLSを迂回する `service_role` キーはアプリに組み込まない。

## DB関数

現在の関数は以下の3つで、いずれもPL/pgSQLで定義し、`search_path` を `public` に固定している。

### `public.tab_url_key(raw_url text) → text`

URL重複判定用のSHA-256ハッシュを、16進数の文字列として返す。
一意インデックスと保存RPCが使い、アプリから直接RPCとして呼び出してはいない。
`IMMUTABLE` と `STRICT` を指定しており、NULL入力にはNULLを返す。

ハッシュ化する前に、次の順で文字列を処理する。

1. `btrim` で前後の空白を除く。
2. 最初の `#` 以降を除く。
3. `scheme://authority` 形式なら、スキームとauthority（ホストやポートなど）の部分を小文字にする。
4. 結果をUTF-8に変換し、SHA-256でハッシュ化する。

たとえば `HTTPS://Example.com/path#section` と `https://example.com/path` は同じキーになる。
パスとクエリの大文字小文字、クエリの順序、末尾の `/`、既定ポートは統一しない。
`https://example.com` と `https://example.com/` は異なるキーになる。
この処理は重複判定用であり、`tabs.url` 自体は書き換えない。
保存URLの検証はこの関数では行わない。

### `public.save_tab_group(p_title text, p_device_id text, p_tabs jsonb, p_group_id uuid DEFAULT NULL) → jsonb`

グループの新規作成または既存グループへの追加と、タブ保存を1回のRPCで実行する。
呼び出し元は [supabase-save.ts](../src/shared/supabase-save.ts) の `persistTabGroup` で、ブラウザーのタブ保存とURLインポートが共用する。

| 引数 | 説明 |
| --- | --- |
| `p_title` | 新規グループの名前。既存グループへの追加時は使わない |
| `p_device_id` | 新規グループの端末識別文字列。既存グループへの追加時は使わない |
| `p_tabs` | 1件以上のオブジェクトの配列。各要素は必須の文字列 `url` と任意の文字列 `title` を持つ |
| `p_group_id` | NULLなら新規作成。UUIDを指定すると自分の既存グループへ追加 |

所有者は `auth.uid()` から決め、入力から `user_id` を受け取らない。
未認証なら `Authentication required`、指定グループが存在しないか自分のものではないなら `Missing or inaccessible group` をSQLSTATE `42501` で返す。
配列以外の入力は `Tabs must be an array`、空配列や不正な要素は `Invalid tabs` をSQLSTATE `22023` で返す。
URLは前後の空白を除いた文字列の先頭を正規表現で確認し、HTTP、HTTPS、FTP、`file:/` 形式を受け付ける。
完全なURL解析ではなく、アプリ側でも保存対象URLと除外設定を確認している。
`title` を省略すると空文字列を保存するが、明示的なNULLは入力エラーになる。

新規グループでは `position` を0から、追加時は既存の最大値に1を足した位置から割り当てる。
追加時はグループ行を `FOR UPDATE` でロックし、他の追加保存や復元後の削除と処理を直列化する。
同じユーザーのURLハッシュが衝突したタブは `ON CONFLICT DO NOTHING` でスキップし、保存済みのタブは変更しない。
途中で例外が発生すると、RPC内のグループ作成とタブ保存はまとめてロールバックされる。

戻り値は `group` と、実際に追加した件数 `count` を持つJSONである。
`group` には `id`、`title`、`device_id`、`created_at`、`is_fixed`、`is_favorite` が入り、タブの配列は含まれない。
新規作成で全件重複なら作成したグループを削除し、`{"group": null, "count": 0}` を返す。
既存グループへの追加で全件重複なら、既存グループと `count: 0` を返す。
アプリは入力件数から `count` を引いて重複件数を表示する。

### `public.consume_restored_tabs(p_group_id uuid, p_tab_ids uuid[]) → void`

復元に成功した保存タブを削除し、必要なら空になったグループも削除する。
呼び出し元は [supabase-groups.ts](../src/shared/supabase-groups.ts) の `consumeRestoredTabs` で、[restoration.ts](../src/shared/restoration.ts) が復元成功後の削除同期に使う。
ブラウザーでタブを開く処理はアプリ側が担当し、DB関数には成功したタブのUUIDだけを渡す。

| 引数 | 説明 |
| --- | --- |
| `p_group_id` | 復元対象のグループUUID |
| `p_tab_ids` | 開く処理に成功した保存タブのUUID配列 |

未認証なら `Authentication required` の例外を返す。
自分のグループ行を `FOR UPDATE` でロックし、グループが存在しない、自分のものではない、固定されている、のいずれかなら何もせず終了する。
削除対象は指定グループ内の自分のタブで、`p_tab_ids` に含まれる行に限る。
他グループのIDや既に削除されたIDを渡しても、その行は削除しない。

削除後にタブがなく、固定でもお気に入りでもない場合にだけグループを削除する。
同じIDで再試行しても、削除済みタブは再び削除されない。
アプリ側のラッパーは空配列ならRPCを呼び出さない。
削除同期に失敗した場合の再試行管理はアプリ側が担当する。

## 過去の構成との違い

現在は、`tab_groups.archived_at`、両テーブルの `updated_at`、`tabs.status`、`tabs.restored_at`、`tabs.url_key` は使わない。
復元した日時やアーカイブ状態はDBに記録しない。
重複判定は保存カラムとトリガーから式インデックスへ移り、`set_tab_url_key()` と `tabs_set_url_key` トリガーは削除済みである。
旧保存RPCの `insert_saved_tabs(jsonb)` も削除し、現在は `save_tab_group` を使う。
過去のマイグレーションにはこれらの定義が残るため、現在の構成を確認するときは後続の削除まで含めて読む。

スキーマ変更時は新しいマイグレーションを追加し、`sql/schema.sql` とこの説明も更新する。
適用手順と本番DBの確認方法は [READMEのセットアップ](../README.md#セットアップ) を参照する。
