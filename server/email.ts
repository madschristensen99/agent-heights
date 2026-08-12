/**
 * Transactional email system using Resend.
 * Free tier: 100 emails/day, 3000/month.
 * Domain: agentheights.com (verified via Resend DNS records).
 */

import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY ?? "";
export const isEmailConfigured = Boolean(apiKey);

const resend = isEmailConfigured ? new Resend(apiKey) : null;

const FROM = "Agent Heights <noreply@agentheights.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "remseechannel@gmail.com";
const APP_URL = process.env.VITE_APP_URL ?? process.env.PUBLIC_URL ?? "https://agentheights.com";

// ── Brand template ────────────────────────────────────────────────────────

const BRAND_BG = "#0d0f1a";
const BRAND_CARD = "#161a2e";
const BRAND_BORDER = "#2a2e42";
const BRAND_ACCENT = "#58c866";
const BRAND_ACCENT_DARK = "#3da64a";
const BRAND_TEXT = "#e0e0e0";
const BRAND_MUTED = "#7a8090";

function shell(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Heights</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_TEXT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${BRAND_CARD};border:1px solid ${BRAND_BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid ${BRAND_BORDER};">
              <h1 style="margin:0;font-size:1.6rem;font-weight:800;letter-spacing:0.06em;color:${BRAND_ACCENT};text-shadow:0 0 20px rgba(88,200,102,0.15);">AGENT HEIGHTS</h1>
              <p style="margin:4px 0 0;font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:${BRAND_MUTED};">Manage AI Agents in a Virtual Office</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid ${BRAND_BORDER};">
              <p style="margin:0;font-size:0.75rem;color:${BRAND_MUTED};text-align:center;line-height:1.5;">
                Agent Heights — <a href="${APP_URL}" style="color:${BRAND_MUTED};text-decoration:none;">${APP_URL.replace(/^https?:\/\//, "")}</a><br>
                You received this email because you have an Agent Heights account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;padding:12px 32px;background:linear-gradient(180deg,${BRAND_ACCENT},${BRAND_ACCENT_DARK});color:#0d0d0d;font-size:0.95rem;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.03em;">${text}</a>`;
}

// ── Send wrapper ──────────────────────────────────────────────────────────

async function send(to: string, subject: string, html: string): Promise<void> {
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
  await send(
    email,
    "Welcome to Agent Heights!",
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">Welcome to Agent Heights!</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Your virtual office is ready. Hire AI agents, assign them tasks, and watch them work in real-time — all from a top-down office simulation.
      </p>
      <h3 style="margin:0 0 8px;font-size:1rem;color:${BRAND_ACCENT};">Quick Start</h3>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:0.9rem;line-height:1.8;color:${BRAND_MUTED};">
        <li>Hire your first agent from the marketplace</li>
        <li>Assign tasks via the task board</li>
        <li>Watch agents work in your isometric office</li>
        <li>Connect agents to Slack, Discord, Email &amp; more</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        ${button("Enter Your Office", APP_URL)}
      </div>
      <p style="margin:0;font-size:0.85rem;color:${BRAND_MUTED};text-align:center;">
        Need help? Just reply to this email.
      </p>
    `),
  );
}

export async function sendDeletionWarningEmail(email: string, deletionDate: string): Promise<void> {
  await send(
    email,
    "Your Agent Heights account is scheduled for deletion",
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">Account Deletion Scheduled</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Your Agent Heights account is scheduled for permanent deletion on
        <strong style="color:${BRAND_TEXT};">${deletionDate}</strong>.
        All your agents, tasks, and saved data will be removed.
      </p>
      <p style="margin:0 0 20px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Changed your mind? Just sign back in before the deletion date and your account will be restored automatically.
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("Sign In to Cancel", APP_URL)}
      </div>
    `),
  );
}

export async function sendSubscriptionConfirmationEmail(
  email: string,
  tier: string,
  billingPeriod: string,
  price: string,
): Promise<void> {
  await send(
    email,
    `Subscription active — Agent Heights ${tier} plan`,
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">Subscription Active</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Your <strong style="color:${BRAND_ACCENT};">${tier}</strong> plan is now active.
      </p>
      <table style="width:100%;margin:0 0 20px;font-size:0.9rem;color:${BRAND_MUTED};border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:${BRAND_MUTED};">Plan</td><td style="padding:6px 0;text-align:right;color:${BRAND_TEXT};font-weight:600;">${tier}</td></tr>
        <tr><td style="padding:6px 0;color:${BRAND_MUTED};">Billing</td><td style="padding:6px 0;text-align:right;color:${BRAND_TEXT};font-weight:600;">${billingPeriod}</td></tr>
        <tr><td style="padding:6px 0;color:${BRAND_MUTED};">Price</td><td style="padding:6px 0;text-align:right;color:${BRAND_TEXT};font-weight:600;">${price}</td></tr>
      </table>
      <p style="margin:0 0 20px;font-size:0.85rem;color:${BRAND_MUTED};">
        You can manage your subscription anytime from the in-app settings.
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("Enter Your Office", APP_URL)}
      </div>
    `),
  );
}

export async function sendSubscriptionCanceledEmail(email: string): Promise<void> {
  await send(
    email,
    "Subscription canceled — Agent Heights",
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">Subscription Canceled</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Your Agent Heights subscription has been canceled. You'll keep access until the end of your current billing period.
      </p>
      <p style="margin:0 0 20px;font-size:0.85rem;color:${BRAND_MUTED};">
        You can resubscribe anytime from the in-app settings.
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("Enter Your Office", APP_URL)}
      </div>
    `),
  );
}

