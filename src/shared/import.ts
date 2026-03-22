import { parseImportedTabGroups } from './format';
import { getOrCreateDeviceId } from './storage';
import { saveImportedTabGroup } from './supabase';

export interface ImportTabsResult {
  importedGroupCount: number;
  importedTabCount: number;
  skippedLineCount: number;
}

function buildImportGroupTitle(baseTitle: string, groupIndex: number, groupCount: number) {
  const normalizedBaseTitle = baseTitle.trim();
  if (!normalizedBaseTitle) {
    return '';
  }

  return groupCount === 1 ? normalizedBaseTitle : `${normalizedBaseTitle} (${groupIndex + 1})`;
}

export async function importTabGroups(input: {
  groupTitle: string;
  importText: string;
}): Promise<ImportTabsResult> {
  const { groups, skippedLineCount } = parseImportedTabGroups(input.importText);
  if (groups.length === 0) {
    throw new Error('インポート可能なタブがありません。');
  }

  const deviceId = await getOrCreateDeviceId();
  let importedGroupCount = 0;
  let importedTabCount = 0;

  for (const [groupIndex, group] of groups.entries()) {
    const result = await saveImportedTabGroup({
      title: buildImportGroupTitle(input.groupTitle, groupIndex, groups.length),
      deviceId,
      tabs: group
    });
    importedGroupCount += 1;
    importedTabCount += result.count;
  }

  return {
    importedGroupCount,
    importedTabCount,
    skippedLineCount
  };
}
