import { importTabGroups } from './import';
import { requestActiveTab, requestCurrentWindowTabs } from './messages';
import { formatImportStatus, getErrorMessage } from './status';
import { getOrCreateDeviceId } from './storage';
import { saveTabGroup } from './supabase';
import type { DashboardState } from './dashboard-model';

// Saving browser tabs and imported URLs into the selected destination.
export class DashboardSave {
  constructor(
    private readonly state: DashboardState,
    private readonly render: () => void,
    private readonly refreshAll: () => Promise<boolean | undefined>
  ) {}

  async saveTabs(tabs: chrome.tabs.Tab[]) {
    const deviceId = await getOrCreateDeviceId();
    const result = await saveTabGroup({
      title: this.state.groupTitle,
      groupId: this.state.saveGroupId,
      deviceId,
      tabs
    });

    this.state.saveStatus = `${result.count} 件保存しました。${result.duplicateCount ? ` ${result.duplicateCount} 件の重複タブをスキップしました。` : ''}`;
    await this.refreshAll();
  }

  async handleImportTabs() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy || this.state.importBusy) return;

    this.state.importBusy = true;
    this.render();

    try {
      const { importedGroupCount, importedTabCount, skippedLineCount, duplicateCount } = await importTabGroups({
        groupTitle: this.state.groupTitle,
        groupId: this.state.saveGroupId,
        importText: this.state.importText
      });

      this.state.importText = '';
      this.state.saveStatus = formatImportStatus(importedGroupCount, importedTabCount, skippedLineCount, duplicateCount);
      await this.refreshAll();
    } catch (error) {
      this.state.saveStatus = `インポート失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.importBusy = false;
      this.render();
    }
  }

  async handleSaveWindow() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveWindowBusy = true;
    this.render();

    try {
      await this.saveTabs(await requestCurrentWindowTabs());
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.saveWindowBusy = false;
      this.render();
    }
  }

  async handleSaveTab() {
    if (this.state.saveWindowBusy || this.state.saveTabBusy) return;

    this.state.saveTabBusy = true;
    this.render();

    try {
      const tab = await requestActiveTab();
      if (!tab) throw new Error('現在タブが取得できません。');
      await this.saveTabs([tab]);
    } catch (error) {
      this.state.saveStatus = `保存失敗: ${getErrorMessage(error)}`;
    } finally {
      this.state.saveTabBusy = false;
      this.render();
    }
  }

}
