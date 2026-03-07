import './style.css';

document.getElementById('save-config-btn')?.addEventListener('click', async () => {
  const supabaseUrl = (document.getElementById('supabase-url') as HTMLInputElement).value.trim();
  const supabaseKey = (document.getElementById('supabase-key') as HTMLTextAreaElement).value.trim();

  await chrome.storage.local.set({
    supabase_url: supabaseUrl,
    supabase_key: supabaseKey
  });

  const el = document.getElementById('auth-status');
  if (el) el.textContent = '設定を保存しました。';
});