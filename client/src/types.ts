export type AssetType = 'BOND' | 'STOCK' | 'CASH' | 'FUND' | 'COMMODITY' | 'UNKNOWN';

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
  current_price_eur: number | null;
  average_price_eur: number | null;
  marketValue: number;
  marketValueOriginal: number;
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
  current_price_eur: number | null;
  average_price_eur: number | null;
  price_date: string | null;
}

export interface PortfolioResponse {
  positions: PositionItem[];
  priceDate: string | null;
  availableCash: number | null;
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
  /** Errori per-record restituiti dal backend (presente solo se ce ne sono) */
  errors?: string[];
  /** Messaggio di errore generico (risposte 4xx/5xx del backend) */
  error?: string;
  /** Dettaglio dell'errore (es. motivo del rifiuto del CSV) */
  details?: string;
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

/** Dati IRR (Internal Rate of Return) per un singolo asset */
export interface AssetIRRData {
  irr: number;              // Decimal return (es. 0,0847 = +8,47%)
  years: number;            // Durata in anni decimali
  firstDate: string;        // Data primo flusso
  lastDate: string;         // Data ultimo flusso
}

export interface AssetTypeInfo {
  name: string;
  isTargetable: boolean;
}

export interface AssetTypesResponse {
  assetTypes: AssetTypeInfo[];
}

export interface AllocationCategory {
  assetType: string;
  value: number;
  percent: number;
}

export interface CurrentAllocationResponse {
  totalValue: number;
  categories: AllocationCategory[];
  unknownAssets: number;
}

export interface AllocationTargetItem {
  assetType: string;
  targetPercent: number;
}

export interface AllocationTargetResponse {
  tolerance: number;
  targets: AllocationTargetItem[];
}

export interface DivergenceItem {
  assetType: string;
  currentPercent: number;
  targetPercent: number;
  divergencePercent: number;
  divergenceAmount: number;
}

export interface RebalanceSuggestion {
  assetType: string;
  action: 'BUY' | 'SELL';
  amount: number;
  divergencePercent: number;
}

export interface RebalanceResponse {
  tolerance: number;
  divergences: DivergenceItem[];
  suggestions: RebalanceSuggestion[];
}

export interface ExchangeRateResponse {
  date: string;
  rates: Record<string, number>;
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
    bookValueEUR: number | null;
    currentValueEUR: number | null;
    pnlEUR: number | null;
    allocationPercent: number | null;
    allocationTypePercent: number | null;
  };
  orders: AssetDetailOrder[];
  dividends: AssetDetailDividend[];
  coupons: AssetDetailDividend[];
  irr: AssetIRRData | null;
}
