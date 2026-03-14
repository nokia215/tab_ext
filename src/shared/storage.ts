import { storageLocalGet, storageLocalSet } from './browser-api';
import type { AppConfig } from './types';

const KEYS = {
  SUPABASE_URL: 'supabase_url',
  SUPABASE_KEY: 'supabase_key',
  DEVICE_ID: 'device_id',
  IGNORE_DOMAINS: 'ignore_domains',
  IGNORE_TITLES: 'ignore_titles'
} as const;

let cachedConfig: AppConfig | null = null;

function detectBrowserName(userAgent: string): string {
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Safari/')) return 'Safari';
  return 'Browser';
}

function detectPlatformName(userAgent: string): string {
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  return 'Device';
}

function buildDeviceLabel(seed: string): string {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const browser = detectBrowserName(userAgent);
  const platform = detectPlatformName(userAgent);
  const suffix = seed.replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${browser} ${platform} · ${suffix}`;
}

function isLegacyDeviceId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeLines(value: string[] | undefined): string[] {
  return (value ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return {
      ...cachedConfig,
      ignoreDomains: [...cachedConfig.ignoreDomains],
      ignoreTitles: [...cachedConfig.ignoreTitles]
    };
  }

  const result = await storageLocalGet([
    KEYS.SUPABASE_URL,
    KEYS.SUPABASE_KEY,
    KEYS.IGNORE_DOMAINS,
    KEYS.IGNORE_TITLES
  ]);

  const r = result as Record<string, string | string[] | undefined>;

  cachedConfig = {
    supabaseUrl: (r[KEYS.SUPABASE_URL] as string) ?? '',
    supabaseKey: (r[KEYS.SUPABASE_KEY] as string) ?? '',
    ignoreDomains: normalizeLines(r[KEYS.IGNORE_DOMAINS] as string[] | undefined),
    ignoreTitles: normalizeLines(r[KEYS.IGNORE_TITLES] as string[] | undefined)
  };

  return {
    ...cachedConfig,
    ignoreDomains: [...cachedConfig.ignoreDomains],
    ignoreTitles: [...cachedConfig.ignoreTitles]
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await storageLocalSet({
    [KEYS.SUPABASE_URL]: config.supabaseUrl,
    [KEYS.SUPABASE_KEY]: config.supabaseKey,
    [KEYS.IGNORE_DOMAINS]: config.ignoreDomains,
    [KEYS.IGNORE_TITLES]: config.ignoreTitles
  });

  cachedConfig = {
    ...config,
    ignoreDomains: [...config.ignoreDomains],
    ignoreTitles: [...config.ignoreTitles]
  };
}

export async function getOrCreateDeviceId(): Promise<string> {
  const result = await storageLocalGet(KEYS.DEVICE_ID);
  const current = (result as Record<string, string>)[KEYS.DEVICE_ID];
  if (current) {
    if (!isLegacyDeviceId(current)) {
      return current;
    }

    const migrated = buildDeviceLabel(current);
    await storageLocalSet({ [KEYS.DEVICE_ID]: migrated });
    return migrated;
  }

  const id = buildDeviceLabel(crypto.randomUUID());
  await storageLocalSet({ [KEYS.DEVICE_ID]: id });
  return id;
}
