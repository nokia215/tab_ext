export function escapeHtml(value: string | null | undefined): string {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderStatusBanner(status: string, isError = false): string {
  if (!status) return '';
  return `<p class="status-banner${isError ? ' error' : ''}">${escapeHtml(status)}</p>`;
}

export function renderDisabled(disabled: boolean): string {
  return disabled ? ' disabled' : '';
}
