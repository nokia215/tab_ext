export type SaveStatus = 'saved' | 'restored' | 'archived';

export interface AppConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  position: number;
  status: SaveStatus;
}

export interface TabGroup {
  id: string;
  title: string | null;
  created_at: string;
  device_id: string;
  tabs: SavedTab[];
}