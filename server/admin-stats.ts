/**
 * Platform-wide statistics aggregation for the admin dashboard.
 * All functions query Supabase or Stripe for aggregate (non-user-specific) data.
 */
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { stripe, isStripeConfigured } from "./stripe.js";
import { SUBSCRIPTION_TIERS, type SubscriptionTier } from "../shared/types.js";
import type { TenantManager } from "./tenant.js";

// ── Types ────────────────────────────────────────────────────────────────

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
  date: string; // YYYY-MM-DD
  value: number;
}

export interface UserTimeseries {
  newSignups: DailyPoint[];
  dau: DailyPoint[];
}

export interface RevenueBreakdown {
  mrr: number;
  byTier: { tier: string; count: number; mrr: number }[];
  oneTimeRevenue: number;
  entranceFeesCount: number;
  assetUpgradesCount: number;
  churnedMrr: number;
  pastDueCount: number;
  pastDueMrr: number;
  arpu: number;
}

export interface RevenueHistoryPoint {
  month: string; // YYYY-MM
  mrr: number;
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

// ── Helpers ──────────────────────────────────────────────────────────────

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tierMrr(tier: string | null, billingPeriod?: string | null): number {
  if (!tier) return 0;
  const info = SUBSCRIPTION_TIERS[tier as SubscriptionTier];
  if (!info) return 0;
  // Annual subs: divide annual price by 12 for monthly equivalent
  if (billingPeriod === "annual") return info.annualPrice / 12 / 100;
  return info.price / 100;
}

// ── Overview ─────────────────────────────────────────────────────────────

export async function getOverviewStats(tenants: TenantManager): Promise<OverviewStats> {
  const [revenue, users, usage, realtime] = await Promise.all([
    getRevenueBreakdown(),
    getUserCounts(),
    getUsageStats(30),
    getRealtimeStats(tenants),
  ]);

  const grossMargin = revenue.mrr - usage.totalSpend;
  const arpu = revenue.mrr > 0 && users.activeSubscribers > 0
    ? revenue.mrr / users.activeSubscribers
    : 0;

  return {
    mrr: revenue.mrr,
    arr: revenue.mrr * 12,
    totalUsers: users.totalUsers,
    activeSubscribers: users.activeSubscribers,
    entrancePaidCount: users.entrancePaidCount,
    dau: users.dau,
    wau: users.wau,
    mau: users.mau,
    totalLlmSpend: usage.totalSpend,
    grossMargin,
    grossMarginPct: revenue.mrr > 0 ? (grossMargin / revenue.mrr) * 100 : 0,
    concurrentUsers: realtime.onlineUsers,
    concurrentAgents: realtime.activeAgents,
    arpu,
  };
}

// ── Users ────────────────────────────────────────────────────────────────

async function getUserCounts(): Promise<{
  totalUsers: number;
  activeSubscribers: number;
  entrancePaidCount: number;
  dau: number;
  wau: number;
  mau: number;
}> {
  if (!isSupabaseConfigured) {
    return { totalUsers: 0, activeSubscribers: 0, entrancePaidCount: 0, dau: 0, wau: 0, mau: 0 };
  }

  const { data: payments } = await supabaseAdmin
    .from("user_payments")
    .select("subscription_status, entrance_paid, created_at");

  const totalUsers = payments?.length ?? 0;
  const activeSubscribers = payments?.filter(p => p.subscription_status === "active" || p.subscription_status === "trialing").length ?? 0;
  const entrancePaidCount = payments?.filter(p => p.entrance_paid).length ?? 0;

  // DAU/WAU/MAU from api_usage_records — distinct users in time windows
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [dauRes, wauRes, mauRes] = await Promise.all([
    supabaseAdmin.from("api_usage_records").select("user_id").gte("created_at", dayAgo),
    supabaseAdmin.from("api_usage_records").select("user_id").gte("created_at", weekAgo),
    supabaseAdmin.from("api_usage_records").select("user_id").gte("created_at", monthAgo),
  ]);

  const countDistinct = (data: { user_id: string }[] | null): number => {
    if (!data) return 0;
    return new Set(data.map(r => r.user_id).filter(Boolean)).size;
  };

  return {
    totalUsers,
    activeSubscribers,
    entrancePaidCount,
    dau: countDistinct(dauRes.data),
    wau: countDistinct(wauRes.data),
    mau: countDistinct(mauRes.data),
  };
}

export async function getUserTimeseries(days: number): Promise<UserTimeseries> {
  if (!isSupabaseConfigured) return { newSignups: [], dau: [] };

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // New signups per day
  const { data: signups } = await supabaseAdmin
    .from("user_payments")
    .select("created_at")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  const signupMap = new Map<string, number>();
  for (const row of signups ?? []) {
    const day = toDayKey(new Date(row.created_at));
    signupMap.set(day, (signupMap.get(day) ?? 0) + 1);
  }

  // DAU per day — fetch all records in range, group by day + distinct user
  const { data: usage } = await supabaseAdmin
    .from("api_usage_records")
    .select("user_id, created_at")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  const dauMap = new Map<string, Set<string>>();
  for (const row of usage ?? []) {
    const day = toDayKey(new Date(row.created_at));
    if (!dauMap.has(day)) dauMap.set(day, new Set());
    if (row.user_id) dauMap.get(day)!.add(row.user_id);
  }

  // Build complete date range
  const newSignups: DailyPoint[] = [];
  const dau: DailyPoint[] = [];
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const key = toDayKey(d);
    newSignups.push({ date: key, value: signupMap.get(key) ?? 0 });
    dau.push({ date: key, value: dauMap.get(key)?.size ?? 0 });
  }

