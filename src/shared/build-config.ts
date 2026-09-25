export const SUPABASE_URL = 'https://zcdpmrhwlblvweuhcpat.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_b-qdOOWDhZBHKgbtEYN-ww_lltW2DY8';

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}
