import type { DashboardState } from './dashboard-model';

export const dashboards = $state({
  desktop: null as DashboardState | null,
  tablet: null as DashboardState | null
});