  return { newSignups, dau };
}

// ── Revenue ──────────────────────────────────────────────────────────────

export async function getRevenueBreakdown(): Promise<RevenueBreakdown> {
  if (!isSupabaseConfigured) {
    return { mrr: 0, byTier: [], oneTimeRevenue: 0, entranceFeesCount: 0, assetUpgradesCount: 0, churnedMrr: 0, pastDueCount: 0, pastDueMrr: 0, arpu: 0 };
  }

  const { data: payments } = await supabaseAdmin
    .from("user_payments")
    .select("subscription_status, subscription_tier, entrance_paid");

  const tierCounts = new Map<string, number>();
  let mrr = 0;
  let churnedMrr = 0;
  let pastDueMrr = 0;
  let pastDueCount = 0;
  let activeCount = 0;

  for (const p of payments ?? []) {
    const tier = p.subscription_tier as string | null;
    const m = tierMrr(tier);

    if (p.subscription_status === "active" || p.subscription_status === "trialing") {
      mrr += m;
      activeCount++;
      tierCounts.set(tier ?? "free", (tierCounts.get(tier ?? "free") ?? 0) + 1);
    } else if (p.subscription_status === "canceled") {
      churnedMrr += m;
    } else if (p.subscription_status === "past_due") {
      pastDueMrr += m;
      pastDueCount++;
    }
  }

  const byTier = Array.from(tierCounts.entries()).map(([tier, count]) => ({
    tier,
    count,
    mrr: count * tierMrr(tier),
  }));

  const entranceFeesCount = payments?.filter(p => p.entrance_paid).length ?? 0;
  const oneTimeRevenue = entranceFeesCount * 0.99; // $0.99 entrance fee

  // Asset upgrades
  let assetUpgradesCount = 0;
  try {
    const { count } = await supabaseAdmin
      .from("heights_cloud_asset_upgrades")
      .select("*", { count: "exact", head: true });
    assetUpgradesCount = count ?? 0;
  } catch { /* table may not exist */ }

  const arpu = activeCount > 0 ? mrr / activeCount : 0;

  return {
    mrr,
    byTier,
    oneTimeRevenue: oneTimeRevenue + assetUpgradesCount * 19.99,
    entranceFeesCount,
    assetUpgradesCount,
    churnedMrr,
    pastDueCount,
    pastDueMrr,
    arpu,
  };
}

