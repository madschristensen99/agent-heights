import { getToken } from "./auth";

const runtimeEnv = (typeof window !== "undefined" && (window as any).__ENV__) || {};
const wsHost = runtimeEnv.VITE_WS_HOST ?? import.meta.env.VITE_WS_HOST as string | undefined;
const isLocal = typeof window !== "undefined" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");

function apiBase(): string {
  if (wsHost && (!wsHost.includes("localhost") || isLocal)) {
    const proto = location.protocol;
    const host = wsHost.replace(/^wss?:\/\//, "").replace(/\/$/, "");
    return `${proto}//${host}`;
  }
  if (isLocal && location.port !== "3001") {
    return `${location.protocol}//localhost:3001`;
  }
  return `${location.protocol}//${location.host}`;
}

async function fetchAdmin(path: string): Promise<any> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface OverviewStats {
  mrr: number;
  arr: number;
  totalUsers: number;
  activeSubscribers: number;
  entrancePaidCount: number;
  dau: number;
  wau: number;
  mau: number;
  totalLlmSpend: number;
  grossMargin: number;
  grossMarginPct: number;
  concurrentUsers: number;
  concurrentAgents: number;
  arpu: number;
}

export interface DailyPoint {
  date: string;
  value: number;
}

export interface UserTimeseries {
  newSignups: DailyPoint[];
  dau: DailyPoint[];
}

export interface RevenueData {
  mrr: number;
  byTier: { tier: string; count: number; mrr: number }[];
  oneTimeRevenue: number;
  entranceFeesCount: number;
  assetUpgradesCount: number;
  churnedMrr: number;
  pastDueCount: number;
  pastDueMrr: number;
  arpu: number;
  history: { month: string; mrr: number }[];
}

export interface UsageStats {
  totalSpend: number;
  dailySpend: DailyPoint[];
  byModel: { model: string; spend: number; calls: number }[];
  byProvider: { provider: string; spend: number; calls: number }[];
  dailyTokens: { date: string; inputTokens: number; outputTokens: number }[];
  dailyCalls: DailyPoint[];
  costPerActiveUser: number;
}

export interface ConversionFunnel {
  totalUsers: number;
  entrancePaid: number;
  subscribed: number;
  entranceConversionPct: number;
  subscriptionConversionPct: number;
  overallConversionPct: number;
  tierDistribution: { tier: string; count: number }[];
}

export interface SubscriptionRow {
  email: string;
  tier: string;
  status: string;
  currentPeriodEnd: number | null;
  createdAt: string;
}

export interface RealtimeStats {
  onlineUsers: number;
  activeAgents: number;
  agentsByStatus: { status: string; count: number }[];
}

export interface EngagementStats {
  assetUpgrades: number;
  marketplaceAgents: number;
  organizations: number;
  scheduledTasks: number;
}

export interface FinancialMetrics {
  mrr: number;
  oneTimeRevenue: number;
  totalRevenue: number;
  llmSpend: number;
  grossProfit: number;
  grossMarginPct: number;
  fixedCosts: number;
  ebitda: number;
  ebitdaMarginPct: number;
  netProfit: number;
  burnRate: number;
  dailyPnl: { date: string; revenue: number; spend: number; pnl: number }[];
}

export const adminApi = {
  overview: () => fetchAdmin("/api/admin/stats/overview") as Promise<OverviewStats>,
  users: (days = 30) => fetchAdmin(`/api/admin/stats/users?days=${days}`) as Promise<UserTimeseries>,
  revenue: (months = 12) => fetchAdmin(`/api/admin/stats/revenue?months=${months}`) as Promise<RevenueData>,
  usage: (days = 30) => fetchAdmin(`/api/admin/stats/usage?days=${days}`) as Promise<UsageStats>,
  conversion: () => fetchAdmin("/api/admin/stats/conversion") as Promise<ConversionFunnel>,
  subscriptions: () => fetchAdmin("/api/admin/stats/subscriptions") as Promise<SubscriptionRow[]>,
  realtime: () => fetchAdmin("/api/admin/stats/realtime") as Promise<RealtimeStats>,
  engagement: () => fetchAdmin("/api/admin/stats/engagement") as Promise<EngagementStats>,
  financials: (days = 30) => fetchAdmin(`/api/admin/stats/financials?days=${days}`) as Promise<FinancialMetrics>,
};
