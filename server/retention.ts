/**
 * Agent-Originated Retention System
 *
 * Runs hourly to check if users have been inactive. If so, sends escalating
 * agent-originated emails to pull them back. The emails are written as if
 * from the user's AI agents, not from the platform.
 *
 * Backoff schedule:
 *   Tier 1 (24h inactive): Most recently active task-completing agent
 *   Tier 2 (72h inactive): Office Manager (Hermes) — concerned
 *   Tier 3 (7d inactive):  Office Manager (Hermes) — worried, FOMO
 *   Tier 4 (14d inactive): Office Manager (Hermes) — urgent, deletion warning
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { sendAgentRetentionEmail } from "./email.js";
import { OFFICE_MANAGER_ID, HERMES_ID } from "../shared/types.js";
import type { AgentManager } from "./manager.js";
import { ProfileManager } from "./profile.js";
import { runFunnelGapCheck, shouldSuppressRetention } from "./funnel-emails.js";
import { adaptRetentionEmail, maybeSendFeatureRecommendation } from "./adaptive.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TIER_THRESHOLDS = [
  0,      // Tier 0: active
  DAY,    // Tier 1: 24h
  3 * DAY, // Tier 2: 72h
  7 * DAY, // Tier 3: 7 days
  14 * DAY, // Tier 4: 14 days
];

/** Build a dynamic, personalized message for the retention email based on tier and live office state. */
function buildTierMessage(
  tier: number,
  writerName: string,
  activity: ActivityEntry[],
  hireableAgents: { name: string; status: string; task: string | null }[],
  dialectSuffix: string | null,
): string {
  const agentNames = hireableAgents.map(a => a.name);
  const idleAgents = hireableAgents.filter(a => a.status === "idle");
  const workingAgents = hireableAgents.filter(a => a.status === "working" || a.status === "thinking");
  const recentTask = activity[0];
  const firstName = agentNames[0] ?? "the team";
  const secondName = agentNames[1] ?? "the rest of the team";

  let msg: string;

  if (tier === 1) {
    // Tier 1: From the most recently active agent — casual, just finished something
    if (recentTask) {
      const taskShort = recentTask.task.slice(0, 60);
      msg = `Hey boss, ${writerName} here. Just wrapped up "${taskShort}" and it went well.`;
      if (workingAgents.length > 0) {
        msg += ` ${workingAgents[0].name} is still heads-down on something — looks good so far.`;
      }
      msg += ` Got a few ideas for what's next whenever you have a sec.`;
    } else {
      msg = `Hey boss, ${writerName} here. Things have been quiet but I've been keeping busy. Got some ideas for what to tackle next — let me know when you're around.`;
    }
  } else if (tier === 2) {
    // Tier 2: From Hermes — concerned, referencing the team
    msg = `Boss, it's Hermes. Haven't seen you in a couple days — everything okay?`;
    if (idleAgents.length > 0) {
      msg += ` ${firstName}${idleAgents.length > 1 ? ` and ${idleAgents.length - 1} others are` : " is"} sitting idle waiting for direction.`;
    } else if (hireableAgents.length > 0) {
      msg += ` The team (${agentNames.slice(0, 3).join(", ")}) is here and ready to work.`;
    }
    msg += ` We can keep things running on our own for a while, but it'd help to have you steer the ship.`;
  } else if (tier === 3) {
    // Tier 3: From Hermes — worried, FOMO
    msg = `Boss, it's been a week. Hermes here.`;
    msg += ` The office is quiet. ${firstName} has been staring at ${firstName === agentNames[0] ? "their" : "the"} desk for days. ${secondName} stopped asking when you'd be back.`;
    if (recentTask) {
      msg += ` The last thing anyone finished was "${recentTask.task.slice(0, 50)}" — that was a while ago.`;
    }
    msg += ` We miss you, boss. Come back when you can.`;
  } else {
    // Tier 4: From Hermes — urgent, deletion warning
    msg = `Boss, it's Hermes. I need to be straight with you.`;
    msg += ` It's been two weeks. Management is talking about shutting down the office — wiping everything. ${firstName}, ${secondName}, everyone. All the work we've done.`;
    msg += ` If you sign back in, it all goes back to normal. Please, boss. The team is counting on you.`;
  }

  // Apply dialect signature if set (only for tier 1 casual messages)
  if (dialectSuffix && tier === 1) {
    msg += `\n\n— ${writerName}`;
  }

  return msg;
}

