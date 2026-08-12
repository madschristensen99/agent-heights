/**
 * Push branded email templates to Supabase via Management API.
 * Uses the Supabase CLI's access token from the local config.
 *
 * Usage: npx tsx scripts/push-supabase-templates.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const PROJECT_REF = "elwyzhhrrqcmymssnblq";
const TEMPLATES_DIR = join(import.meta.dirname, "..", "docs", "supabase-email-templates");

// Extract <body> inner HTML from a full HTML document
function extractBody(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1].trim() : html;
}

const confirmHtml = extractBody(readFileSync(join(TEMPLATES_DIR, "confirm-signup.html"), "utf-8"));
const resetHtml = extractBody(readFileSync(join(TEMPLATES_DIR, "reset-password.html"), "utf-8"));
const magicLinkHtml = extractBody(readFileSync(join(TEMPLATES_DIR, "magic-link.html"), "utf-8"));

const payload = {
  mailer_subjects_confirmation: "Confirm your account",
  mailer_templates_confirmation_content: confirmHtml,
  mailer_subjects_recovery: "Reset your password",
  mailer_templates_recovery_content: resetHtml,
  mailer_subjects_magic_link: "Your sign-in link",
  mailer_templates_magic_link_content: magicLinkHtml,
};

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN env var is required");
    process.exit(1);
  }

  console.log("Pushing email templates to Supabase...");

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed (${res.status}):`, text);
    process.exit(1);
  }

  console.log("✓ Email templates updated successfully!");
  console.log("  - Confirm signup");
  console.log("  - Reset password");
  console.log("  - Magic link");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
