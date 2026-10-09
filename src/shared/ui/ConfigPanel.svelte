<script lang="ts">
  import type { ConfigPanelView } from '../view-types';

  let { view }: { view: ConfigPanelView } = $props();
</script>

<section class="panel config-panel">
  <div><h2 class="section-title">保存対象の除外ルール</h2><p class="section-copy">保存から除外するドメインやタブ名を、1行に1つ入力してください。</p></div>
  <div class="field-grid split">
    <label class="field"><span class="field-label">除外するドメイン</span><textarea name="ignoreDomainsText" rows="5" placeholder="mail.google.com&#10;slack.com&#10;chatgpt.com">{view.ignoreDomainsText}</textarea></label>
    <label class="field"><span class="field-label">除外するタブ名</span><textarea name="ignoreTitlesText" rows="5" placeholder="Inbox&#10;Notifications">{view.ignoreTitlesText}</textarea></label>
  </div>
  <div class="actions"><button type="button" data-action="save-config" disabled={view.busy}>設定を保存</button></div>
</section>
