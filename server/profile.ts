/**
 * ProfileManager — ingests user activity and infers usage category + funnel stage.
 *
 * Confidence-gated: inferred category is only acted on when confidence > 0.6.
 * Funnel stages: pre_entry → entry → activated → retained → churned
 */

import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

export type UsageCategory = "research" | "coding" | "marketing" | "finance" | "general";
export type FunnelStage = "pre_entry" | "entry" | "activated" | "retained" | "churned";

export interface UserProfile {
  userId: string;
  category: UsageCategory;
  categoryConfidence: number;
  funnelStage: FunnelStage;
  entrancePaid: boolean;
  statedIntent: string | null;
  totalTasksDone: number;
  totalAgentsHired: number;
  totalMcpConnections: number;
  totalFires: number;
  totalRecruits: number;
  modelUsage: Record<string, number>;
  mcpServerTypes: string[];
  lastFeatureRecAt: number;
  lastFeatureRecType: string | null;
  lastFunnelEmailAt: number;
  lastFunnelEmailType: string | null;
}

// ── Category inference ─────────────────────────────────────────────────────

/** Signals that contribute to category inference. */
interface CategorySignals {
  taskKeywords: Record<string, number>;  // keyword → count
  mcpTypes: string[];                     // connected MCP server types
  modelChoices: Record<string, number>;   // model_id → count
  agentNames: string[];                   // hired agent names
}

/** Map agent names and MCP types to category signals. */
const MCP_CATEGORY_MAP: Record<string, UsageCategory> = {
  "google-sheets": "research",
  "google-drive": "research",
  "notion": "research",
  "github": "coding",
  "gitlab": "coding",
  "vercel": "coding",
  "railway": "coding",
  "stripe": "finance",
  "plaid": "finance",
  "yahoo-finance": "finance",
  "mailchimp": "marketing",
  "hubspot": "marketing",
  "twitter": "marketing",
  "slack": "general",
  "discord": "general",
};

const TASK_KEYWORD_MAP: Record<string, UsageCategory> = {
  research: "research",
  search: "research",
  analyze: "research",
  survey: "research",
  summarize: "research",
  report: "research",
  paper: "research",
  study: "research",
  code: "coding",
  build: "coding",
  deploy: "coding",
  debug: "coding",
  refactor: "coding",
  api: "coding",
  function: "coding",
  repository: "coding",
  market: "marketing",
  campaign: "marketing",
  email: "marketing",
  social: "marketing",
  content: "marketing",
  seo: "marketing",
  brand: "marketing",
  finance: "finance",
  payment: "finance",
  invoice: "finance",
  budget: "finance",
  revenue: "finance",
  transaction: "finance",
};

const AGENT_NAME_MAP: Record<string, UsageCategory> = {
  "github": "coding",
  "vercel": "coding",
  "railway": "coding",
  "stripe": "finance",
  "yahoo-finance": "finance",
  "mailchimp": "marketing",
  "hubspot": "marketing",
  "google-sheets": "research",
  "google-drive": "research",
  "notion": "research",
};

/** Infer category from signals. Returns category + confidence (0.0–1.0). */
function inferCategory(signals: CategorySignals): { category: UsageCategory; confidence: number } {
  const scores: Record<UsageCategory, number> = {
    research: 0,
    coding: 0,
    marketing: 0,
    finance: 0,
    general: 0,
  };

  // MCP server types — strong signal (weight: 3)
  for (const mcpType of signals.mcpTypes) {
    const cat = MCP_CATEGORY_MAP[mcpType.toLowerCase()];
    if (cat) scores[cat] += 3;
  }

  // Task keywords — medium signal (weight: 1 each, capped at 10 per category)
  const keywordCats: Record<UsageCategory, number> = { research: 0, coding: 0, marketing: 0, finance: 0, general: 0 };
  for (const [kw, count] of Object.entries(signals.taskKeywords)) {
    const cat = TASK_KEYWORD_MAP[kw.toLowerCase()];
    if (cat && keywordCats[cat] < 10) {
      scores[cat] += Math.min(count, 10 - keywordCats[cat]);
      keywordCats[cat] += count;
    }
  }

  // Agent names — medium signal (weight: 2)
  for (const name of signals.agentNames) {
    const lower = name.toLowerCase();
    for (const [key, cat] of Object.entries(AGENT_NAME_MAP)) {
      if (lower.includes(key)) {
        scores[cat] += 2;
        break;
      }
    }
  }

  // Model choices — weak signal (weight: 0.5)
  for (const [model, count] of Object.entries(signals.modelChoices)) {
    if (model.includes("code") || model.includes("deepseek")) {
      scores.coding += 0.5 * Math.min(count, 5);
    } else if (model.includes("claude") || model.includes("sonnet")) {
      scores.research += 0.3 * Math.min(count, 5);
    }
  }

  // Find winner
  let bestCat: UsageCategory = "general";
  let bestScore = 0;
  for (const [cat, score] of Object.entries(scores) as [UsageCategory, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestCat = cat;
    }
  }

  // Confidence: ratio of winner to total, scaled
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? Math.min(bestScore / total, 1.0) : 0;

  return { category: bestCat, confidence };
}

