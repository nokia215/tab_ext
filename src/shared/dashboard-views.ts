import { writable } from 'svelte/store';
import type { NewtabViewArgs } from '../newtab/view';
import type { TabletViewArgs } from '../tablet/view';

export const dashboardView = writable<NewtabViewArgs | null>(null);
export const tabletView = writable<TabletViewArgs | null>(null);
