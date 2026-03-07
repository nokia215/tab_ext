import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from './storage';
import { storageLocalGet, storageLocalSet, storageLocalRemove } from './browser-api';
import type { TabGroup } from './types';

function createExtensionStorageAdapter() {
  return {
    getItem: async (key: string): Promise<string | null> => {
      const result = await storageLocalGet(key);
      return (result as Record<string, string | null>)[key] ?? null;
    },
    setItem: async (key: string, value: string): Promise<void> => {
      await storageLocalSet({ [key]: value });
    },
    removeItem: async (key: string): Promise<void> => {
      await storageLocalRemove(key);
    }
  };
}

let cached: { cacheKey: string; client: SupabaseClient } | null = null;

export async function getSupabase(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseKey } = await getConfig();
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 設定が未入力です。');
  }

  const cacheKey = `${supabaseUrl}::${supabaseKey}`;
  if (cached?.cacheKey === cacheKey) return cached.client;

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: createExtensionStorageAdapter(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  cached = { cacheKey, client };
  return client;
}

export async function signUp(email: string, password: string) {
  const supabase = await getSupabase();
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  const supabase = await getSupabase();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = await getSupabase();
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function listGroups(): Promise<TabGroup[]> {
  const supabase = await getSupabase();
  const user = await getCurrentUser();
  if (!user) throw new Error('ログインしてください。');

  const { data, error } = await supabase
    .from('tab_groups')
    .select(`
      id,
      title,
      created_at,
      device_id,
      tabs (
        id,
        url,
        title,
        position,
        status
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((group) => ({
    ...group,
    tabs: [...(group.tabs ?? [])].sort((a, b) => a.position - b.position)
  })) as TabGroup[];
}