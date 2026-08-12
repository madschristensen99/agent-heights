/**
 * One-off script: Send personal follow-up emails to users who signed up.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/send-followups.ts
 *
 * Sends a "what were you looking to automate?" email to each address.
 * Rate-limited to 1 email per second to stay well under Resend's limits.
 */

const EMAILS = [
  "maxypoo43@gmail.com",
  "deckerdb26354@gmail.com",
  "grant.eagon@gmail.com",
  "vrreed90@gmail.com",
  "anissawilliamschs@gmail.com",
  "benjaminlawson4@gmail.com",
];

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY env var is required");
    process.exit(1);
  }

  const { sendReplyCorrectionEmail } = await import("../server/email.js");

  console.log(`Sending correction emails to ${EMAILS.length} users...\n`);

  let sent = 0;
  let failed = 0;

  for (const email of EMAILS) {
    try {
      await sendReplyCorrectionEmail(email);
      console.log(`  ✓ ${email}`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${email}:`, err);
      failed++;
    }
    // Rate limit: 1 email per second
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone: ${sent} sent, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
