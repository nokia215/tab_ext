<script lang="ts">
  let { status, error = false }: { status: string; error?: boolean } = $props();
</script>

{#if status}
  <p class={`status-banner${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{status}</p>
{/if}
