export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isErrorStatus(status: string): boolean {
  return status.includes('失敗') || status.includes('読み込めませんでした');
}

export function formatImportStatus(
  importedGroupCount: number,
  importedTabCount: number,
  skippedLineCount: number,
  duplicateCount = 0
): string {
  const duplicateMessage = duplicateCount > 0 ? `${duplicateCount} 件の重複タブをスキップしました。` : '';
  if (skippedLineCount > 0) {
    return `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。${skippedLineCount} 行はスキップしました。${duplicateMessage}`;
  }

  return `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。${duplicateMessage}`;
}