export async function getRevenueHistory(months: number): Promise<RevenueHistoryPoint[]> {
  if (!isStripeConfigured || !stripe) return [];

  const now = new Date();
  const points: RevenueHistoryPoint[] = [];

  // Query Stripe invoices for paid amounts over time
  try {
    const startTimestamp = Math.floor(new Date(now.getFullYear(), now.getMonth() - months + 1, 1).getTime() / 1000);
    const invoices = await stripe.invoices.list({
      limit: 100,
      created: { gt: startTimestamp },
      status: "paid",
    });

    const monthMap = new Map<string, number>();
    for (const inv of invoices.data) {
      const month = toMonthKey(new Date(inv.created * 1000));
      monthMap.set(month, (monthMap.get(month) ?? 0) + inv.amount_paid / 100);
    }

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = toMonthKey(d);
      points.push({ month: key, mrr: monthMap.get(key) ?? 0 });
    }
  } catch (err) {
    console.error("[admin-stats] revenue history error:", err);
  }

  return points;
}

// ── Usage ────────────────────────────────────────────────────────────────

export async function getUsageStats(days: number): Promise<UsageStats> {
  if (!isSupabaseConfigured) {
    return { totalSpend: 0, dailySpend: [], byModel: [], byProvider: [], dailyTokens: [], dailyCalls: [], costPerActiveUser: 0 };
  }

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const { data, error } = await supabaseAdmin
    .from("api_usage_records")
    .select("user_id, model, provider, input_tokens, output_tokens, total_cost, created_at")
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: true });

  if (error || !data) {
    return { totalSpend: 0, dailySpend: [], byModel: [], byProvider: [], dailyTokens: [], dailyCalls: [], costPerActiveUser: 0 };
  }

  const totalSpend = data.reduce((sum, r) => sum + Number(r.total_cost ?? 0), 0);

  // Daily spend
  const dailyMap = new Map<string, number>();
  const dailyTokensMap = new Map<string, { inputTokens: number; outputTokens: number }>();
  const dailyCallsMap = new Map<string, number>();

  for (const r of data) {
    const day = toDayKey(new Date(r.created_at));
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + Number(r.total_cost ?? 0));
    dailyCallsMap.set(day, (dailyCallsMap.get(day) ?? 0) + 1);
    const tok = dailyTokensMap.get(day) ?? { inputTokens: 0, outputTokens: 0 };
    tok.inputTokens += r.input_tokens ?? 0;
    tok.outputTokens += r.output_tokens ?? 0;
    dailyTokensMap.set(day, tok);
  }

  const dailySpend: DailyPoint[] = [];
  const dailyTokens: { date: string; inputTokens: number; outputTokens: number }[] = [];
  const dailyCalls: DailyPoint[] = [];

  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const key = toDayKey(d);
    dailySpend.push({ date: key, value: dailyMap.get(key) ?? 0 });
    const tok = dailyTokensMap.get(key) ?? { inputTokens: 0, outputTokens: 0 };
    dailyTokens.push({ date: key, inputTokens: tok.inputTokens, outputTokens: tok.outputTokens });
    dailyCalls.push({ date: key, value: dailyCallsMap.get(key) ?? 0 });
  }

  // By model
  const modelMap = new Map<string, { spend: number; calls: number }>();
  for (const r of data) {
    const key = r.model ?? "unknown";
    const entry = modelMap.get(key) ?? { spend: 0, calls: 0 };
    entry.spend += Number(r.total_cost ?? 0);
    entry.calls += 1;
    modelMap.set(key, entry);
  }
  const byModel = Array.from(modelMap.entries())
    .map(([model, v]) => ({ model, spend: v.spend, calls: v.calls }))
    .sort((a, b) => b.spend - a.spend);

  // By provider
  const providerMap = new Map<string, { spend: number; calls: number }>();
  for (const r of data) {
    const key = r.provider ?? "unknown";
    const entry = providerMap.get(key) ?? { spend: 0, calls: 0 };
    entry.spend += Number(r.total_cost ?? 0);
    entry.calls += 1;
    providerMap.set(key, entry);
  }
  const byProvider = Array.from(providerMap.entries())
    .map(([provider, v]) => ({ provider, spend: v.spend, calls: v.calls }))
    .sort((a, b) => b.spend - a.spend);

  // Cost per active user
  const distinctUsers = new Set(data.map(r => r.user_id).filter(Boolean)).size;
  const costPerActiveUser = distinctUsers > 0 ? totalSpend / distinctUsers : 0;

  return { totalSpend, dailySpend, byModel, byProvider, dailyTokens, dailyCalls, costPerActiveUser };
}

