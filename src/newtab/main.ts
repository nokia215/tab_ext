import './style.css';
import { filterGroups } from '../shared/search';
import {
  deleteGroup,
  deleteSavedTab,
  getCurrentUser,
  listGroups,
  markGroupRestored
} from '../shared/supabase';
import { openSavedTab, restoreTabs } from '../shared/tabs';
import type { TabGroup } from '../shared/types';

let allGroups: TabGroup[] = [];
let currentQuery = '';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function render(groups: TabGroup[]) {
  const root = document.getElementById('page-groups');
  const empty = document.getElementById('page-groups-empty');
  if (!root || !empty) return;

  root.innerHTML = '';
  empty.style.display = groups.length === 0 ? 'block' : 'none';

  for (const group of groups) {
    const card = document.createElement('section');
    card.className = 'group-card';

    const tabsHtml = group.tabs
      .map(
        (tab) => `
          <button type="button" class="tab-row tab-row-button" data-action="open-tab" data-tab-id="${tab.id}" data-tab-url="${tab.url}">
            <div class="tab-row-title">${tab.title || '(no title)'}</div>
            <div class="tab-row-url">${tab.url}</div>
          </button>
        `
      )
      .join('');

    card.innerHTML = `
      <div class="group-card-header">
        <div>
          <div class="group-card-title">${group.title ?? '(untitled)'}</div>
          <div class="group-card-meta">${formatDate(group.created_at)} / ${group.tabs.length} tabs / ${group.device_id}</div>
        </div>
        <div class="row">
          <button data-action="restore" data-group-id="${group.id}">全部復元</button>
          <button data-action="delete-group" data-group-id="${group.id}" class="ghost">グループ削除</button>
        </div>
      </div>
      <div class="group-card-tabs">${tabsHtml}</div>
    `;

    root.appendChild(card);
  }

  root.querySelectorAll<HTMLButtonElement>('button[data-action="restore"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const group = groups.find((item) => item.id === button.dataset.groupId);
      if (!group) return;
      await restoreTabs(group.tabs.map((tab) => tab.url));
      await markGroupRestored(group.id);
      await refresh();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-action="delete-group"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const group = groups.find((item) => item.id === button.dataset.groupId);
      if (!group) return;
      await deleteGroup(group.id);
      await refresh();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('button[data-action="open-tab"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const tabId = button.dataset.tabId;
      const url = button.dataset.tabUrl;
      if (!tabId || !url) return;
      await openSavedTab(url);
      await deleteSavedTab(tabId);
      await refresh();
    });
  });
}

function renderFiltered() {
  render(filterGroups(allGroups, currentQuery));
}

async function refresh() {
  try {
    const user = await getCurrentUser();
    setText('page-auth-status', user ? `ログイン中: ${user.email}` : '未ログイン');
    allGroups = await listGroups();
    renderFiltered();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('page-auth-status', `表示失敗: ${message}`);
    allGroups = [];
    renderFiltered();
  }
}

const searchInput = document.getElementById('page-group-search') as HTMLInputElement | null;
searchInput?.addEventListener('input', () => {
  currentQuery = searchInput.value;
  renderFiltered();
});

document.getElementById('page-refresh-btn')?.addEventListener('click', () => {
  void refresh();
});

void refresh();