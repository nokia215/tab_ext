import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { storageLocalGet, storageLocalRemove, storageLocalSet } from './browser-api';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './build-config';

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
  const supabaseUrl = SUPABASE_URL;
  const supabaseKey = SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase のビルド設定がありません。');
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

export async function getCurrentSessionUser() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}