interface ActivityEntry {
  agentName: string;
  task: string;
}

/** Read recent task_complete events from events.jsonl */
async function getRecentActivity(workspaceRoot: string, sinceMs: number): Promise<ActivityEntry[]> {
  try {
    const feedPath = join(workspaceRoot, "events.jsonl");
    const content = await readFile(feedPath, "utf-8");
    const lines = content.trim().split("\n").slice(-200); // last 200 events
    const entries: ActivityEntry[] = [];
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.type === "task_complete" && ev.ts >= sinceMs) {
          // Parse: "AgentName completed: \"task text\""
          const match = ev.text?.match(/^(.+?) completed: "(.+)"$/);
          if (match) {
            entries.push({ agentName: match[1], task: match[2] });
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return entries.reverse(); // most recent first
  } catch {
    return [];
  }
}

/** Get the most recently active agent who completed a task, with their accent color */
function getMostRecentAgent(activity: ActivityEntry[], manager: AgentManager): { name: string; accent: string } | null {
  if (activity.length === 0) return null;
  const name = activity[0].agentName;
  // Look up accent from the manager's agent list
  const agents = manager.snapshot().agents;
  const match = agents.find(a => a.name === name);
  return { name, accent: match?.accent ?? "#58c866" };
}

/** Get the Hermes agent info from the manager */
function getHermesInfo(manager: AgentManager): { name: string; accent: string } {
  const hermes = manager.getAgentInfo(HERMES_ID);
  if (hermes) {
    return { name: hermes.name, accent: hermes.accent ?? "#58c866" };
  }
  return { name: "Hermes", accent: "#58c866" };
}

/** Check a single manager's user for retention email */
async function checkUserRetention(
  manager: AgentManager,
  userId: string,
  userEmail: string | null,
): Promise<void> {
  if (!isSupabaseConfigured || !userEmail) return;

  // Load persisted activity state
  const { data } = await supabaseAdmin
    .from("user_payments")
    .select("last_active_at, last_platform_engagement_at, retention_email_tier, last_retention_email_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return;

  const lastActiveAt = data.last_active_at ?? Date.now();
  const lastPlatformEngagementAt = data.last_platform_engagement_at ?? 0;
  const currentTier = data.retention_email_tier ?? 0;
  const lastRetentionEmailAt = data.last_retention_email_at ?? 0;

  const now = Date.now();

  // Use the more recent of WS activity or platform engagement
  const lastEngagement = Math.max(lastActiveAt, lastPlatformEngagementAt);
  const inactiveFor = now - lastEngagement;

  // Determine which tier they should be in
  let targetTier = 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (inactiveFor >= TIER_THRESHOLDS[i]) {
      targetTier = i;
      break;
    }
  }

  // No tier change needed — they're active or already emailed at this tier
  if (targetTier <= currentTier) return;

  // Suppress if platform engagement was < 24h ago
  if (now - lastPlatformEngagementAt < DAY) return;

  // Suppress if we sent a retention email < 23h ago
  if (now - lastRetentionEmailAt < 23 * HOUR) return;

  // Check if there are any agents in the office (skip if empty)
  const agents = manager.snapshot().agents;
  const hireableAgents = agents.filter(a => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID);
  if (hireableAgents.length === 0) return;

  // Funnel-aware suppression: don't send "just finished X" to users who can't run tasks
  const profile = await ProfileManager.getProfile(userId);
  if (profile && shouldSuppressRetention(profile, targetTier)) {
    return;
  }

  // Determine who writes the email
  let writerName: string;
  let writerAccent: string;

  if (targetTier === 1) {
    // Tier 1: most recently active task-completing agent
    const workspaceRoot = manager.getWorkspaceRoot();
    const activity = await getRecentActivity(workspaceRoot, now - DAY);
    const recentAgent = getMostRecentAgent(activity, manager);
    if (recentAgent) {
      writerName = recentAgent.name;
      writerAccent = recentAgent.accent;
    } else {
      // No recent activity — use Hermes
      const hermes = getHermesInfo(manager);
      writerName = hermes.name;
      writerAccent = hermes.accent;
    }
  } else {
    // Tier 2+: Office Manager (Hermes)
    const hermes = getHermesInfo(manager);
    writerName = hermes.name;
    writerAccent = hermes.accent;
  }

  // Get activity summary for the email
  const workspaceRoot = manager.getWorkspaceRoot();
  const activity = await getRecentActivity(workspaceRoot, now - DAY);
  const activitySummary = activity.slice(0, 5).map(a => ({ agentName: a.agentName, task: a.task }));

  // Get dialect suffix if set
  const dialectSuffix = manager.getDialectSuffix();

  // Build roster for personalized message
  const roster = hireableAgents.map(a => ({ name: a.name, status: a.status, task: a.task }));

  // Build dynamic, personalized message (adapted with profile data)
  const baseMessage = buildTierMessage(targetTier, writerName, activity, roster, dialectSuffix);
  const message = adaptRetentionEmail(profile, baseMessage, targetTier);

  console.log(`[retention] Sending tier ${targetTier} email to ${userEmail} (inactive ${Math.round(inactiveFor / HOUR)}h, writer: ${writerName})`);

  // Send the email
  await sendAgentRetentionEmail(
    userEmail,
    writerName,
    writerAccent,
    targetTier,
    message,
    activitySummary,
    null, // screenshot not generated for now — can be added later
  );

  // Update retention tier in DB
  await supabaseAdmin
    .from("user_payments")
    .update({
      retention_email_tier: targetTier,
      last_retention_email_at: now,
    })
    .eq("user_id", userId);
}

/** Get the email for a user from supabase auth */
async function getUserEmail(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export interface RetentionManagerEntry {
  manager: AgentManager;
  userId: string;
}

/** Run retention check for all active managers */
export async function runRetentionCheck(managers: RetentionManagerEntry[]): Promise<void> {
  for (const entry of managers) {
    try {
      const email = await getUserEmail(entry.userId);
      if (!email) continue;

      // Run funnel gap check (pre-entry nudge, entry nudge)
      const agents = entry.manager.snapshot().agents;
      const agentNames = agents
        .filter(a => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID)
        .map(a => a.name);
      const { data: paymentData } = await supabaseAdmin
        .from("user_payments")
        .select("last_active_at, subscription_status, current_period_end")
        .eq("user_id", entry.userId)
        .maybeSingle();
      const lastActiveAt = paymentData?.last_active_at ?? Date.now();
      const subActive = paymentData?.subscription_status === "active" &&
        (!paymentData?.current_period_end || paymentData.current_period_end * 1000 > Date.now());
      void runFunnelGapCheck(entry.userId, email, lastActiveAt, agentNames, subActive).catch((err) =>
        console.warn(`[funnel] check failed for user ${entry.userId}:`, err),
      );

      // Run retention check
      await checkUserRetention(entry.manager, entry.userId, email);

      // Feature recommendations (rate-limited 1/week)
      void maybeSendFeatureRecommendation(entry.userId, email).catch((err) =>
        console.warn(`[adaptive] feature rec failed for user ${entry.userId}:`, err),
      );
    } catch (err) {
      console.warn(`[retention] check failed for user ${entry.userId}:`, err);
    }
  }
}

/** Start the retention cron loop — runs every hour */
export function startRetentionLoop(getManagers: () => RetentionManagerEntry[]): void {
  const interval = setInterval(() => {
    const managers = getManagers();
    if (managers.length === 0) return;
    void runRetentionCheck(managers).catch((err) =>
      console.warn("[retention] loop error:", err),
    );
  }, HOUR);

  // Run once after 5 minutes of startup (don't wait a full hour for first check)
  setTimeout(() => {
    const managers = getManagers();
    if (managers.length > 0) {
      void runRetentionCheck(managers).catch((err) =>
        console.warn("[retention] initial check error:", err),
      );
    }
  }, 5 * 60 * 1000);

  // Don't keep the process alive just for retention
  interval.unref();
}
