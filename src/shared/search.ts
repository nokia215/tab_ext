import type { SavedTab, TabGroup } from './types';

function includesQuery(value: string | null | undefined, query: string): boolean {
  return (value ?? '').toLowerCase().includes(query);
}

function matchTab(tab: SavedTab, query: string): boolean {
  return includesQuery(tab.title, query) || includesQuery(tab.url, query);
}

export function filterGroups(groups: TabGroup[], rawQuery: string): TabGroup[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return groups;

  return groups
    .map((group) => {
      const groupMatched = includesQuery(group.title, query);
      const filteredTabs = groupMatched
        ? group.tabs
        : group.tabs.filter((tab) => matchTab(tab, query));

      return {
        ...group,
        tabs: filteredTabs
      };
    })
    .filter((group) => group.tabs.length > 0 || includesQuery(group.title, query));
}