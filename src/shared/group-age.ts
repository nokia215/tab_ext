import type { TabGroup } from './types';

export const STALE_GROUP_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function getGroupAgeInDays(createdAt: string, now = new Date()): number {
  const createdDate = new Date(createdAt);
  const createdTime = createdDate.getTime();

  if (Number.isNaN(createdTime)) {
    return 0;
  }

  const diff = startOfLocalDay(now) - startOfLocalDay(createdDate);
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

export type DateRangeFilter = 'all' | 'today' | 'week' | 'month' | 'stale';
export type GroupAgeTone = 'fresh' | 'aging' | 'stale';

export function matchesDateRangeFilter(
  createdAt: string,
  filter: DateRangeFilter,
  now = new Date()
): boolean {
  const ageInDays = getGroupAgeInDays(createdAt, now);

  if (filter === 'today') {
    return ageInDays === 0;
  }

  if (filter === 'week') {
    return ageInDays < 7;
  }

  if (filter === 'month') {
    return ageInDays < STALE_GROUP_DAYS;
  }

  if (filter === 'stale') {
    return ageInDays >= STALE_GROUP_DAYS;
  }

  return true;
}

export function isStaleGroupByAge(
  group: Pick<TabGroup, 'created_at'>,
  staleDays = STALE_GROUP_DAYS,
  now = new Date()
): boolean {
  return getGroupAgeInDays(group.created_at, now) >= staleDays;
}

export function describeGroupAge(createdAt: string, now = new Date()): {
  label: string;
  tone: GroupAgeTone;
} {
  const ageInDays = getGroupAgeInDays(createdAt, now);

  if (ageInDays === 0) {
    return {
      label: '今日',
      tone: 'fresh'
    };
  }

  if (ageInDays >= STALE_GROUP_DAYS) {
    return {
      label: `${ageInDays}日前`,
      tone: 'stale'
    };
  }

  return {
    label: `${ageInDays}日前`,
    tone: ageInDays >= 7 ? 'aging' : 'fresh'
  };
}
