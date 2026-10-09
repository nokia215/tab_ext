import '../shared/ui.css';
import '../shared/panels.css';
import './newtab.css';
import { DashboardGroups } from '../shared/dashboard-groups';
import { DashboardSession } from '../shared/dashboard-session';
import { DashboardSave } from '../shared/dashboard-save';
import { DashboardRestore, prepareExtensionRestore } from '../shared/dashboard-restore';
import { LIGHTWEIGHT_GROUP_BATCH_SIZE, createInitialState, isDashboardBusy,
  detectRuntimeProfile, type RuntimeProfile, type GroupFilter, type SortMode,
  type DashboardState, type FocusState } from '../shared/dashboard-model';
import { dashboards } from '../shared/dashboard-state.svelte';

class NewtabApp {
  private readonly root: HTMLElement;
  private readonly runtimeProfile: RuntimeProfile;
  private state: DashboardState;
  private readonly groups: DashboardGroups;
  private readonly session: DashboardSession;
  private readonly save: DashboardSave;
  private readonly restore: DashboardRestore;
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement, runtimeProfile: RuntimeProfile) {
    this.root = root;
    this.runtimeProfile = runtimeProfile;
    dashboards.desktop = createInitialState(runtimeProfile);
    this.state = dashboards.desktop!;
    this.groups = new DashboardGroups(this.state, (focus) => this.render(focus));
    this.session = new DashboardSession(this.state, () => this.render(), this.groups);
    this.save = new DashboardSave(this.state, () => this.render(), () => this.session.refreshAll());
    this.restore = new DashboardRestore(this.state, () => this.render(), this.groups, prepareExtensionRestore);
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.root.addEventListener('compositionend', (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name === 'searchQuery') {
        this.handleSearchInput(target);
      }
    });
    this.root.addEventListener('change', (event) => {
      this.handleChange(event);
    });
  }

  async bootstrap() {
    await this.session.bootstrap(this.root);
  }

  private get isLightweightMode() {
    return this.state.uiMode === 'lightweight';
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

  private toggleLightweightPanel(panel: 'save' | 'settings') {
    if (panel === 'save') {
      const nextOpen = !this.state.savePanelOpen;
      this.state.savePanelOpen = nextOpen;
      if (nextOpen) {
        this.state.settingsPanelOpen = false;
      }
    } else {
      const nextOpen = !this.state.settingsPanelOpen;
      this.state.settingsPanelOpen = nextOpen;
      if (nextOpen) {
        this.state.savePanelOpen = false;
      }
    }

    this.render();
  }

  private render(focus?: FocusState) {
    this.session.scheduleCacheSave();
    this.cancelPendingSearchRender();
    document.title = 'Tab Saver Dashboard';
    document.body.classList.toggle('lightweight-ui', this.isLightweightMode);
    document.body.classList.toggle('android-firefox-ui', this.runtimeProfile.isAndroidFirefox);

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

  private handleSearchInput(target: HTMLInputElement | HTMLTextAreaElement) {
    this.state.searchQuery = target.value;
    this.groups.resetVisibleGroupCount();
    this.scheduleSearchRender({
      name: 'searchQuery',
      start: target.selectionStart,
      end: target.selectionEnd
    });
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
      case 'searchQuery':
        if (event instanceof InputEvent && event.isComposing) break;
        this.handleSearchInput(target);
        break;
      case 'groupTitle':
        this.state.groupTitle = target.value;
        break;
      case 'groupTitleEdit':
        if (target.dataset.groupId === this.state.editingGroupId) {
          this.state.editingGroupTitle = target.value;
        }
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
      this.state.sortMode = target.value as SortMode;
      this.groups.resetVisibleGroupCount();
      this.render();
    } else if (target.name === 'deviceFilter') {
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
    const busy = isDashboardBusy(this.state);
    if (busy && !['set-group-filter', 'toggle-favorite-only', 'toggle-group', 'show-more-groups'].includes(action ?? '')) return;
    if (!action) {
      return;
    }

    switch (action) {
      case 'refresh-all':
        await this.session.refreshAll();
        break;
      case 'save-window':
        await this.save.handleSaveWindow();
        break;
      case 'save-tab':
        await this.save.handleSaveTab();
        break;
      case 'import-tabs':
        await this.save.handleImportTabs();
        break;
      case 'save-config':
        await this.session.handleSaveConfig();
        break;
      case 'sign-out':
        await this.session.handleSignOut();
        break;
      case 'toggle-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          this.groups.toggleGroup(groupId);
        }
        break;
      }
      case 'toggle-group-selection': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          this.groups.toggleGroupSelection(groupId);
        }
        break;
      }
      case 'toggle-fixed-group':
        if (groupId) await this.groups.handleToggleFixedGroup(groupId);
        break;
      case 'toggle-favorite-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.groups.handleToggleFavoriteGroup(groupId);
        }
        break;
      }
      case 'edit-group-title': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          this.groups.startEditingGroupTitle(groupId);
        }
        break;
      }
      case 'save-group-title': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.groups.handleSaveGroupTitle(groupId);
        }
        break;
      }
      case 'cancel-edit-group-title':
        this.groups.stopEditingGroupTitle();
        this.render();
        break;
      case 'restore-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.restore.handleRestore(groupId);
        }
        break;
      }
      case 'copy-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.groups.handleCopyGroup(groupId);
        }
        break;
      }
      case 'delete-group': {
        const groupId = actionTarget.dataset.groupId;
        if (groupId) {
          await this.groups.handleDeleteGroup(groupId);
        }
        break;
      }
      case 'select-visible-groups':
        this.groups.selectVisibleGroups();
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
      case 'open-tab': {
        const tabId = actionTarget.dataset.tabId;

        if (tabId) {
          await this.restore.handleOpenTab(tabId);
        }
        break;
      }
      case 'set-group-filter': {
        const value = actionTarget.dataset.value as GroupFilter | undefined;
        if (value) {
          await this.groups.setGroupFilter(value);
        }
        break;
      }
      case 'toggle-favorite-only':
        this.groups.toggleFavoriteOnly();
        break;
      case 'show-more-groups':
        this.state.visibleGroupCount += LIGHTWEIGHT_GROUP_BATCH_SIZE;
        this.render();
        break;
      case 'toggle-save-panel':
        this.toggleLightweightPanel('save');
        break;
      case 'toggle-settings-panel':
        this.toggleLightweightPanel('settings');
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');
if (!target) throw new Error('Newtab root element was not found.');
const runtimeProfile = detectRuntimeProfile();
const app = new NewtabApp(target, runtimeProfile);
void app.bootstrap();
