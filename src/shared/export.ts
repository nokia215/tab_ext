import type { TabGroup } from './types';

function formatTabLine(url: string, title: string) {
  const trimmedTitle = title.trim();
  return trimmedTitle ? `${url} | ${trimmedTitle}` : url;
}

export function formatGroupForExport(group: TabGroup): string {
  return group.tabs
    .map((tab) => formatTabLine(tab.url, tab.title))
    .join('\n');
}

export function formatGroupsForExport(groups: TabGroup[]): string {
  return groups
    .map((group) => formatGroupForExport(group))
    .filter(Boolean)
    .join('\n\n');
}

export async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();

  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('クリップボードにコピーできませんでした。');
    }
  } finally {
    textarea.remove();
  }
}
