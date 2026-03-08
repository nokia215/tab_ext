import './style.css';

import {
  listGroups,
  markGroupArchived,
  markGroupRestored,
  getCurrentUser
} from '../shared/supabase';

import { restoreTabs } from '../shared/tabs';
import type { TabGroup } from '../shared/types';

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
          <div class="tab-row">
            <div class="tab-row-title">${tab.title || '(no title)'}</div>
            <div class="tab-row-url">${tab.url}</div>
          </div>
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
          <button data-action="restore" data-group-id="${group.id}">復元</button>
          <button data-action="archive" data-group-id="${group.id}" class="ghost">アーカイブ</button>
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

  root.querySelectorAll<HTMLButtonElement>('button[data-action="archive"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const group = groups.find((item) => item.id === button.dataset.groupId);
      if (!group) return;
      await markGroupArchived(group.id);
      await refresh();
    });
  });
}

async function refresh() {
  try {
    const user = await getCurrentUser();
    setText('page-auth-status', user ? `ログイン中: ${user.email}` : '未ログイン');
    const groups = await listGroups();
    render(groups);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setText('page-auth-status', `表示失敗: ${message}`);
    render([]);
  }
}

document.getElementById('page-refresh-btn')?.addEventListener('click', () => {
  void refresh();
});

void refresh();