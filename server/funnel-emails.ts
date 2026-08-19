/**
 * Funnel Gap Emails — targeted emails for users stuck at specific funnel stages.
 *
 * 1. Pre-entry nudge (48h, no agents hired): "your office is empty"
 * 2. Entry nudge (48h, agents hired, no $0.99): "agents ready to work, 99¢ to unlock"
 * 3. Credit depletion email (immediate, credit = 0): "we're out of juice" + subscription pitch
 *
 * Retention system fix: check funnel_stage and entrance_paid before sending —
 * never send "just finished X" to someone who can't run tasks.
 */

import { isSupabaseConfigured } from "./supabase.js";
import { ProfileManager, type UserProfile } from "./profile.js";
import { sendRawEmail } from "./email.js";
import { buildSubscriptionPitch } from "./adaptive.js";
import {
  BRAND_ACCENT,
  BRAND_MUTED,
  APP_URL,
  agentShell,
  paragraph,
  statsGrid,
  ctaSection,
  callout,
} from "./email-blocks.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FUNNEL_EMAIL_COOLDOWN = 23 * HOUR; // min time between funnel emails

// ── Email builders ─────────────────────────────────────────────────────────

/** Pre-entry nudge: user signed up but hasn't hired anyone in 48h. */
async function sendPreEntryNudge(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "Hermes: your office is empty, boss",
    agentShell(
      [
        paragraph("Boss, it's Hermes. I've been sitting at the front desk for a couple days now. The office is set up, the lights are on, but… nobody's here.", { lead: true }),
        paragraph("I'm ready to work. You just need to walk in and hire your first agent. It takes about 30 seconds — pick a name, give them a task, and watch it happen.", { muted: true }),
        ctaSection("Walk Into Your Office", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

/** Entry nudge: user hired agents but hasn't paid the $0.99 entrance fee in 48h. */
async function sendEntryNudge(email: string, agentNames: string[]): Promise<void> {
  const roster = agentNames.length > 0
    ? agentNames.slice(0, 3).join(", ")
    : "your agents";
  await sendRawEmail(
    email,
    "Hermes: your team is ready to work — 99¢ to unlock",
    agentShell(
      [
        paragraph(`Boss, it's Hermes. ${roster} ${agentNames.length > 1 ? "are" : "is"} sitting at ${agentNames.length > 1 ? "their" : "their"} desk waiting for direction. But there's a gate — management needs a 99¢ one-time entry fee before we can start running tasks.`, { lead: true }),
        paragraph("It includes about 50¢ of usage credit, so you're basically paying cost. Once you're in, you can assign work, connect MCP servers, and the team goes.", { muted: true }),
        callout("99¢ one-time payment — unlocks task execution for all your agents", { accent: BRAND_ACCENT }),
        ctaSection("Unlock Task Execution", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

/** Credit depletion email: user ran out of usage credit, with task stats and subscription pitch. */
async function sendCreditDepletionEmail(
  email: string,
  tasksCompleted: number,
  agentsHired: number,
  isSubscriptionActive: boolean,
  profile?: UserProfile | null,
): Promise<void> {
  const blocks: string[] = [
    paragraph("Boss, it's Hermes. We're out of juice — the usage credit ran out. Here's what we got done before it hit zero:", { lead: true }),
    statsGrid([
      { label: "Tasks Completed", value: String(tasksCompleted) },
      { label: "Agents on Roster", value: String(agentsHired) },
    ]),
  ];

  if (tasksCompleted > 0) {
    blocks.push(paragraph("Not bad for a start. But if you want the team to keep going, we need a subscription.", { muted: true }));
  } else {
    blocks.push(paragraph("We didn't get much done yet — the credit went fast. A subscription gives us a monthly budget to work with.", { muted: true }));
  }

  if (!isSubscriptionActive) {
    // Use adaptive pitch if profile is available, otherwise fallback to generic
    blocks.push(
      profile ? buildSubscriptionPitch(profile) : callout(
        `<strong style="color:${BRAND_ACCENT};">Starter — $9/mo</strong><br><span style="color:${BRAND_MUTED};">~$10 usage credit, 5 agents</span><br><br><strong style="color:${BRAND_ACCENT};">Pro — $29/mo</strong><br><span style="color:${BRAND_MUTED};">~$30 usage credit, 15 agents, priority support</span>`,
        { accent: BRAND_ACCENT },
      ),
      ctaSection("Pick a Plan", APP_URL),
    );
  } else {
    blocks.push(ctaSection("Back to the Office", APP_URL));
  }

  await sendRawEmail(
    email,
    "Hermes: we're out of juice, boss",
    agentShell(blocks.join(""), "Hermes", BRAND_ACCENT),
  );
}

// ── Funnel check logic ─────────────────────────────────────────────────────

interface FunnelCheckResult {
  shouldSend: boolean;
  emailType: string;
  send: () => Promise<void>;
}

/** Check if a user needs a funnel gap email. */
async function checkFunnelGap(
  userId: string,
  userEmail: string,
  profile: UserProfile,
  lastActiveAt: number,
  agentNames: string[],
  isSubscriptionActive: boolean,
): Promise<FunnelCheckResult | null> {
  const now = Date.now();

  // Cooldown: don't send funnel emails more than once per 23h
  if (now - profile.lastFunnelEmailAt < FUNNEL_EMAIL_COOLDOWN) return null;

  const inactiveFor = now - lastActiveAt;
  const stage = profile.funnelStage;

  // Pre-entry nudge: 48h inactive, no agents hired
  if (stage === "pre_entry" && inactiveFor >= 2 * DAY && agentNames.length === 0) {
    return {
      shouldSend: true,
      emailType: "pre_entry_nudge",
      send: () => sendPreEntryNudge(userEmail),
    };
  }

  // Entry nudge: 48h inactive, agents hired, entrance not paid
  if (stage === "entry" && !profile.entrancePaid && inactiveFor >= 2 * DAY && agentNames.length > 0) {
    return {
      shouldSend: true,
      emailType: "entry_nudge",
      send: () => sendEntryNudge(userEmail, agentNames),
    };
  }

  // Credit depletion: immediate (called separately, not on a timer)
  // This is handled by the caller when credit hits 0

  return null;
}

/** Run funnel gap check for a single user. */
export async function runFunnelGapCheck(
  userId: string,
  userEmail: string,
  lastActiveAt: number,
  agentNames: string[],
  isSubscriptionActive: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const profile = await ProfileManager.getProfile(userId);
  if (!profile) return;

  // Refresh funnel stage based on current activity
  await ProfileManager.refreshFunnelStage(userId, lastActiveAt);
  const refreshedProfile = await ProfileManager.getProfile(userId);
  if (!refreshedProfile) return;

  const result = await checkFunnelGap(userId, userEmail, refreshedProfile, lastActiveAt, agentNames, isSubscriptionActive);
  if (!result || !result.shouldSend) return;

  console.log(`[funnel] Sending ${result.emailType} email to ${userEmail}`);
  await result.send();
  await ProfileManager.recordFunnelEmail(userId, result.emailType);
}

/** Send credit depletion email immediately (called when credit hits 0). */
export async function sendCreditDepletion(
  userId: string,
  userEmail: string,
  isSubscriptionActive: boolean,
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const profile = await ProfileManager.getProfile(userId);
  if (!profile) return;

  // Don't send if we already sent one in the last 23h
  if (Date.now() - profile.lastFunnelEmailAt < FUNNEL_EMAIL_COOLDOWN) return;
  if (profile.lastFunnelEmailType === "credit_depletion") return;

  console.log(`[funnel] Sending credit_depletion email to ${userEmail}`);
  await sendCreditDepletionEmail(userEmail, profile.totalTasksDone, profile.totalAgentsHired, isSubscriptionActive, profile);
  await ProfileManager.recordFunnelEmail(userId, "credit_depletion");
}

// ── Retention system fix ───────────────────────────────────────────────────

/**
 * Check if a retention email should be suppressed based on funnel stage.
 * Never send "just finished X" to someone who can't run tasks.
 */
export function shouldSuppressRetention(
  profile: UserProfile,
  tier: number,
): boolean {
  // Tier 1 retention emails say "just finished X" — suppress if user can't run tasks
  if (tier === 1) {
    // Can't run tasks if entrance not paid and no active subscription
    if (!profile.entrancePaid) return true;
  }

  // Suppress all retention emails for churned users (they get deletion warning instead)
  if (profile.funnelStage === "churned") return true;

  return false;
}
