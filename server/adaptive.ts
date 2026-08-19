/**
 * Adaptive Communication — category-specific messaging for retention emails,
 * tailored subscription pitches, and rate-limited feature recommendations.
 *
 * Uses ProfileManager to pull inferred category (confidence-gated > 0.6)
 * and activity stats to personalize messaging.
 */

import { ProfileManager, type UserProfile, type UsageCategory } from "./profile.js";
import { sendRawEmail } from "./email.js";
import {
  BRAND_ACCENT,
  BRAND_MUTED,
  APP_URL,
  agentShell,
  paragraph,
  ctaSection,
  callout,
} from "./email-blocks.js";

// ── Category-specific messaging ────────────────────────────────────────────

/** Category-specific references for retention email body. */
const CATEGORY_REFERENCES: Record<UsageCategory, { examples: string; pitch: string }> = {
  research: {
    examples: "research summaries, literature reviews, data analysis",
    pitch: "Your agents can compile findings into structured reports and sync them to Google Sheets or Notion.",
  },
  coding: {
    examples: "code reviews, bug fixes, deployments, API integrations",
    pitch: "Your agents can push to GitHub, deploy to Vercel, and manage your codebase autonomously.",
  },
  marketing: {
    examples: "campaign drafts, social posts, content calendars, SEO audits",
    pitch: "Your agents can schedule posts, track engagement, and automate your content pipeline.",
  },
  finance: {
    examples: "portfolio analysis, invoice tracking, budget reports, market data",
    pitch: "Your agents can pull live market data, track transactions, and generate financial summaries.",
  },
  general: {
    examples: "task automation, data entry, research, monitoring",
    pitch: "Your agents can handle repetitive work, monitor systems, and keep things running while you focus on strategy.",
  },
};

/** Build a category-aware retention message. */
export function buildAdaptiveMessage(
  profile: UserProfile,
  baseMessage: string,
  tier: number,
): string {
  if (!ProfileManager.isConfident(profile)) {
    return baseMessage; // Not confident enough — use generic message
  }

  const refs = CATEGORY_REFERENCES[profile.category] ?? CATEGORY_REFERENCES.general;

  if (tier === 1) {
    // Tier 1: casual, category-aware
    return `${baseMessage} We've been keeping busy with ${refs.examples}. ${refs.pitch}`;
  } else if (tier === 2) {
    // Tier 2: concerned, category-aware
    return `${baseMessage} The team was midway through some ${refs.examples} — we can pick it back up whenever you're ready.`;
  } else if (tier === 3) {
    // Tier 3: FOMO, category-aware
    return `${baseMessage} Last we heard, you were interested in ${refs.examples}. We can still do that — and more.`;
  } else {
    // Tier 4: urgent — keep it raw
    return baseMessage;
  }
}

// ── Tailored subscription pitches ──────────────────────────────────────────

/** Determine which subscription plan to pitch based on usage volume. */
export function getRecommendedPlan(profile: UserProfile): {
  name: string;
  price: string;
  reason: string;
} {
  const taskCount = profile.totalTasksDone;
  const agentCount = profile.totalAgentsHired;

  if (taskCount > 50 || agentCount > 5) {
    return {
      name: "Pro",
      price: "$29/mo",
      reason: "You're running a busy office — Pro gives you 15 agents and ~$30/mo usage credit to keep up.",
    };
  } else if (taskCount > 10 || agentCount > 2) {
    return {
      name: "Starter",
      price: "$9/mo",
      reason: "You've got momentum — Starter gives you 5 agents and ~$10/mo usage credit to keep things moving.",
    };
  } else {
    return {
      name: "Starter",
      price: "$9/mo",
      reason: "Start with Starter — 5 agents and ~$10/mo usage credit. Upgrade to Pro when you need more.",
    };
  }
}

/** Build a tailored subscription pitch block for use in emails. */
export function buildSubscriptionPitch(profile: UserProfile): string {
  const plan = getRecommendedPlan(profile);
  return callout(
    `<strong style="color:${BRAND_ACCENT};">Recommended: ${plan.name} — ${plan.price}</strong><br><span style="color:${BRAND_MUTED};">${plan.reason}</span>`,
    { accent: BRAND_ACCENT },
  );
}

