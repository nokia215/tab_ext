import { storageLocalGet, storageLocalSet } from './browser-api';
import type { AppConfig } from './types';

const KEYS = {
  SUPABASE_URL: 'supabase_url',
  SUPABASE_KEY: 'supabase_key',
  DEVICE_ID: 'device_id'
} as const;

export async function getConfig(): Promise<AppConfig> {
  const result = await storageLocalGet([
    KEYS.SUPABASE_URL,
    KEYS.SUPABASE_KEY
  ]);

  return {
    supabaseUrl: (result as Record<string, string>)[KEYS.SUPABASE_URL] ?? '',
    supabaseKey: (result as Record<string, string>)[KEYS.SUPABASE_KEY] ?? '',
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await storageLocalSet({
    [KEYS.SUPABASE_URL]: config.supabaseUrl,
    [KEYS.SUPABASE_KEY]: config.supabaseKey
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  const result = await storageLocalGet(KEYS.DEVICE_ID);
  const current = (result as Record<string, string>)[KEYS.DEVICE_ID];
  if (current) return current;

  const id = crypto.randomUUID();
  await storageLocalSet({ [KEYS.DEVICE_ID]: id });
  return id;
}