
export enum Section {
  DASHBOARD = 'dashboard',
  WATER = 'water',
  SALES = 'sales',
  HISTORY = 'history',
  SETTINGS = 'settings'
}

export interface CoinData {
  p1: number;
  p5: number;
  p10: number;
}

export interface HistoryEntry {
  id: string;
  date: string;
  p1: number;
  p5: number;
  p10: number;
  total: number;
}

export interface VendoState {
  coins: CoinData;
  waterLevel: number;
  systemAlerts: string;
  lastUpdated: string;
  history: HistoryEntry[];
}
