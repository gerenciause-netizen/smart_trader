
export interface Transaction {
  id: string;
  header: string;
  date: string;
  account: string;
  description: string;
  transaction_type: string;
  symbol: string;
  quantity: number;
  price: number;
  gross_amount: number;
  commission: number;
  net_amount: number;
  strategy: string;
  account_label: 'demo' | 'real';
  created_at?: string;
  analysis_image_url?: string;
  analysis_id?: string;
}

export interface StrategyCard {
  id: string;
  user_id: string;
  image_url: string;
  title: string;
  description: string;
  created_at: string;
}

export interface AccountBalance {
  account_label: 'demo' | 'real';
  starting_cash: number;
  updated_at?: string;
}

export interface ConsolidatedTrade {
  symbol: string;
  strategy: string;
  totalQuantity: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  totalPnL: number;
  executions: Transaction[];
  status: 'Open' | 'Closed';
  lastDate: string;
  analysis_image_url?: string;
  analysis_id?: string;
}

export type ViewType = 'dashboard' | 'transactions' | 'import' | 'ai-insights' | 'chart-analysis' | 'strategy-library';
export type AccountType = 'demo' | 'real';

export interface PerformanceStats {
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  bestStrategy: string;
  avgWin: number;
  avgLoss: number;
}