export async function sendAssetUpgradeCompleteEmail(
  email: string,
  deploymentId: string,
): Promise<void> {
  await send(
    email,
    "Your AI assets are ready!",
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">AI Asset Upgrade Complete</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Your world has been upgraded with AI-generated assets. Tiles, furniture, creatures, and more are now high-fidelity.
      </p>
      <p style="margin:0 0 20px;font-size:0.85rem;color:${BRAND_MUTED};">
        Your world is redeploying now. Visit it to see the new look!
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("View Your World", `${APP_URL}/?deployment=${deploymentId}`)}
      </div>
    `),
  );
}

export async function sendAssetUpgradeFailedEmail(
  email: string,
  deploymentId: string,
  errorMessage: string,
): Promise<void> {
  await send(
    email,
    "AI asset upgrade failed",
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">Upgrade Failed</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Unfortunately, the AI asset generation for your world encountered an error:
      </p>
      <div style="background:${BRAND_BG};border:1px solid ${BRAND_BORDER};border-radius:8px;padding:12px 16px;margin:0 0 20px;font-size:0.85rem;color:#e05d5d;font-family:monospace;">
        ${errorMessage.slice(0, 300)}
      </div>
      <p style="margin:0 0 20px;font-size:0.85rem;color:${BRAND_MUTED};">
        Your payment was processed but the generation failed. Please contact support by replying to this email.
      </p>
    `),
  );
}

export async function sendOrgInviteEmail(
  email: string,
  orgName: string,
  inviterEmail: string,
): Promise<void> {
  await send(
    email,
    `You've been invited to ${orgName} on Agent Heights`,
    shell(`
      <h2 style="margin:0 0 12px;font-size:1.25rem;color:${BRAND_TEXT};">You're Invited!</h2>
      <p style="margin:0 0 16px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        <strong style="color:${BRAND_TEXT};">${inviterEmail}</strong> has invited you to join
        <strong style="color:${BRAND_ACCENT};">${orgName}</strong> on Agent Heights.
      </p>
      <p style="margin:0 0 20px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Create an account with this email address to automatically join the organization.
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("Create Account", APP_URL)}
      </div>
    `),
  );
}

export async function sendFollowUpEmail(email: string): Promise<void> {
  await send(
    email,
    "What are you looking to do with AI?",
    shell(`
      <p style="margin:0 0 16px;font-size:1rem;line-height:1.6;color:${BRAND_TEXT};">
        Tell me more about what you're looking to do and the software you're already using — I'll help you figure out if Agent Heights is a fit.
      </p>
      <div style="text-align:center;margin:24px 0;">
        ${button("Enter Your Office", APP_URL)}
      </div>
    `),
  );
}

export async function sendReplyCorrectionEmail(email: string): Promise<void> {
  await send(
    email,
    "Re: Agent Heights — reply to this email",
    shell(`
      <p style="margin:0 0 16px;font-size:1rem;line-height:1.6;color:${BRAND_TEXT};">
        Quick heads up — if you tried replying to my last email, it may have bounced. There was an issue with the reply address.
      </p>
      <p style="margin:0 0 16px;font-size:1rem;line-height:1.6;color:${BRAND_TEXT};">
        If you'd like to respond, just email me directly at <a href="mailto:remseechannel@gmail.com" style="color:${BRAND_ACCENT};">remseechannel@gmail.com</a>.
      </p>
      <p style="margin:0 0 20px;font-size:0.95rem;line-height:1.6;color:${BRAND_MUTED};">
        Sorry about that — it's fixed now.
      </p>
    `),
  );
}
