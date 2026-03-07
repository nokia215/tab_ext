import { storageLocalGet, storageLocalSet } from './browser-api.js';

const KEYS = {
  SUPABASE_URL: 'supabase_url',
  SUPABASE_KEY: 'supabase_key',
  DEVICE_ID: 'device_id'
};

export async function getConfig() {
  const result = await storageLocalGet([
    KEYS.SUPABASE_URL,
    KEYS.SUPABASE_KEY
  ]);

  return {
    supabaseUrl: result[KEYS.SUPABASE_URL] ?? '',
    supabaseKey: result[KEYS.SUPABASE_KEY] ?? ''
  };
}

export async function saveConfig({ supabaseUrl, supabaseKey }) {
  await storageLocalSet({
    [KEYS.SUPABASE_URL]: supabaseUrl,
    [KEYS.SUPABASE_KEY]: supabaseKey
  });
}

export async function getOrCreateDeviceId() {
  const result = await storageLocalGet(KEYS.DEVICE_ID);
  if (result[KEYS.DEVICE_ID]) return result[KEYS.DEVICE_ID];

  const id = crypto.randomUUID();
  await storageLocalSet({ [KEYS.DEVICE_ID]: id });
  return id;
}