// ── Conversion ───────────────────────────────────────────────────────────

export async function getConversionFunnel(): Promise<ConversionFunnel> {
  if (!isSupabaseConfigured) {
    return { totalUsers: 0, entrancePaid: 0, subscribed: 0, entranceConversionPct: 0, subscriptionConversionPct: 0, overallConversionPct: 0, tierDistribution: [] };
  }

  const { data: payments } = await supabaseAdmin
    .from("user_payments")
    .select("subscription_status, subscription_tier, entrance_paid");

  const totalUsers = payments?.length ?? 0;
  const entrancePaid = payments?.filter(p => p.entrance_paid).length ?? 0;
  const subscribed = payments?.filter(p => p.subscription_status === "active" || p.subscription_status === "trialing").length ?? 0;

  const tierMap = new Map<string, number>();
  for (const p of payments ?? []) {
    let tier = "free";
    if (p.subscription_status === "active" || p.subscription_status === "trialing") {
      tier = p.subscription_tier ?? "starter";
    } else if (p.entrance_paid) {
      tier = "entrance";
    }
    tierMap.set(tier, (tierMap.get(tier) ?? 0) + 1);
  }

  const tierDistribution = Array.from(tierMap.entries())
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalUsers,
    entrancePaid,
    subscribed,
    entranceConversionPct: totalUsers > 0 ? (entrancePaid / totalUsers) * 100 : 0,
    subscriptionConversionPct: entrancePaid > 0 ? (subscribed / entrancePaid) * 100 : 0,
    overallConversionPct: totalUsers > 0 ? (subscribed / totalUsers) * 100 : 0,
    tierDistribution,
  };
}

// ── Subscriptions table ──────────────────────────────────────────────────

export async function getSubscriptions(): Promise<SubscriptionRow[]> {
  if (!isSupabaseConfigured) return [];

  const { data: payments } = await supabaseAdmin
    .from("user_payments")
    .select("user_id, subscription_status, subscription_tier, current_period_end, created_at")
    .neq("subscription_status", "none")
    .order("created_at", { ascending: false });

  if (!payments) return [];

  // Fetch emails from auth.users
  const rows: SubscriptionRow[] = [];
  for (const p of payments) {
    let email = "unknown";
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(p.user_id);
      email = userData.user?.email ?? "unknown";
    } catch { /* skip */ }

    rows.push({
      email,
      tier: p.subscription_tier ?? "unknown",
      status: p.subscription_status,
      currentPeriodEnd: p.current_period_end ?? null,
      createdAt: p.created_at,
    });
  }

  return rows;
}

// ── Realtime ─────────────────────────────────────────────────────────────

export async function getRealtimeStats(tenants: TenantManager): Promise<RealtimeStats> {
  let onlineUsers = 0;
  let activeAgents = 0;
  const statusMap = new Map<string, number>();

  for (const sess of tenants.values()) {
    onlineUsers++;
    const snap = sess.manager.snapshot();
    for (const agent of snap.agents) {
      activeAgents++;
      const status = agent.status ?? "idle";
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    }
  }

  return {
    onlineUsers,
    activeAgents,
    agentsByStatus: Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ── Engagement ───────────────────────────────────────────────────────────

export async function getEngagementStats(): Promise<EngagementStats> {
  if (!isSupabaseConfigured) {
    return { assetUpgrades: 0, marketplaceAgents: 0, organizations: 0, scheduledTasks: 0 };
  }

  const safeCount = async (table: string): Promise<number> => {
    try {
      const { count } = await supabaseAdmin
        .from(table)
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const [assetUpgrades, marketplaceAgents, organizations, scheduledTasks] = await Promise.all([
    safeCount("heights_cloud_asset_upgrades"),
    safeCount("heights_cloud_agents"),
    safeCount("organizations"),
    safeCount("agent_schedules"),
  ]);

  return { assetUpgrades, marketplaceAgents, organizations, scheduledTasks };
}