// ── Feature recommendations (rate-limited 1/week) ──────────────────────────

/** Category-specific feature recommendations based on what MCP servers they lack. */
const FEATURE_RECS: Record<UsageCategory, { mcpType: string; title: string; body: string }[]> = {
  research: [
    { mcpType: "google-sheets", title: "Organize findings in a spreadsheet", body: "I noticed you're doing a lot of research but haven't connected Google Sheets. I can organize your findings into structured spreadsheets automatically — want me to set that up?" },
    { mcpType: "notion", title: "Sync research to Notion", body: "If you use Notion, I can sync research summaries directly to your workspace. Connect the Notion MCP server and I'll handle the rest." },
  ],
  coding: [
    { mcpType: "github", title: "Connect your GitHub repo", body: "I can review PRs, push fixes, and manage issues directly from the office. Connect the GitHub MCP server and I'll get to work." },
    { mcpType: "vercel", title: "Auto-deploy with Vercel", body: "If you deploy on Vercel, I can trigger deployments and check status from the office. Connect the Vercel MCP server to enable this." },
  ],
  marketing: [
    { mcpType: "twitter", title: "Schedule social posts", body: "I can draft and schedule tweets for you. Connect the Twitter MCP server and I'll keep your social presence active." },
    { mcpType: "mailchimp", title: "Automate email campaigns", body: "I can manage your Mailchimp campaigns — drafts, schedules, subscriber updates. Connect the Mailchimp MCP server to get started." },
  ],
  finance: [
    { mcpType: "yahoo-finance", title: "Track market data", body: "I can pull live market data and build portfolio summaries. Connect the Yahoo Finance MCP server and I'll start tracking." },
    { mcpType: "stripe", title: "Monitor Stripe payments", body: "I can track incoming payments, generate revenue reports, and flag anomalies. Connect the Stripe MCP server to enable this." },
  ],
  general: [],
};

/** Find a feature recommendation for the user based on their profile. */
function findFeatureRec(profile: UserProfile): { type: string; title: string; body: string } | null {
  if (!ProfileManager.isConfident(profile)) return null;

  const recs = FEATURE_RECS[profile.category];
  if (!recs || recs.length === 0) return null;

  // Find a rec for an MCP server they don't have connected
  for (const rec of recs) {
    if (!profile.mcpServerTypes.includes(rec.mcpType)) {
      return { type: rec.mcpType, title: rec.title, body: rec.body };
    }
  }

  return null; // All recommendations already connected
}

/** Check if we should send a feature recommendation and send it. */
export async function maybeSendFeatureRecommendation(
  userId: string,
  userEmail: string,
): Promise<void> {
  const profile = await ProfileManager.getProfile(userId);
  if (!profile) return;

  // Rate-limited: 1/week
  if (!ProfileManager.canSendFeatureRec(profile)) return;

  const rec = findFeatureRec(profile);
  if (!rec) return;

  console.log(`[adaptive] Sending feature recommendation (${rec.type}) to ${userEmail}`);

  await sendRawEmail(
    userEmail,
    `Hermes: ${rec.title}`,
    agentShell(
      [
        paragraph(`Boss, it's Hermes. ${rec.body}`, { lead: true }),
        paragraph("Just reply to this email if you want me to set it up, or come into the office and we'll get it connected.", { muted: true }),
        ctaSection("Go to the Office", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );

  await ProfileManager.recordFeatureRec(userId, rec.type);
}

// ── Adaptive retention email ───────────────────────────────────────────────

/**
 * Build an adaptive retention email using the user's profile.
 * Falls back to generic messaging if profile confidence is too low.
 */
export function adaptRetentionEmail(
  profile: UserProfile | null,
  baseMessage: string,
  tier: number,
): string {
  if (!profile) return baseMessage;
  return buildAdaptiveMessage(profile, baseMessage, tier);
}
