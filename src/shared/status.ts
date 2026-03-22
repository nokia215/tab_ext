export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isErrorStatus(status: string): boolean {
  return status.includes('失敗') || status.includes('読み込めませんでした');
}

export function formatImportStatus(
  importedGroupCount: number,
  importedTabCount: number,
  skippedLineCount: number
): string {
  if (skippedLineCount > 0) {
    return `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。${skippedLineCount} 行はスキップしました。`;
  }

  return `${importedGroupCount} グループ / ${importedTabCount} 件をインポートしました。`;
}
