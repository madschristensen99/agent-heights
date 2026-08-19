/**
 * Transactional email system using Resend.
 * Free tier: 100 emails/day, 3000/month.
 * Domain: agentheights.com (verified via Resend DNS records).
 *
 * Emails are built from composable blocks (email-blocks.ts).
 * Each email function composes blocks into a data-driven template.
 */

import { Resend } from "resend";
import {
  BRAND_ACCENT,
  BRAND_MUTED,
  BRAND_TEXT,
  APP_URL,
  shell,
  agentShell,
  paragraph,
  statsGrid,
  activityTable,
  callout,
  ctaSection,
  footnote,
  sectionLabel,
  optionList,
} from "./email-blocks.js";

const apiKey = process.env.RESEND_API_KEY ?? "";
export const isEmailConfigured = Boolean(apiKey);

const resend = isEmailConfigured ? new Resend(apiKey) : null;

const FROM = "Agent Heights <noreply@agentheights.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "remseechannel@gmail.com";

// ── Send wrapper ──────────────────────────────────────────────────────────

export async function sendRawEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    console.warn(`[email] not configured — skipping send to ${to}: ${subject}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error(`[email] send failed to ${to}:`, error);
    }
  } catch (err) {
    console.error(`[email] send error to ${to}:`, err);
  }
}

// ── Email functions ───────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "Your office is ready. Hermes is waiting at the front desk.",
    agentShell(
      [
        paragraph("Hey boss, it's Hermes. I've got the office set up for you — lights on, desks clean, coffee machine running.", { lead: true }),
        paragraph("I'm at the front desk ready to go. Once you walk in, you can hire your first agent, give them some work, and watch it happen. If you want us to ping you on Slack or Telegram when things are done, we can set that up too.", { muted: true }),
        ctaSection("Walk In", APP_URL),
        footnote("Need help? Just reply to this email."),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendDeletionWarningEmail(email: string, deletionDate: string): Promise<void> {
  await sendRawEmail(
    email,
    "Boss, they're talking about shutting down the office...",
    agentShell(
      [
        paragraph("Boss, it's Hermes. I need to be straight with you.", { lead: true }),
        paragraph(`Management says they're going to shut down our office on <strong style="color:${BRAND_TEXT};">${deletionDate}</strong>. That means all of us — every agent, every task, everything we've built together — gets wiped.`, { muted: true }),
        paragraph("I don't know what happened, but if you sign back in before that date, everything goes back to normal. The team is counting on you, boss.", { muted: true }),
        ctaSection("Come Back Before It's Too Late", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendSubscriptionConfirmationEmail(
  email: string,
  tier: string,
  billingPeriod: string,
  price: string,
): Promise<void> {
  await sendRawEmail(
    email,
    `You're all set, boss — ${tier} plan active`,
    agentShell(
      [
        paragraph(`Boss, it's Hermes. Your <strong style="color:${BRAND_ACCENT};">${tier}</strong> plan is live.`, { lead: true }),
        paragraph("The team is ready to work. Here's what you've got:", { muted: true }),
        statsGrid([
          { label: "Plan", value: tier },
          { label: "Billing", value: billingPeriod },
          { label: "Price", value: price },
        ]),
        paragraph("Manage your subscription anytime from in-app settings.", { muted: true }),
        ctaSection("Get to Work", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendSubscriptionCanceledEmail(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "Sorry to see you go, boss",
    agentShell(
      [
        paragraph("Boss, it's Hermes. I heard you canceled the subscription.", { lead: true }),
        paragraph("No hard feelings. You'll keep access until the end of your current billing period. After that, the office goes dark.", { muted: true }),
        paragraph("If you change your mind, you can resubscribe anytime from in-app settings. The team will be here.", { muted: true }),
        ctaSection("Back to the Office", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendAssetUpgradeCompleteEmail(
  email: string,
  deploymentId: string,
): Promise<void> {
  await sendRawEmail(
    email,
    "Boss, the office got a makeover. Come see.",
    agentShell(
      [
        paragraph("Boss, it's Hermes. The upgrade is done and honestly? It looks incredible.", { lead: true }),
        paragraph("New tiles, furniture, creatures — everything's high-fidelity now. The whole place feels alive. It's redeploying as we speak.", { muted: true }),
        ctaSection("Come See It", `${APP_URL}/?deployment=${deploymentId}`),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendAssetUpgradeFailedEmail(
  email: string,
  deploymentId: string,
  errorMessage: string,
): Promise<void> {
  await sendRawEmail(
    email,
    "Boss, the upgrade hit a snag",
    agentShell(
      [
        paragraph("Boss, it's Hermes. The asset upgrade didn't go through. I'm not sure what went wrong yet, but here's what the system said:", { lead: true }),
        callout(errorMessage.slice(0, 300), { mono: true }),
        paragraph("Your payment went through but the generation failed. Reply to this email and I'll get it sorted.", { muted: true }),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendOrgInviteEmail(
  email: string,
  orgName: string,
  inviterEmail: string,
): Promise<void> {
  await sendRawEmail(
    email,
    `${inviterEmail} wants you in their office`,
    shell(
      [
        paragraph(`<strong style="color:${BRAND_ACCENT};">${inviterEmail}</strong> is building a team on Agent Heights and wants you in.`, { lead: true }),
        paragraph(`They've set up a virtual office called <strong style="color:${BRAND_TEXT};">${orgName}</strong> with AI agents that work in real-time. Create an account with this email to join automatically — your desk is already waiting.`, { muted: true }),
        ctaSection("Claim Your Desk", APP_URL),
      ].join(""),
    ),
  );
}

export async function sendFollowUpEmail(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "Hermes: what are you trying to build?",
    agentShell(
      [
        paragraph("Boss, it's Hermes. I noticed you haven't hired anyone yet. No rush — but I'm curious what you're trying to build.", { lead: true }),
        paragraph("Tell me what you're looking to do and what tools you're already using. I'll help you figure out if we're a fit, and if so, which agents you should hire first.", { muted: true }),
        ctaSection("Let's Talk", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendReplyCorrectionEmail(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "Hermes: sorry, my last reply address was broken",
    agentShell(
      [
        paragraph("Boss, my bad. If you tried replying to my last email, it probably bounced — there was an issue with the reply address.", { lead: true }),
        paragraph(`If you want to reach me, just email <a href="mailto:remseechannel@gmail.com" style="color:${BRAND_ACCENT};">remseechannel@gmail.com</a> directly. It's fixed now.`),
        paragraph("Sorry about that.", { muted: true }),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendGateNotificationEmail(
  email: string,
  agentName: string,
  question: string,
  options: string[],
): Promise<void> {
  const accent = "#58c866";
  await sendRawEmail(
    email,
    `${agentName}: boss, I need your call on this`,
    agentShell(
      [
        paragraph(`Boss, ${agentName} here. I'm stuck on something and need your input before I can keep going.`, { lead: true }),
        callout(question),
        sectionLabel("Your options:"),
        optionList(options, accent),
        ctaSection("Answer Me", APP_URL, accent),
        footnote("If you don't respond within 30 minutes, I'll proceed with my best judgment."),
      ].join(""),
      agentName,
      accent,
    ),
  );
}

export async function sendEntranceFeeConfirmationEmail(email: string): Promise<void> {
  await sendRawEmail(
    email,
    "You're in. Your first agent is ready to be hired.",
    agentShell(
      [
        paragraph("Boss, it's Hermes. You're in — welcome to the team.", { lead: true }),
        paragraph("Your office is open and ready. Head inside and hire your first agent. They'll be sitting at their desk, waiting for you to walk in.", { muted: true }),
        ctaSection("Hire Your First Agent", APP_URL),
      ].join(""),
      "Hermes",
      BRAND_ACCENT,
    ),
  );
}

export async function sendAchievementUnlockEmail(
  email: string,
  agentName: string,
  agentAccent: string,
  achievementName: string,
  achievementDesc: string,
): Promise<void> {
  await sendRawEmail(
    email,
    `We did it, boss! ${achievementName} unlocked`,
    agentShell(
      [
        paragraph("Boss, we did it! The whole team celebrated when we found out.", { lead: true }),
        callout(
          `<div style="font-size:2rem;margin-bottom:4px;">🏆</div><div style="font-size:1.1rem;font-weight:700;color:${agentAccent};">${achievementName}</div><div style="font-size:0.85rem;color:${BRAND_MUTED};margin-top:4px;">${achievementDesc}</div>`,
          { center: true, accent: agentAccent },
        ),
        paragraph("There are more achievements to unlock. Come see what the team can do next.", { muted: true }),
        ctaSection("Back to the Office", APP_URL, agentAccent),
      ].join(""),
      agentName,
      agentAccent,
    ),
  );
}

export async function sendAgentRetentionEmail(
  email: string,
  agentName: string,
  agentAccent: string,
  tier: number,
  message: string,
  activitySummary: { agentName: string; task: string }[],
  screenshotBase64?: string | null,
): Promise<void> {
  const tierSubjects = [
    "",
    `${agentName}: checking in`,
    "Hermes: everything okay, boss?",
    "Hermes: we miss you, boss",
    "Hermes: they might shut down the office",
  ];
  const subject = tierSubjects[tier] ?? `${agentName}: checking in`;

  const blocks = [
    paragraph(message, { lead: true }),
    activityTable(activitySummary),
    ctaSection("Come Back to the Office", APP_URL, agentAccent),
  ];

  await sendRawEmail(
    email,
    subject,
    agentShell(blocks.join(""), agentName, agentAccent, screenshotBase64),
  );
}
