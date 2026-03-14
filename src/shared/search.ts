import type { SavedTab, TabGroup } from './types';

function includesQuery(value: string | null | undefined, query: string): boolean {
  return (value ?? '').toLowerCase().includes(query);
}

function matchTab(tab: SavedTab, query: string): boolean {
  return includesQuery(tab.title, query);
}

export function filterGroups(groups: TabGroup[], rawQuery: string): TabGroup[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return groups;

  const result: TabGroup[] = [];

  for (const group of groups) {
    if (includesQuery(group.title, query)) {
      result.push(group);
      continue;
    }

    const filteredTabs = group.tabs.filter((tab) => matchTab(tab, query));
    if (filteredTabs.length === 0) {
      continue;
    }

    result.push({
      ...group,
      tabs: filteredTabs
    });
  }

  return result;
}
