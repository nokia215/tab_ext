<script lang="ts">
  import { formatDate } from '../format';
  import type { TabGroup } from '../types';

  let { groups, groupId, busy }: { groups: TabGroup[]; groupId: string; busy: boolean } = $props();
</script>

<label class="field">
  <span class="field-label">保存先</span>
  <select name="saveGroupId" disabled={busy} value={groupId}>
    <option value="">新規グループ</option>
    {#if groupId && !groups.some((group) => group.id === groupId)}
      <option value={groupId} disabled>選択したグループは利用できません</option>
    {/if}
    {#each groups as group (group.id)}
      <option value={group.id}>{group.title || '(no title)'} · {group.device_id} · {formatDate(group.created_at)}</option>
    {/each}
  </select>
</label>
