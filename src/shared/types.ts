export interface AppConfig {
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
  is_favorite?: boolean | null;
  device_id: string;
  tabs: SavedTab[];
}
