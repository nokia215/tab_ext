import type { AppConfig, TabGroup } from '../shared/types';

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

export function renderGroups(groups: TabGroup[]) {
  const root = document.getElementById('groups');
  const empty = document.getElementById('groups-empty');
  if (!root || !empty) return;

  root.innerHTML = '';
  empty.style.display = groups.length === 0 ? 'block' : 'none';

  for (const group of groups) {
    const wrapper = document.createElement('div');
    wrapper.className = 'group';
    wrapper.innerHTML = `
      <div class="group-title">${group.title ?? '(untitled)'}</div>
      <div class="meta">${group.created_at} / ${group.tabs.length} tabs</div>
    `;
    root.appendChild(wrapper);
  }
}