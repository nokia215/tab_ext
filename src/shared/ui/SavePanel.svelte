<script lang="ts">
  import StatusBanner from './StatusBanner.svelte';
  import SaveDestination from './SaveDestination.svelte';
  import type { SavePanelView } from '../view-types';

  let { view }: { view: SavePanelView } = $props();
  let busy = $derived(view.windowBusy || view.tabBusy || view.importBusy);
</script>

<section class="panel save-panel">
  <div class="section-head"><div><p class="eyebrow">Capture</p><h2 class="section-title">今の作業をスナップショット化</h2><p class="section-copy">ウィンドウ全体、1タブ単位、テキスト貼り付けの3通りで保存できます。</p></div></div>
  <SaveDestination groups={view.groups} groupId={view.groupId} busy={busy} />
  <label class="field"><span class="field-label">新規グループ名</span><input name="groupTitle" type="text" value={view.title} disabled={busy || Boolean(view.groupId)} placeholder="未入力なら端末情報つきで自動命名" /></label>
  <div class="actions"><button type="button" data-action="save-window" disabled={busy}>現在ウィンドウを保存</button><button class="secondary" type="button" data-action="save-tab" disabled={busy}>現在タブのみ保存</button></div>
  <label class="field"><span class="field-label">インポート</span><textarea name="importText" rows="7" placeholder="https://example.com | Example&#10;https://another.example.com | Another Tab&#10;&#10;https://group-two.example.com | Group Two">{view.importText}</textarea></label>
  <div class="actions"><button class="secondary" type="button" data-action="import-tabs" disabled={busy}>テキストからインポート</button></div>
  <p class="section-copy"><code>URL | タブ名</code> を1行ずつ貼り付け、新規保存では空行でグループを分け、既存グループにはまとめて追加します。</p>
  <StatusBanner status={view.status} error={view.status.includes('失敗')} />
</section>
