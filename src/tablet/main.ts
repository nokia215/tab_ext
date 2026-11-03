import '../shared/ui.css';
import '../shared/panels.css';
import '../newtab/newtab.css';
import './tablet.css';
import { DashboardController } from '../shared/dashboard-controller';
import { prepareDashboardWebRestore } from '../shared/dashboard-restore';
import { createInitialState, type RuntimeProfile } from '../shared/dashboard-model';
import { dashboards, groupListActions } from '../shared/dashboard-state.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Dashboard root element was not found.');
const runtimeProfile: RuntimeProfile = { isAndroidFirefox: false, uiMode: 'lightweight' };
dashboards.tablet = createInitialState(runtimeProfile);
const app = new DashboardController(target, dashboards.tablet, runtimeProfile, prepareDashboardWebRestore, 'Tab Saver Web');
groupListActions.tablet = app.groupActions;
void app.bootstrap();
