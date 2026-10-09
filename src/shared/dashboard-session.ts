import { startDashboardAutoSync } from './auto-sync';
import { configFromFormFields, configToFormFields } from './config-form';
import { hasSupabaseConfig } from './build-config';
import { hidePendingTabs, retryPendingConsumption } from './restoration';
import { getCachedGroups, getConfig, saveCachedGroups, saveConfig } from './storage';
import { getCurrentSessionUser, getFavoriteGroupIds, listGroups, signIn, signOut } from './supabase';
import { getErrorMessage } from './status';
import type { DashboardState } from './dashboard-model';
import { isDashboardBusy } from './dashboard-model';
import type { DashboardGroups } from './dashboard-groups';
import type { AppConfig } from './types';

// Authentication, settings and cache-first loading; rendering stays with the page.
export class DashboardSession {
  private cacheUserId: string | null = null;
  private cacheTimer: number | null = null;
  private refreshRevision = 0;

  constructor(
    private readonly state: DashboardState,
    private readonly render: () => void,
    private readonly groups: DashboardGroups
  ) {}

  async bootstrap(root: HTMLElement) {
    root.addEventListener('submit', (event) => {
      if (!(event.target instanceof HTMLFormElement) || event.target.name !== 'sign-in') return;
      event.preventDefault();
      if (!isDashboardBusy(this.state)) void this.handleSignIn();
    });
    await this.refreshAll();
    startDashboardAutoSync(root, this.state, () => this.cacheUserId, this.render, async () => {
      this.cacheUserId = null;
      if (this.cacheTimer !== null) window.clearTimeout(this.cacheTimer);
      this.cacheTimer = null;
      await this.refreshAll(true);
    });
  }

  scheduleCacheSave() {
    if (this.cacheUserId) {
      if (this.cacheTimer !== null) window.clearTimeout(this.cacheTimer);
      const userId = this.cacheUserId;
      const groups = this.state.allGroups;
      const favorites = this.state.favoriteGroupIds;
      this.cacheTimer = window.setTimeout(() => {
        this.cacheTimer = null;
        void saveCachedGroups(userId, groups, favorites).catch(() => {});
      }, 200);
    }
  }

  setConfigFields(next: AppConfig) {
    Object.assign(this.state, configToFormFields(next));
  }

  async refreshAll(force = false) {
    if (!force && (this.state.actionBusy || this.state.refreshBusy || this.state.restoreBusy)) return;
    const revision = ++this.refreshRevision;
    const sessionRevision = this.state.sessionRevision;
    const current = () => revision === this.refreshRevision && sessionRevision === this.state.sessionRevision;
    this.state.refreshBusy = true;
    this.render();

    try {
      const nextConfig = await getConfig();
      if (!current()) return;
      this.setConfigFields(nextConfig);

      if (!hasSupabaseConfig()) {
        this.state.authStatus = 'アプリのSupabase接続設定を確認できません。';
        this.state.pageStatus = '設定が未完了です。';
        this.state.favoriteGroupIds = [];
        this.state.allGroups = [];
        this.state.selectedGroupIds = [];
        this.state.expandedGroupIds = [];
        this.groups.stopEditingGroupTitle();
        this.groups.resetVisibleGroupCount();
        return;
      }

      const user = await getCurrentSessionUser();
      if (!current()) return;
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';

      if (!user) {
        this.cacheUserId = null;
        this.state.syncStatus = '';
        this.state.favoriteGroupIds = [];
        this.state.allGroups = [];
        this.state.selectedGroupIds = [];
        this.state.expandedGroupIds = [];
        this.groups.stopEditingGroupTitle();
        this.state.pageStatus = 'ログインすると保存済みグループを表示します。';
        this.groups.resetVisibleGroupCount();
        return;
      }

      this.cacheUserId = user.id;
      const cached = await getCachedGroups(user.id);
      if (!current()) return;
      if (cached) {
        this.state.allGroups = cached.groups;
        this.state.favoriteGroupIds = cached.favorites;
        this.groups.reconcileExpandedGroupIds(this.state.allGroups);
        this.groups.reconcileSelectedGroupIds(this.state.allGroups);
        this.state.pageStatus = `${cached.groups.length} グループを表示中（同期中）`;
        this.render();
      }

      const pending = await retryPendingConsumption();
      const favorites = await getFavoriteGroupIds(user.id);
      const groups = await listGroups(user.id);
      if (!current() || (await getCurrentSessionUser())?.id !== user.id) return;
      if (!current()) return;
      this.state.favoriteGroupIds = favorites;
      const expandedGroupIds = [...this.state.expandedGroupIds];
      this.state.allGroups = hidePendingTabs(groups, pending.pendingTabIds);
      this.state.expandedGroupIds = expandedGroupIds;
      this.groups.reconcileExpandedGroupIds(this.state.allGroups);
      this.groups.reconcileSelectedGroupIds(this.state.allGroups);
      if (this.state.editingGroupId && !this.groups.findGroup(this.state.editingGroupId)) {
        this.groups.stopEditingGroupTitle();
      }
      this.state.syncStatus = `最終同期: ${new Date().toLocaleTimeString('ja-JP')}`;
      this.state.pageStatus = pending.error ?? `${this.state.allGroups.length} グループを表示中`;
      this.groups.resetVisibleGroupCount();
      return true;
    } catch (error) {
      if (!current()) return;
      const message = getErrorMessage(error);
      this.state.authStatus = `表示失敗: ${message}`;
      this.state.pageStatus = 'データを読み込めませんでした。';
      this.groups.stopEditingGroupTitle();
      this.groups.resetVisibleGroupCount();
    } finally {
      if (revision === this.refreshRevision) {
        this.state.refreshBusy = false;
        this.render();
      }
    }
  }

  async handleSaveConfig() {
    this.state.configBusy = true;
    this.render();

    try {
      const next = configFromFormFields(this.state);
      await saveConfig(next);
      this.setConfigFields(next);
      this.state.pageStatus = '設定を保存しました。';
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.groups.stopEditingGroupTitle();
      await this.refreshAll();
    } catch (error) {
      this.state.pageStatus = `設定保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.configBusy = false;
      this.render();
    }
  }

  async handleSignIn() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signIn(this.state.email.trim(), this.state.password);
      if (error) throw error;
      this.state.sessionRevision += 1;
      this.state.password = '';
      this.state.saveGroupId = '';
      this.cacheUserId = null;
      this.state.authStatus = 'ログインしました。';
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.groups.stopEditingGroupTitle();
      await this.refreshAll();
    } catch (error) {
      this.state.authStatus = `ログイン失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  async handleSignOut() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signOut();
      if (error) throw error;
      this.state.sessionRevision += 1;
      this.state.password = '';
      this.state.saveGroupId = '';
      this.cacheUserId = null;
      this.state.authStatus = 'ログアウトしました。';
      this.state.allGroups = [];
      this.state.favoriteGroupIds = [];
      this.state.selectedGroupIds = [];
      this.state.expandedGroupIds = [];
      this.groups.stopEditingGroupTitle();
      await this.refreshAll();
    } catch (error) {
      this.state.authStatus = `ログアウト失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

}
