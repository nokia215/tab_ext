function formatDate(iso) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso));
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener('click', onClick);
  return button;
}

export function setText(id, value) {
  document.getElementById(id).textContent = value;
}

export function setConfigInputs(config) {
  document.getElementById('supabase-url').value = config.supabaseUrl ?? '';
  document.getElementById('supabase-key').value = config.supabaseKey ?? '';
}

export function getConfigInputs() {
  return {
    supabaseUrl: document.getElementById('supabase-url').value.trim(),
    supabaseKey: document.getElementById('supabase-key').value.trim()
  };
}

export function getAuthInputs() {
  return {
    email: document.getElementById('email').value.trim(),
    password: document.getElementById('password').value
  };
}

export function getGroupTitleInput() {
  return document.getElementById('group-title').value.trim();
}

export function renderGroups(groups, handlers) {
  const root = document.getElementById('groups');
  const empty = document.getElementById('groups-empty');
  root.innerHTML = '';

  if (!groups || groups.length === 0) {
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  for (const group of groups) {
    const wrapper = document.createElement('div');
    wrapper.className = 'group';

    const header = document.createElement('div');
    header.className = 'group-header';

    const left = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'group-title';
    title.textContent = group.title || '(untitled)';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${formatDate(group.created_at)} / ${group.tabs.length} tabs / ${group.device_id}`;

    left.appendChild(title);
    left.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'row';
    actions.appendChild(
      createButton('復元', '', () => handlers.onRestore(group))
    );
    actions.appendChild(
      createButton('アーカイブ', 'ghost', () => handlers.onArchive(group))
    );

    header.appendChild(left);
    header.appendChild(actions);

    const list = document.createElement('div');
    list.className = 'tab-list';

    for (const tab of group.tabs) {
      const item = document.createElement('div');
      item.className = 'tab-item';

      const tabTitle = document.createElement('div');
      tabTitle.className = 'tab-title';
      tabTitle.textContent = tab.title || '(no title)';

      const tabUrl = document.createElement('div');
      tabUrl.className = 'tab-url';
      tabUrl.textContent = `${tab.status} - ${tab.url}`;

      item.appendChild(tabTitle);
      item.appendChild(tabUrl);
      list.appendChild(item);
    }

    wrapper.appendChild(header);
    wrapper.appendChild(list);
    root.appendChild(wrapper);
  }
}