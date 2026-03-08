import type { AppConfig, SavedTab, TabGroup } from '../shared/types';

export function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

export function setConfigInputs(config: AppConfig) {
  (document.getElementById('supabase-url') as HTMLInputElement).value = config.supabaseUrl;
  (document.getElementById('supabase-key') as HTMLTextAreaElement).value = config.supabaseKey;
}

export function getConfigInputs(): AppConfig {
  return {
    supabaseUrl: (document.getElementById('supabase-url') as HTMLInputElement).value.trim(),
    supabaseKey: (document.getElementById('supabase-key') as HTMLTextAreaElement).value.trim()
  };
}

export function getAuthInputs() {
  return {
    email: (document.getElementById('email') as HTMLInputElement).value.trim(),
    password: (document.getElementById('password') as HTMLInputElement).value
  };
}

export function getGroupTitleInput(): string {
  return (document.getElementById('group-title') as HTMLInputElement).value.trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

export function renderGroups(
  groups: TabGroup[],
  handlers: {
    onRestore: (group: TabGroup) => Promise<void>;
    onDeleteGroup: (group: TabGroup) => Promise<void>;
    onOpenTab: (tab: SavedTab) => Promise<void>;
  }
) {
  const root = document.getElementById('groups');
  const empty = document.getElementById('groups-empty');
  if (!root || !empty) return;

  root.innerHTML = '';
  empty.style.display = groups.length === 0 ? 'block' : 'none';

  for (const group of groups) {
    const wrapper = document.createElement('div');
    wrapper.className = 'group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const info = document.createElement('div');
    info.innerHTML = `
      <div class="group-title">${group.title ?? '(untitled)'}</div>
      <div class="meta">${formatDate(group.created_at)} / ${group.tabs.length} tabs / ${group.device_id}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'row';

    const restoreBtn = document.createElement('button');
    restoreBtn.textContent = '全部復元';
    restoreBtn.addEventListener('click', () => void handlers.onRestore(group));

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'グループ削除';
    deleteBtn.className = 'ghost';
    deleteBtn.addEventListener('click', () => void handlers.onDeleteGroup(group));

    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    header.appendChild(info);
    header.appendChild(actions);

    const list = document.createElement('div');
    list.className = 'tab-list';

    for (const tab of group.tabs) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'tab-item tab-item-button';
      item.innerHTML = `
        <div class="tab-title">${tab.title || '(no title)'}</div>
        <div class="tab-url">${tab.url}</div>
      `;
      item.addEventListener('click', () => void handlers.onOpenTab(tab));
      list.appendChild(item);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(list);
    root.appendChild(wrapper);
  }
}