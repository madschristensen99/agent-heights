/**
 * Composable email template blocks.
 * Each block is a self-contained HTML string generator.
 * Emails are built by composing blocks, not by writing inline HTML.
 */

// ── Brand constants ────────────────────────────────────────────────────────

export const BRAND_BG = "#0d0f1a";
export const BRAND_CARD = "#161a2e";
export const BRAND_BORDER = "#2a2e42";
export const BRAND_ACCENT = "#58c866";
export const BRAND_ACCENT_DARK = "#3da64a";
export const BRAND_TEXT = "#e0e0e0";
export const BRAND_MUTED = "#7a8090";

export const APP_URL = process.env.VITE_APP_URL ?? process.env.PUBLIC_URL ?? "https://agentheights.com";

// ── Block types ────────────────────────────────────────────────────────────

export type EmailBlock = string;

// ── Composable blocks ──────────────────────────────────────────────────────

/** A text paragraph. `lead` makes it larger (opening line). */
export function paragraph(text: string, opts: { lead?: boolean; muted?: boolean; center?: boolean } = {}): EmailBlock {
  const size = opts.lead ? "1.05rem" : "0.95rem";
  const color = opts.muted ? BRAND_MUTED : BRAND_TEXT;
  const align = opts.center ? "text-align:center;" : "";
  return `<p style="margin:0 0 ${opts.lead ? 16 : 20}px;font-size:${size};line-height:1.7;color:${color};${align}">${text}</p>`;
}

/** A key-value table (plan details, stats summary, etc.). */
export function statsGrid(rows: { label: string; value: string }[]): EmailBlock {
  const items = rows.map(r =>
    `<tr><td style="padding:6px 0;color:${BRAND_MUTED};">${r.label}</td><td style="padding:6px 0;text-align:right;color:${BRAND_TEXT};font-weight:600;">${r.value}</td></tr>`
  ).join("");
  return `<table style="width:100%;margin:0 0 20px;font-size:0.9rem;color:${BRAND_MUTED};border-collapse:collapse;">${items}</table>`;
}

/** A table of recent agent activity. */
export function activityTable(activities: { agentName: string; task: string }[], maxItems = 5): EmailBlock {
  if (activities.length === 0) return "";
  const items = activities.slice(0, maxItems).map(a =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid ${BRAND_BORDER};"><span style="color:${BRAND_ACCENT};font-weight:600;">${a.agentName}</span> <span style="color:${BRAND_MUTED};">completed</span> <span style="color:${BRAND_TEXT};">${a.task.slice(0, 80)}</span></td></tr>`
  ).join("");
  return `
    <p style="margin:0 0 10px;font-size:0.8rem;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.08em;">Recent activity:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:0.85rem;border-collapse:collapse;">${items}</table>`;
}

/** A highlighted callout box (achievement card, error message, quote, etc.). */
export function callout(content: string, opts: { accent?: string; mono?: boolean; center?: boolean } = {}): EmailBlock {
  const accent = opts.accent ?? BRAND_ACCENT;
  const font = opts.mono ? "font-family:monospace;" : "";
  const align = opts.center ? "text-align:center;" : "";
  const color = opts.mono ? "#e05d5d" : BRAND_TEXT;
  const borderAccent = opts.mono ? "" : `border-left:3px solid ${accent};`;
  return `<div style="background:${BRAND_BG};border:1px solid ${BRAND_BORDER};${borderAccent}border-radius:${opts.center ? 10 : 8}px;padding:16px 18px;margin:0 0 20px;font-size:0.95rem;line-height:1.6;color:${color};${font}${align}">${content}</div>`;
}

/** A call-to-action button. */
export function ctaButton(text: string, url: string, accent: string = BRAND_ACCENT): EmailBlock {
  const dark = accent.length === 7
    ? accent.replace(/^#(..)(..)(..)/, (_, r, g, b) =>
        `#${Math.max(0, parseInt(r, 16) - 30).toString(16).padStart(2, "0")}${Math.max(0, parseInt(g, 16) - 30).toString(16).padStart(2, "0")}${Math.max(0, parseInt(b, 16) - 30).toString(16).padStart(2, "0")}`)
    : accent;
  return `<a href="${url}" style="display:inline-block;padding:13px 36px;background:linear-gradient(180deg,${accent},${dark});color:#0d0d0d;font-size:0.95rem;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.03em;box-shadow:0 2px 12px rgba(0,0,0,0.3),0 0 16px ${accent}33;">${text}</a>`;
}

