import '../shared/ui.css';
import '../shared/panels.css';
import '../newtab/newtab.css';
import './tablet.css';
import { DashboardGroups } from '../shared/dashboard-groups';
import { DashboardSession } from '../shared/dashboard-session';
import { DashboardSave } from '../shared/dashboard-save';
import { DashboardRestore, prepareDashboardWebRestore } from '../shared/dashboard-restore';
import { LIGHTWEIGHT_GROUP_BATCH_SIZE, createInitialState, isDashboardBusy,
  type DashboardState, type FocusState } from '../shared/dashboard-model';
import { dashboards } from '../shared/dashboard-state.svelte';

class TabletApp {
  private readonly root: HTMLElement;
  private state: DashboardState;
  private readonly groups: DashboardGroups;
  private readonly session: DashboardSession;
  private readonly save: DashboardSave;
  private readonly restore: DashboardRestore;
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    dashboards.tablet = createInitialState({ isAndroidFirefox: false, uiMode: 'lightweight' });
    this.state = dashboards.tablet!;
    this.groups = new DashboardGroups(this.state, (focus) => this.render(focus));
    this.session = new DashboardSession(this.state, () => this.render(), this.groups);
    this.save = new DashboardSave(this.state, () => this.render(), () => this.session.refreshAll());
    this.restore = new DashboardRestore(this.state, () => this.render(), this.groups, prepareDashboardWebRestore);
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.root.addEventListener('compositionend', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === 'searchQuery') {
        this.state.searchQuery = target.value;
        this.scheduleSearchRender({
          name: 'searchQuery',
          start: target.selectionStart,
          end: target.selectionEnd
        });
      }
    });
    this.root.addEventListener('change', (event) => {
      this.handleChange(event);
    });
  }

  async bootstrap() {
    await this.session.bootstrap(this.root);
  }

  private cancelPendingSearchRender() {
    if (this.pendingSearchRenderId !== null) {
      window.clearTimeout(this.pendingSearchRenderId);
      this.pendingSearchRenderId = null;
    }
  }

  private scheduleSearchRender(focus: FocusState) {
    this.cancelPendingSearchRender();
    this.pendingSearchRenderId = window.setTimeout(() => {
      this.pendingSearchRenderId = null;
      this.render(focus);
    }, 120);
  }

  private render(focus?: FocusState) {
    this.session.scheduleCacheSave();
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Web';
    document.body.classList.add('lightweight-ui');

    if (focus) {
      window.setTimeout(() => {
        const next = this.root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${focus.name}"]`);
        if (next) {
          next.focus();
          if (focus.start !== null && focus.end !== null && 'setSelectionRange' in next) {
            next.setSelectionRange(focus.start, focus.end);
          }
        }
      });
    }
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'searchQuery':
        if (event instanceof InputEvent && event.isComposing) return;
        this.state.searchQuery = target.value;
        this.scheduleSearchRender({
          name: 'searchQuery',
          start: target.selectionStart,
          end: target.selectionEnd
        });
        return;
      case 'groupTitle':
        this.state.groupTitle = target.value;
        break;
      case 'groupTitleEdit':
        this.state.editingGroupTitle = target.value;
        break;
      case 'importText':
        this.state.importText = target.value;
        break;
      case 'email':
        this.state.email = target.value;
        break;
      case 'password':
        this.state.password = target.value;
        break;
      case 'ignoreDomainsText':
        this.state.ignoreDomainsText = target.value;
        break;
      case 'ignoreTitlesText':
        this.state.ignoreTitlesText = target.value;
        break;
      default:
        break;
    }
  }

  private handleChange(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.name === 'saveGroupId') {
      this.state.saveGroupId = target.value;
      this.render();
      return;
    }

    if (target.name === 'sortMode') {
      this.state.sortMode = target.value as DashboardState['sortMode'];
      this.groups.resetVisibleGroupCount();
      this.render();
      return;
    }

    if (target.name === 'deviceFilter') {
      this.state.deviceFilter = target.value;
      this.groups.resetVisibleGroupCount();
      this.render();
    }
  }

  private async handleClick(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionTarget = target.closest<HTMLElement>('[data-action]');
    if (!actionTarget || !this.root.contains(actionTarget)) {
      return;
    }

    const action = actionTarget.dataset.action;
    const groupId = actionTarget.dataset.groupId;
    const tabId = actionTarget.dataset.tabId;
    const busy = isDashboardBusy(this.state);
    if (busy && !['set-group-filter', 'set-date-range-filter', 'toggle-favorite-only', 'toggle-group', 'show-more-groups'].includes(action ?? '')) return;

    switch (action) {
      case 'refresh-all':
        await this.session.refreshAll();
        break;
      case 'import-tabs':
        await this.save.handleImportTabs();
        break;
      case 'save-config':
        await this.session.handleSaveConfig();
        break;
      case 'sign-in':
        await this.session.handleSignIn();
        break;
      case 'sign-out':
        await this.session.handleSignOut();
        break;
      case 'set-group-filter':
        await this.groups.setGroupFilter((actionTarget.dataset.value as DashboardState['groupFilter']) ?? 'all');
        break;
      case 'set-date-range-filter':
        this.state.dateRangeFilter = (actionTarget.dataset.value as DashboardState['dateRangeFilter']) ?? 'all';
        this.groups.resetVisibleGroupCount();
        this.render();
        break;
      case 'toggle-favorite-only':
        this.groups.toggleFavoriteOnly();
        break;
      case 'toggle-group':
        if (!groupId) break;
        this.state.expandedGroupIds = this.state.expandedGroupIds.includes(groupId) ? [] : [groupId];
        this.render();
        break;
      case 'toggle-group-selection':
        if (!groupId) break;
        this.groups.toggleGroupSelection(groupId);
        break;
      case 'toggle-fixed-group':
        if (groupId) await this.groups.handleToggleFixedGroup(groupId);
        break;
      case 'toggle-favorite-group':
        if (!groupId) break;
        await this.groups.handleToggleFavoriteGroup(groupId);
        break;
      case 'restore-group':
        if (!groupId) break;
        await this.restore.handleRestore(groupId);
        break;
      case 'copy-group':
        if (!groupId) break;
        await this.groups.handleCopyGroup(groupId);
        break;
      case 'delete-group':
        if (!groupId) break;
        await this.groups.handleDeleteGroup(groupId);
        break;
      case 'select-visible-groups':
        this.groups.selectVisibleGroups();
        break;
      case 'select-stale-groups':
        this.groups.selectStaleGroups();
        break;
      case 'clear-group-selection':
        this.groups.clearGroupSelection();
        break;
      case 'restore-selected-groups':
        await this.restore.handleRestoreSelectedGroups();
        break;
      case 'copy-selected-groups':
        await this.groups.handleCopySelectedGroups();
        break;
      case 'delete-selected-groups':
        await this.groups.handleDeleteSelectedGroups();
        break;
      case 'open-tab':
        if (!tabId) break;
        await this.restore.handleOpenTab(tabId);
        break;
      case 'edit-group-title':
        if (!groupId) break;
        this.groups.startEditingGroupTitle(groupId);
        break;
      case 'cancel-edit-group-title':
        this.groups.stopEditingGroupTitle();
        this.render();
        break;
      case 'save-group-title':
        if (!groupId) break;
        await this.groups.handleSaveGroupTitle(groupId);
        break;
      case 'show-more-groups':
        this.state.visibleGroupCount += LIGHTWEIGHT_GROUP_BATCH_SIZE;
        this.render();
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Tablet root element was not found.');
}

const app = new TabletApp(target);
void app.bootstrap();