// ── Funnel stage logic ─────────────────────────────────────────────────────

function determineFunnelStage(
  agentsHired: number,
  entrancePaid: boolean,
  tasksDone: number,
  lastActiveAt: number,
): FunnelStage {
  const now = Date.now();
  const inactiveDays = (now - lastActiveAt) / (24 * 60 * 60 * 1000);

  if (inactiveDays > 14) return "churned";
  if (tasksDone > 0 && entrancePaid) return inactiveDays > 7 ? "retained" : "activated";
  if (agentsHired > 0) return "entry";
  return "pre_entry";
}

// ── ProfileManager ─────────────────────────────────────────────────────────

export class ProfileManager {
  /** Get a user's profile from DB, or create a default one. */
  static async getProfile(userId: string): Promise<UserProfile | null> {
    if (!isSupabaseConfigured) return null;
    try {
      const { data, error } = await supabaseAdmin
        .from("heights_cloud_user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[profile] fetch error:", error.message);
        return null;
      }

      if (!data) {
        // Create default profile
        return await this.createProfile(userId);
      }

      return {
        userId: data.user_id,
        category: data.category,
        categoryConfidence: data.category_confidence,
        funnelStage: data.funnel_stage,
        entrancePaid: data.entrance_paid,
        statedIntent: data.stated_intent,
        totalTasksDone: data.total_tasks_done,
        totalAgentsHired: data.total_agents_hired,
        totalMcpConnections: data.total_mcp_connections,
        totalFires: data.total_fires,
        totalRecruits: data.total_recruits,
        modelUsage: data.model_usage ?? {},
        mcpServerTypes: data.mcp_server_types ?? [],
        lastFeatureRecAt: data.last_feature_rec_at ?? 0,
        lastFeatureRecType: data.last_feature_rec_type ?? null,
        lastFunnelEmailAt: data.last_funnel_email_at ?? 0,
        lastFunnelEmailType: data.last_funnel_email_type ?? null,
      };
    } catch (err) {
      console.warn("[profile] getProfile error:", err);
      return null;
    }
  }

  /** Create a default profile for a new user. */
  static async createProfile(userId: string): Promise<UserProfile> {
    const profile: UserProfile = {
      userId,
      category: "general",
      categoryConfidence: 0,
      funnelStage: "pre_entry",
      entrancePaid: false,
      statedIntent: null,
      totalTasksDone: 0,
      totalAgentsHired: 0,
      totalMcpConnections: 0,
      totalFires: 0,
      totalRecruits: 0,
      modelUsage: {},
      mcpServerTypes: [],
      lastFeatureRecAt: 0,
      lastFeatureRecType: null,
      lastFunnelEmailAt: 0,
      lastFunnelEmailType: null,
    };

    if (isSupabaseConfigured) {
      await supabaseAdmin
        .from("heights_cloud_user_profiles")
        .upsert({
          user_id: userId,
          category: profile.category,
          category_confidence: profile.categoryConfidence,
          funnel_stage: profile.funnelStage,
          entrance_paid: profile.entrancePaid,
          stated_intent: profile.statedIntent,
          total_tasks_done: profile.totalTasksDone,
          total_agents_hired: profile.totalAgentsHired,
          total_mcp_connections: profile.totalMcpConnections,
          total_fires: profile.totalFires,
          total_recruits: profile.totalRecruits,
          model_usage: profile.modelUsage,
          mcp_server_types: profile.mcpServerTypes,
          last_feature_rec_at: profile.lastFeatureRecAt,
          last_feature_rec_type: profile.lastFeatureRecType,
          last_funnel_email_at: profile.lastFunnelEmailAt,
          last_funnel_email_type: profile.lastFunnelEmailType,
        });
    }

    return profile;
  }

  /** Ingest a task completion event. */
  static async ingestTaskComplete(userId: string, taskText: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;

    // Extract keywords from task text
    const words = taskText.toLowerCase().split(/\s+/);
    const newKeywords: Record<string, number> = {};
    for (const word of words) {
      if (TASK_KEYWORD_MAP[word]) {
        newKeywords[word] = (newKeywords[word] ?? 0) + 1;
      }
    }

    // Re-infer category with accumulated signals
    const signals: CategorySignals = {
      taskKeywords: newKeywords,
      mcpTypes: profile.mcpServerTypes,
      modelChoices: profile.modelUsage,
      agentNames: [], // Would need agent list from manager
    };
    const { category, confidence } = inferCategory(signals);

    // Only update category if new confidence is higher
    const shouldUpdateCategory = confidence > profile.categoryConfidence;

    await this.updateProfile(userId, {
      total_tasks_done: profile.totalTasksDone + 1,
      ...(shouldUpdateCategory ? { category, category_confidence: confidence } : {}),
    });
  }

  /** Ingest a hire event. */
  static async ingestHire(userId: string, agentName: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;

    // Check if agent name maps to a category
    const signals: CategorySignals = {
      taskKeywords: {},
      mcpTypes: profile.mcpServerTypes,
      modelChoices: profile.modelUsage,
      agentNames: [...profile.mcpServerTypes, agentName], // reuse for name matching
    };
    const { category, confidence } = inferCategory(signals);
    const shouldUpdateCategory = confidence > profile.categoryConfidence;

    const newStage = determineFunnelStage(
      profile.totalAgentsHired + 1,
      profile.entrancePaid,
      profile.totalTasksDone,
      Date.now(),
    );

    await this.updateProfile(userId, {
      total_agents_hired: profile.totalAgentsHired + 1,
      funnel_stage: newStage,
      ...(shouldUpdateCategory ? { category, category_confidence: confidence } : {}),
    });
  }

  /** Ingest an MCP connection event. */
  static async ingestMcpConnection(userId: string, mcpServerType: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;

    const mcpTypes = [...new Set([...profile.mcpServerTypes, mcpServerType])];
    const signals: CategorySignals = {
      taskKeywords: {},
      mcpTypes,
      modelChoices: profile.modelUsage,
      agentNames: [],
    };
    const { category, confidence } = inferCategory(signals);
    const shouldUpdateCategory = confidence > profile.categoryConfidence;

    await this.updateProfile(userId, {
      total_mcp_connections: profile.totalMcpConnections + 1,
      mcp_server_types: mcpTypes,
      ...(shouldUpdateCategory ? { category, category_confidence: confidence } : {}),
    });
  }

  /** Ingest a model choice event. */
  static async ingestModelChoice(userId: string, modelId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;

    const modelUsage = { ...profile.modelUsage };
    modelUsage[modelId] = (modelUsage[modelId] ?? 0) + 1;

    const signals: CategorySignals = {
      taskKeywords: {},
      mcpTypes: profile.mcpServerTypes,
      modelChoices: modelUsage,
      agentNames: [],
    };
    const { category, confidence } = inferCategory(signals);
    const shouldUpdateCategory = confidence > profile.categoryConfidence;

    await this.updateProfile(userId, {
      model_usage: modelUsage,
      ...(shouldUpdateCategory ? { category, category_confidence: confidence } : {}),
    });
  }

  /** Ingest an entrance fee payment. */
  static async ingestEntrancePayment(userId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;

    const newStage = determineFunnelStage(
      profile.totalAgentsHired,
      true,
      profile.totalTasksDone,
      Date.now(),
    );

    await this.updateProfile(userId, {
      entrance_paid: true,
      funnel_stage: newStage,
    });
  }

  /** Ingest a fire event. */
  static async ingestFire(userId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;
    await this.updateProfile(userId, {
      total_fires: profile.totalFires + 1,
    });
  }

  /** Ingest a recruit event. */
  static async ingestRecruit(userId: string): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;
    await this.updateProfile(userId, {
      total_recruits: profile.totalRecruits + 1,
    });
  }

  /** Set the user's stated intent (from onboarding modal). */
  static async setStatedIntent(userId: string, intent: string): Promise<void> {
    await this.updateProfile(userId, { stated_intent: intent });
  }

  /** Check if the user's profile is confident enough to act on. */
  static isConfident(profile: UserProfile): boolean {
    return profile.categoryConfidence > 0.6;
  }

  /** Check if enough time has passed for a feature recommendation (1/week). */
  static canSendFeatureRec(profile: UserProfile): boolean {
    const week = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - profile.lastFeatureRecAt > week;
  }

  /** Record that a feature recommendation was sent. */
  static async recordFeatureRec(userId: string, recType: string): Promise<void> {
    await this.updateProfile(userId, {
      last_feature_rec_at: Date.now(),
      last_feature_rec_type: recType,
    });
  }

  /** Record that a funnel email was sent. */
  static async recordFunnelEmail(userId: string, emailType: string): Promise<void> {
    await this.updateProfile(userId, {
      last_funnel_email_at: Date.now(),
      last_funnel_email_type: emailType,
    });
  }

  /** Update funnel stage based on current activity. */
  static async refreshFunnelStage(userId: string, lastActiveAt: number): Promise<void> {
    const profile = await this.getProfile(userId);
    if (!profile) return;
    const newStage = determineFunnelStage(
      profile.totalAgentsHired,
      profile.entrancePaid,
      profile.totalTasksDone,
      lastActiveAt,
    );
    if (newStage !== profile.funnelStage) {
      await this.updateProfile(userId, { funnel_stage: newStage });
    }
  }

  /** Internal: partial update of profile fields. */
  private static async updateProfile(userId: string, fields: Record<string, unknown>): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      await supabaseAdmin
        .from("heights_cloud_user_profiles")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } catch (err) {
      console.warn("[profile] update error:", err);
    }
  }
}
