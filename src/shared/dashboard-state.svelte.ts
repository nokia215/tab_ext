import type { GroupListActions } from './view-types';
import type { DashboardState } from './dashboard-model';

export const dashboards = $state({
  desktop: null as DashboardState | null,
  tablet: null as DashboardState | null
});

export const groupListActions = $state({
  desktop: null as GroupListActions | null,
  tablet: null as GroupListActions | null
});
