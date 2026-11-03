import { DashboardGroups } from './dashboard-groups';
import { DashboardSession } from './dashboard-session';
import { DashboardSave } from './dashboard-save';
import { DashboardRestore, type prepareExtensionRestore } from './dashboard-restore';
import { LIGHTWEIGHT_GROUP_BATCH_SIZE, isDashboardBusy,
  type RuntimeProfile, type GroupFilter, type SortMode,
  type DashboardState, type FocusState } from './dashboard-model';
import type { GroupListActions } from './view-types';

export class DashboardController {
  private readonly root: HTMLElement;
  private readonly runtimeProfile: RuntimeProfile;
  private state: DashboardState;
  private readonly groups: DashboardGroups;
  private readonly session: DashboardSession;
  private readonly save: DashboardSave;
  private readonly restore: DashboardRestore;
  private pendingSearchRenderId: number | null = null;

  constructor(root: HTMLElement, state: DashboardState, runtimeProfile: RuntimeProfile, prepareRestore: typeof prepareExtensionRestore, title: string) {
    this.root = root;
    this.runtimeProfile = runtimeProfile;
    this.state = state;
    document.title = title;
    this.groups = new DashboardGroups(this.state, (focus) => this.render(focus), () => this.session.scheduleCacheSave());
    this.session = new DashboardSession(this.state, () => this.render(), this.groups);
    this.save = new DashboardSave(this.state, () => this.render(), () => this.session.refreshAll());
    this.restore = new DashboardRestore(this.state, () => this.render(), this.groups, prepareRestore);
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

  readonly groupActions: GroupListActions = {
    toggleGroup: (id) => this.groups.toggleGroup(id),
    toggleSelection: (id) => this.runGroupAction(() => this.groups.toggleGroupSelection(id)),
    toggleFixed: (id) => this.runGroupAction(() => this.groups.handleToggleFixedGroup(id)),
    toggleFavorite: (id) => this.runGroupAction(() => this.groups.handleToggleFavoriteGroup(id)),
    editTitle: (id) => this.runGroupAction(() => this.groups.startEditingGroupTitle(id)),
    saveTitle: (id) => this.runGroupAction(() => this.groups.handleSaveGroupTitle(id)),
    cancelEdit: () => this.runGroupAction(() => { this.groups.stopEditingGroupTitle(); this.render(); }),
    changeTitle: (id, title) => {
      if (id === this.state.editingGroupId) this.state.editingGroupTitle = title;
    },
    restoreGroup: (id) => this.runGroupAction(() => this.restore.handleRestore(id)),
    copyGroup: (id) => this.runGroupAction(() => this.groups.handleCopyGroup(id)),
    deleteGroup: (id) => this.runGroupAction(() => this.groups.handleDeleteGroup(id)),
    openTab: (id) => this.runGroupAction(() => this.restore.handleOpenTab(id))
  };

  private runGroupAction(action: () => void | Promise<void>) {
    if (!isDashboardBusy(this.state)) return action();
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
    this.cancelPendingSearchRender();
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
    if (!(target instanceof Element)) {
      return;
    }

    const actionTarget = target.closest<HTMLElement>('[data-action]');
    if (!actionTarget || !this.root.contains(actionTarget)) {
      return;
    }

    const action = actionTarget.dataset.action;
    const busy = isDashboardBusy(this.state);
    if (busy && !['set-group-filter', 'toggle-favorite-only', 'show-more-groups'].includes(action ?? '')) return;
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
