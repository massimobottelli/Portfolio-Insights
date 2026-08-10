export type AssetType = 'ETF' | 'ETC' | 'ETN' | 'STOCK' | 'BOND' | 'FUND' | 'COMMODITY' | 'CASH' | 'UNKNOWN';

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

export interface TWRAnnualItem {
  year: number;
  twr: number;
}

export interface TWRHistoryItem {
  snapshot_date: string;
  twr: number;
}

export interface TWRData {
  twrTotal: number;
  twrYTD: number;
  twrAnnual: TWRAnnualItem[];
  twrHistory: TWRHistoryItem[];
}

export interface ImportResponse {
  success: boolean;
  importSessionId: string;
  recordsImported: number;
  totalRecords: number;
}

export interface CashMovementItem {
  id: string;
  operation_date: string;
  value_date: string;
  movement_type: string;
  euro_amount: number;
  currency: string;
  protocol: string | null;
  order_reference: string | null;
  asset_id: string | null;
  isin: string | null;
  ticker: string | null;
  asset_name: string | null;
}

export interface MovementsResponse {
  data: CashMovementItem[];
  total: number;
}

export interface AssetDetailOrder {
  date: string;
  valueDate: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number | null;
  amount: number;
  currency: string;
  reference: string | null;
}

export interface AssetDetailDividend {
  date: string;
  amount: number;
  currency: string;
}

export interface AssetDetailData {
  asset: {
    id: string;
    isin: string;
    ticker: string;
    name: string;
    assetType: string;
    currency: string;
  };
  position: {
    quantity: number;
    currentPrice: number | null;
    priceDate: string | null;
    averagePrice: number | null;
    bookValue: number | null;
    currentValue: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    allocationPercent: number | null;
    allocationTypePercent: number | null;
  };
  orders: AssetDetailOrder[];
  dividends: AssetDetailDividend[];
  coupons: AssetDetailDividend[];
}
