import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getConfig } from './storage.js';
import {
  storageLocalGet,
  storageLocalSet,
  storageLocalRemove
} from './browser-api.js';

function createExtensionStorageAdapter() {
  return {
    getItem: async (key) => {
      const result = await storageLocalGet(key);
      return result[key] ?? null;
    },
    setItem: async (key, value) => {
      await storageLocalSet({ [key]: value });
    },
    removeItem: async (key) => {
      await storageLocalRemove(key);
    }
  };
}

let cached = null;

export async function getSupabase() {
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