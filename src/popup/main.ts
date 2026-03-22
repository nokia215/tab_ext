import '../shared/ui.css';
import '../shared/panels.css';
import './popup.css';
import { createTab, getRuntimeUrl, runtimeSendMessage } from '../shared/browser-api';
import { lineListToText, textToLineList } from '../shared/format';
import { summarizeGroupCollection } from '../shared/group-summary';
import { importTabGroups } from '../shared/import';
import type { PopupActionMessage, PopupActionResponse } from '../shared/messages';
import { formatImportStatus, getErrorMessage } from '../shared/status';
import { getConfig, getOrCreateDeviceId, saveConfig } from '../shared/storage';
import {
  getCurrentSessionUser,
  listGroups,
  saveTabGroup,
  signIn,
  signOut,
  signUp
} from '../shared/supabase';
import type { AppConfig } from '../shared/types';
import { createInitialPopupState, type PopupState } from './model';
import { renderPopupView } from './view';

class PopupApp {
  private readonly root: HTMLElement;
  private state = createInitialPopupState();

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.addEventListener('click', (event) => {
      void this.handleClick(event);
    });
    this.root.addEventListener('input', (event) => {
      this.handleInput(event);
    });
    this.root.addEventListener('toggle', (event) => {
      this.handleToggle(event);
    });
  }

  async bootstrap() {
    this.state.refreshBusy = true;
    this.render();

    try {
      this.setConfigFields(await getConfig());
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private get summary() {
    return summarizeGroupCollection(this.state.allGroups);
  }

  private get setupComplete() {
    return Boolean(this.state.config.supabaseUrl && this.state.config.supabaseKey);
  }

  private get signedIn() {
    return this.state.authStatus.startsWith('ログイン中:');
  }

  private setConfigFields(next: AppConfig) {
    this.state.config = next;
    this.state.ignoreDomainsText = lineListToText(next.ignoreDomains);
    this.state.ignoreTitlesText = lineListToText(next.ignoreTitles);
  }

  private configPayload(): AppConfig {
    return {
      supabaseUrl: this.state.config.supabaseUrl.trim(),
      supabaseKey: this.state.config.supabaseKey.trim(),
      ignoreDomains: textToLineList(this.state.ignoreDomainsText),
      ignoreTitles: textToLineList(this.state.ignoreTitlesText)
    };
  }

  private async refreshAuthStatus() {
    try {
      const user = await getCurrentSessionUser();
      this.state.authStatus = user ? `ログイン中: ${user.email}` : '未ログイン';
    } catch (error) {
      this.state.authStatus = `状態確認失敗: ${getErrorMessage(error)}`;
    }
  }

  private async refreshGroups() {
    try {
      const config = await getConfig();
      if (!config.supabaseUrl || !config.supabaseKey) {
        this.state.allGroups = [];
        return;
      }

      const user = await getCurrentSessionUser();
      if (!user) {
        this.state.allGroups = [];
        return;
      }

      this.state.allGroups = await listGroups(false, user.id);
    } catch (error) {
      console.error('refreshGroups failed', error);
      this.state.allGroups = [];
    }
  }

  private async saveTabs(tabs: chrome.tabs.Tab[]) {
    const deviceId = await getOrCreateDeviceId();
    const result = await saveTabGroup({
      title: this.state.groupTitle,
      deviceId,
      tabs
    });

    this.state.saveStatus = `${result.count} 件保存しました。`;
    await this.refreshGroups();
  }

  private async handleImportTabs() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy || this.state.importBusy) return;

    this.state.importBusy = true;
    this.render();

    try {
      const { importedGroupCount, importedTabCount, skippedLineCount } = await importTabGroups({
        groupTitle: this.state.groupTitle,
        importText: this.state.importText
      });

      this.state.importText = '';
      this.state.saveStatus = formatImportStatus(importedGroupCount, importedTabCount, skippedLineCount);
      await this.refreshGroups();
    } catch (error) {
      this.state.saveStatus = `インポート失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.importBusy = false;
      this.render();
    }
  }

  private async requestCurrentWindowTabs() {
    const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
      type: 'get-current-window-tabs'
    });

    if (!result?.ok || !('tabs' in result)) {
      throw new Error(result?.ok ? 'ウィンドウ内のタブ取得に失敗しました。' : result?.error ?? 'ウィンドウ内のタブ取得に失敗しました。');
    }

    return result.tabs;
  }

  private async requestActiveTab() {
    const result = await runtimeSendMessage<PopupActionMessage, PopupActionResponse>({
      type: 'get-active-tab'
    });

    if (!result?.ok || !('tab' in result)) {
      throw new Error(result?.ok ? '現在タブの取得に失敗しました。' : result?.error ?? '現在タブの取得に失敗しました。');
    }

    return result.tab;
  }

  private async handleSaveConfig() {
    this.state.configBusy = true;
    this.render();

    try {
      const next = this.configPayload();
      await saveConfig(next);
      this.setConfigFields(next);
      this.state.authStatus = '設定を保存しました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `設定保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.configBusy = false;
      this.render();
    }
  }

  private async handleSignUp() {
    this.state.authBusy = true;
    this.render();

    try {
      const { data, error } = await signUp(this.state.email.trim(), this.state.password);
      if (error) throw error;
      this.state.authStatus = data.user && !data.session
        ? '登録しました。確認メールが必要なら確認してください。'
        : '登録しました。';
      await this.refreshAuthStatus();
    } catch (error) {
      this.state.authStatus = `登録失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSignIn() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signIn(this.state.email.trim(), this.state.password);
      if (error) throw error;
      this.state.authStatus = 'ログインしました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `ログイン失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSignOut() {
    this.state.authBusy = true;
    this.render();

    try {
      const { error } = await signOut();
      if (error) throw error;
      this.state.authStatus = 'ログアウトしました。';
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } catch (error) {
      this.state.authStatus = `ログアウト失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.authBusy = false;
      this.render();
    }
  }

  private async handleSaveWindow() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveWindowBusy = true;
    this.render();

    try {
      await this.saveTabs(await this.requestCurrentWindowTabs());
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.saveWindowBusy = false;
      this.render();
    }
  }

  private async handleSaveTab() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveTabBusy = true;
    this.render();

    try {
      const tab = await this.requestActiveTab();
      if (!tab) throw new Error('現在タブが取得できません。');
      await this.saveTabs([tab]);
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.saveTabBusy = false;
      this.render();
    }
  }

  private async handleRefresh() {
    this.state.refreshBusy = true;
    this.render();

    try {
      await this.refreshAuthStatus();
      await this.refreshGroups();
    } finally {
      this.state.refreshBusy = false;
      this.render();
    }
  }

  private async openDashboard() {
    await createTab({ url: getRuntimeUrl('newtab.html'), active: true });
  }

  private render() {
    document.title = 'Tab Saver';
    this.root.innerHTML = renderPopupView({
      state: this.state,
      summary: this.summary,
      setupComplete: this.setupComplete,
      signedIn: this.signedIn
    });
  }

  private handleInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }

    switch (target.name) {
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
      case 'supabaseUrl':
        this.state.config = { ...this.state.config, supabaseUrl: target.value };
        break;
      case 'supabaseKey':
        this.state.config = { ...this.state.config, supabaseKey: target.value };
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

  private handleToggle(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement) || !target.classList.contains('settings-wrap')) {
      return;
    }

    this.state.settingsOpen = target.open;
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
    if (!action) {
      return;
    }

    switch (action) {
      case 'open-dashboard':
        await this.openDashboard();
        break;
      case 'refresh':
        await this.handleRefresh();
        break;
      case 'save-window':
        await this.handleSaveWindow();
        break;
      case 'save-tab':
        await this.handleSaveTab();
        break;
      case 'import-tabs':
        await this.handleImportTabs();
        break;
      case 'save-config':
        await this.handleSaveConfig();
        break;
      case 'sign-up':
        await this.handleSignUp();
        break;
      case 'sign-in':
        await this.handleSignIn();
        break;
      case 'sign-out':
        await this.handleSignOut();
        break;
      default:
        break;
    }
  }
}

const target = document.getElementById('app');

if (!target) {
  throw new Error('Popup root element was not found.');
}

const app = new PopupApp(target);
void app.bootstrap();
