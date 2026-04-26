export type SaveStatus = 'saved' | 'restored';

export interface AppConfig {
  supabaseUrl: string;
  supabaseKey: string;
  ignoreDomains: string[];
  ignoreTitles: string[];
}

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  position: number;
  status: SaveStatus;
  restored_at: string | null;
}

export interface TabGroup {
  id: string;
  title: string | null;
  created_at: string;
  archived_at: string | null;
  device_id: string;
  tabs: SavedTab[];
}
