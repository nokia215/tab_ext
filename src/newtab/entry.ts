import { mount } from 'svelte';
import Dashboard from './Dashboard.svelte';
import { shouldDelegateDashboardToWeb, EXTERNAL_WEB_DASHBOARD_URL } from '../shared/dashboard-url';

if (shouldDelegateDashboardToWeb()) {
  window.location.replace(EXTERNAL_WEB_DASHBOARD_URL);
} else {
  mount(Dashboard, { target: document.getElementById('app')! });
  void import('./main');
}
