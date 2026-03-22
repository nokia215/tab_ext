import { isSavableTabUrl } from './tabs';

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function lineListToText(values: string[]): string {
  return values.join('\n');
}

export function textToLineList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface ImportedTabInput {
  url: string;
  title: string;
}

export interface ImportedTabParseResult {
  groups: ImportedTabInput[][];
  skippedLineCount: number;
}

function parseImportedTabLine(line: string): ImportedTabInput | null {
  const separatorIndex = line.indexOf('|');
  const rawUrl = separatorIndex >= 0 ? line.slice(0, separatorIndex).trim() : line.trim();
  const rawTitle = separatorIndex >= 0 ? line.slice(separatorIndex + 1).trim() : '';

  if (!isSavableTabUrl(rawUrl)) {
    return null;
  }

  return {
    url: rawUrl,
    title: rawTitle
  };
}

export function parseImportedTabGroups(value: string): ImportedTabParseResult {
  const groups: ImportedTabInput[][] = [];
  let currentGroup: ImportedTabInput[] = [];
  let skippedLineCount = 0;

  for (const rawLine of value.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();

    if (!line) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }

    const tab = parseImportedTabLine(line);
    if (!tab) {
      skippedLineCount += 1;
      continue;
    }

    currentGroup.push(tab);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return {
    groups,
    skippedLineCount
  };
}
