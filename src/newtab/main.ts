import '../shared/ui.css';
import '../shared/panels.css';
import './newtab.css';
import { DashboardController } from '../shared/dashboard-controller';
import { prepareExtensionRestore } from '../shared/dashboard-restore';
import { createInitialState, detectRuntimeProfile, type RuntimeProfile } from '../shared/dashboard-model';
import { dashboards, groupListActions } from '../shared/dashboard-state.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Dashboard root element was not found.');
const runtimeProfile: RuntimeProfile = detectRuntimeProfile();
dashboards.desktop = createInitialState(runtimeProfile);
const app = new DashboardController(target, dashboards.desktop, runtimeProfile, prepareExtensionRestore, 'Tab Saver Dashboard');
groupListActions.desktop = app.groupActions;
void app.bootstrap();
