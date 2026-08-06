export interface DashboardData {
  portfolioValue: number;
  investedCapital: number;
  availableCash: number;
  totalProfitLoss: number;
  totalProfitLossPercent: number;
  totalPositions: number;
  snapshotDate: string | null;
}

export interface AllocationItem {
  asset_id: string;
  isin: string;
  ticker: string;
  name: string;
  currency: string;
  asset_type: string;
  quantity: number;
  current_price: number;
  average_price: number;
  price_date: string;
  marketValue: number;
  allocationPercent: number;
}

export interface PositionItem {
  asset_id: string;
  isin: string;
  ticker: string;
  name: string;
  currency: string;
  asset_type: string;
  quantity: number;
  current_price: number | null;
  average_price: number | null;
  price_date: string | null;
}

export interface PortfolioResponse {
  positions: PositionItem[];
  priceDate: string | null;
}

export interface ImportSession {
  id: string;
  filename: string;
  import_date: string;
  status: 'SUCCESS' | 'FAILED';
  records_imported: number;
  errors: string | null;
}

export interface SnapshotItem {
  snapshot_date: string;
  portfolio_value: number;
  available_cash: number;
  invested_capital: number;
  cumulative_deposits: number;
}

export interface ImportResponse {
  success: boolean;
  importSessionId: string;
  recordsImported: number;
  totalRecords: number;
}
