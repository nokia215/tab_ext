// Public API: client/authentication, group queries/updates, and tab persistence.
export { getSupabase, signIn, signOut, getCurrentUser, getCurrentSessionUser } from './supabase-client';
export { getFavoriteGroupIds, setGroupFavorite, listGroups, getGroup, setGroupFixed,
  consumeRestoredTabs, updateGroupTitle, deleteGroup } from './supabase-groups';
export { filterSavableTabs, filterSavableImportedTabs, buildDefaultGroupTitle,
  saveTabGroup, saveImportedTabGroup, type ImportableTabInput } from './supabase-save';
