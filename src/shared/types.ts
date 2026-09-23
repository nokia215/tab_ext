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
}

export interface TabGroup {
  id: string;
  title: string | null;
  created_at: string;
  is_fixed: boolean;
  device_id: string;
  tabs: SavedTab[];
}