/** A centered wrapper for a CTA button with spacing. */
export function ctaSection(text: string, url: string, accent: string = BRAND_ACCENT): EmailBlock {
  return `<div style="text-align:center;margin:24px 0;">${ctaButton(text, url, accent)}</div>`;
}

/** A small muted footnote. */
export function footnote(text: string): EmailBlock {
  return `<p style="margin:0;font-size:0.8rem;color:${BRAND_MUTED};text-align:center;">${text}</p>`;
}

/** A section label (uppercase, muted, small). */
export function sectionLabel(text: string): EmailBlock {
  return `<p style="margin:0 0 10px;font-size:0.8rem;color:${BRAND_MUTED};text-transform:uppercase;letter-spacing:0.08em;">${text}</p>`;
}

/** An ordered list of options (for gate notifications). */
export function optionList(options: string[], accent: string = BRAND_ACCENT): EmailBlock {
  const items = options.map((o, i) =>
    `<li style="margin:0 0 8px;padding:10px 14px;background:${BRAND_BG};border:1px solid ${BRAND_BORDER};border-radius:8px;font-size:0.9rem;color:${BRAND_TEXT};"><strong style="color:${accent};">${i + 1}.</strong> ${o}</li>`
  ).join("");
  return `<ul style="list-style:none;margin:0 0 24px;padding:0;">${items}</ul>`;
}

/** The email signature/footer block. */
export function signature(agentName: string = "Hermes"): EmailBlock {
  return `<p style="margin:0 0 8px;font-size:0.85rem;color:${BRAND_MUTED};">— ${agentName}, your AI Office Manager</p>`;
}

// ── Shell wrappers ─────────────────────────────────────────────────────────

/** Generic brand shell (for org invites, system emails). */
export function shell(content: string): string {
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
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:linear-gradient(165deg,${BRAND_CARD} 0%,#121524 100%);border:1px solid ${BRAND_BORDER};border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4),0 0 0 1px rgba(88,200,102,0.06);">
          <tr>
            <td style="padding:0;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,${BRAND_ACCENT},transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;border-bottom:1px solid ${BRAND_BORDER};">
              <h1 style="margin:0;font-size:1.6rem;font-weight:800;letter-spacing:0.06em;color:${BRAND_ACCENT};text-shadow:0 0 24px rgba(88,200,102,0.25);">AGENT HEIGHTS</h1>
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
              <p style="margin:0;font-size:0.72rem;color:${BRAND_MUTED};text-align:center;line-height:1.5;">
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

/** Agent-branded shell with avatar and optional screenshot. */
export function agentShell(content: string, agentName: string, agentAccent: string, screenshotBase64?: string | null): string {
  const initial = agentName.charAt(0).toUpperCase();
  const avatar = `<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(145deg,${agentAccent},${agentAccent}dd);display:inline-flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:800;color:#0d0d0d;letter-spacing:0;box-shadow:0 0 20px ${agentAccent}44,0 2px 8px rgba(0,0,0,0.3);border:2px solid ${agentAccent}55;">${initial}</div>`;
  const screenshotHtml = screenshotBase64
    ? `<tr><td style="padding:0 32px 20px;"><img src="data:image/png;base64,${screenshotBase64}" style="width:100%;border-radius:10px;border:1px solid ${BRAND_BORDER};display:block;box-shadow:0 2px 12px rgba(0,0,0,0.3);" alt="Office screenshot" /></td></tr>`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agentName} — Agent Heights</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND_TEXT};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};min-height:100vh;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:linear-gradient(165deg,${BRAND_CARD} 0%,#121524 100%);border:1px solid ${BRAND_BORDER};border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4),0 0 0 1px ${agentAccent}11;">
          <tr>
            <td style="padding:0;">
              <div style="height:3px;background:linear-gradient(90deg,transparent,${agentAccent},transparent);"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 16px;text-align:center;border-bottom:1px solid ${BRAND_BORDER};">
              ${avatar}
              <h1 style="margin:8px 0 0;font-size:1.2rem;font-weight:700;color:${BRAND_TEXT};">${agentName}</h1>
              <p style="margin:2px 0 0;font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;color:${BRAND_MUTED};">Your AI Agent</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              ${content}
            </td>
          </tr>
          ${screenshotHtml}
          <tr>
            <td style="padding:14px 32px 22px;border-top:1px solid ${BRAND_BORDER};">
              <p style="margin:0;font-size:0.72rem;color:${BRAND_MUTED};text-align:center;line-height:1.5;">
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
