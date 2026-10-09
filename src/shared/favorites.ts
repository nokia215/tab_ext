export function removeFavoriteGroupIds(favoriteGroupIds: string[], groupIds: string[]): string[] {
  const removedIds = new Set(groupIds);
  return favoriteGroupIds.filter((groupId) => !removedIds.has(groupId));
}
