import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { calculateCost } from "./providers/pricing.js";
import { resolveModel, type ProviderName } from "./providers/api-config.js";
import { SUBSCRIPTION_TIERS, ENTRY_FEE_USAGE_CREDIT, type SubscriptionTier } from "../shared/types.js";

export interface UsageRecord {
  userId: string;
  agentId: string;
  agentName: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCost?: number;
  task?: string;
  isChat?: boolean;
}

/**
 * Record a single LLM API call's token usage to the database.
 * Cost is calculated from the pricing table if not provided.
 * Failures are logged but never thrown — usage tracking must not break agent tasks.
 */
export async function recordUsage(rec: UsageRecord): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    const resolvedModel = resolveModel(rec.model, rec.provider as ProviderName);
    const totalCost = rec.totalCost || calculateCost(
      resolvedModel,
      rec.inputTokens,
      rec.outputTokens,
      rec.cacheReadTokens ?? 0,
      rec.cacheWriteTokens ?? 0,
    );
    const { error } = await supabaseAdmin.from("api_usage_records").insert({
      user_id: rec.userId,
      agent_id: rec.agentId,
      agent_name: rec.agentName,
      model: rec.model,
      provider: rec.provider,
      input_tokens: rec.inputTokens,
      output_tokens: rec.outputTokens,
      cache_read_tokens: rec.cacheReadTokens ?? 0,
      cache_write_tokens: rec.cacheWriteTokens ?? 0,
      total_cost: totalCost,
      task: rec.task?.slice(0, 500) ?? null,
      is_chat: rec.isChat ?? false,
    });
    if (error) console.error("[usage] failed to record:", error.message);
  } catch (err) {
    console.error("[usage] recordUsage error:", err);
  }
}

export interface UsageSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  byModel: { model: string; cost: number; inputTokens: number; outputTokens: number; calls: number }[];
  byAgent: { agentId: string; agentName: string; cost: number; calls: number }[];
  byDay: { date: string; cost: number; calls: number }[];
}

/**
 * Get aggregated usage summary for a user within an optional date range.
 */
export async function getUsageSummary(
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<UsageSummary | null> {
  if (!isSupabaseConfigured) return null;
  try {
    let query = supabaseAdmin
      .from("api_usage_records")
      .select("model, agent_id, agent_name, input_tokens, output_tokens, total_cost, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (startDate) query = query.gte("created_at", startDate.toISOString());
    if (endDate) query = query.lte("created_at", endDate.toISOString());

    const { data, error } = await query;
    if (error || !data) return null;

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const modelMap = new Map<string, { cost: number; inputTokens: number; outputTokens: number; calls: number }>();
    const agentMap = new Map<string, { agentName: string; cost: number; calls: number }>();
    const dayMap = new Map<string, { cost: number; calls: number }>();

    for (const row of data) {
      const cost = Number(row.total_cost ?? 0);
      totalCost += cost;
      totalInputTokens += row.input_tokens ?? 0;
      totalOutputTokens += row.output_tokens ?? 0;

      const m = modelMap.get(row.model) ?? { cost: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
      m.cost += cost;
      m.inputTokens += row.input_tokens ?? 0;
      m.outputTokens += row.output_tokens ?? 0;
      m.calls += 1;
      modelMap.set(row.model, m);

      const aKey = row.agent_id ?? "unknown";
      const a = agentMap.get(aKey) ?? { agentName: row.agent_name ?? "Unknown", cost: 0, calls: 0 };
      a.cost += cost;
      a.calls += 1;
      agentMap.set(aKey, a);

      const day = (row.created_at as string).slice(0, 10);
      const d = dayMap.get(day) ?? { cost: 0, calls: 0 };
      d.cost += cost;
      d.calls += 1;
      dayMap.set(day, d);
    }

    return {
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000,
      totalInputTokens,
      totalOutputTokens,
      totalCalls: data.length,
      byModel: [...modelMap.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.cost - a.cost),
      byAgent: [...agentMap.entries()].map(([agentId, v]) => ({ agentId, ...v })).sort((a, b) => b.cost - a.cost),
      byDay: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  } catch (err) {
    console.error("[usage] getUsageSummary error:", err);
    return null;
  }
}

/**
 * Get total spend for the current calendar month for a user.
 * Returns 0 if Supabase is not configured or no records exist.
 */
export async function getMonthlySpend(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data, error } = await supabaseAdmin
      .from("api_usage_records")
      .select("total_cost")
      .eq("user_id", userId)
      .gte("created_at", startOfMonth.toISOString());
    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);
  } catch (err) {
    console.error("[usage] getMonthlySpend error:", err);
    return 0;
  }
}

/** Get the monthly usage cap in USD for a subscription tier.
 *  Returns entry fee credit ($0.50) for entry tier (paid but no subscription).
 *  Returns 0 for free tier (no payment). */
export function getUsageCap(tier: SubscriptionTier | null, entrancePaid = false): number {
  if (tier) return SUBSCRIPTION_TIERS[tier].usageCap / 100; // convert cents to dollars
  if (entrancePaid) return ENTRY_FEE_USAGE_CREDIT / 100;
  return 0;
}

/** Get the monthly premium API cap in USD for a subscription tier. Returns 0 for no subscription. */
export function getPremiumCap(tier: SubscriptionTier | null): number {
  if (!tier) return 0;
  return SUBSCRIPTION_TIERS[tier].premiumCap / 100; // convert cents to dollars
}

/** Get total premium API spend for the current calendar month for a user.
 *  Premium calls are recorded with model starting with "circle:". */
export async function getMonthlyPremiumSpend(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { data, error } = await supabaseAdmin
      .from("api_usage_records")
      .select("total_cost")
      .eq("user_id", userId)
      .like("model", "circle:%")
      .gte("created_at", startOfMonth.toISOString());
    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + Number(row.total_cost ?? 0), 0);
  } catch (err) {
    console.error("[usage] getMonthlyPremiumSpend error:", err);
    return 0;
  }
}
