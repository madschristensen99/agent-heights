import Stripe from "stripe";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { SUBSCRIPTION_TIERS, parseTier, AGENT_HEIGHTS_HQ_ADMINS, type SubscriptionTier, type BillingPeriod } from "../shared/types.js";
import { handleAssetUpgradeWebhook } from "./asset-upgrade.js";

const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const isStripeConfigured = Boolean(secretKey);

export const stripe: Stripe | null = isStripeConfigured
  ? new Stripe(secretKey)
  : null;

const APP_URL = process.env.VITE_APP_URL ?? process.env.PUBLIC_URL ?? "";

const SALES_TAX_PERCENT = parseFloat(process.env.SALES_TAX_PERCENT ?? "0");

/** Calculate tax amount in cents for a given base price. */
function calcTaxCents(baseCents: number): number {
  if (SALES_TAX_PERCENT <= 0) return 0;
  return Math.round(baseCents * SALES_TAX_PERCENT / 100);
}

// ── Free trial: 2 minutes per day for authed users without a subscription ──
// Users can look around and hire agents but cannot run inference (tasks/chat)
const FREE_TRIAL_DURATION_MS = 2 * 60 * 1000;
const freeTrialMap = new Map<string, { date: string; expiresAt: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextTrialResetAt(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return next.getTime();
}

export function getFreeTrialStatus(userId: string): { active: boolean; expiresAt: number | null } {
  const today = todayKey();
  const entry = freeTrialMap.get(userId);
  if (!entry || entry.date !== today) return { active: false, expiresAt: null };
  const now = Date.now();
  if (now >= entry.expiresAt) return { active: false, expiresAt: null };
  return { active: true, expiresAt: entry.expiresAt };
}

export function startFreeTrial(userId: string): number | null {
  const today = todayKey();
  const now = Date.now();
  const entry = freeTrialMap.get(userId);
  if (entry && entry.date === today) {
    return now < entry.expiresAt ? entry.expiresAt : null;
  }
  const expiresAt = now + FREE_TRIAL_DURATION_MS;
  freeTrialMap.set(userId, { date: today, expiresAt });
  console.log(`[free-trial] started for user ${userId}, expires at ${new Date(expiresAt).toISOString()}`);
  return expiresAt;
}

export interface PaymentStatus {
  entrancePaid: boolean; // always true now — entrance fee removed
  subscriptionStatus: string;
  subscriptionActive: boolean;
  subscriptionTier: SubscriptionTier | null;
  agentLimit: number;
  usageCap: number; // monthly usage cap in cents (80% of tier price)
  currentPeriodEnd: number | null;
  freeTrialExpiresAt: number | null;
  nextTrialAt: number | null;
}

export async function getUserPaymentStatus(userId: string, email?: string | null): Promise<PaymentStatus> {
  // Admin emails get business tier automatically (no Stripe payment required)
  if (email && AGENT_HEIGHTS_HQ_ADMINS.includes(email.toLowerCase())) {
    return { entrancePaid: true, subscriptionStatus: "active", subscriptionActive: true, subscriptionTier: "business", agentLimit: SUBSCRIPTION_TIERS.business.agentLimit, usageCap: SUBSCRIPTION_TIERS.business.usageCap, currentPeriodEnd: null, freeTrialExpiresAt: null, nextTrialAt: null };
  }

  if (!isSupabaseConfigured || !isStripeConfigured) {
    return { entrancePaid: true, subscriptionStatus: "active", subscriptionActive: true, subscriptionTier: "pro", agentLimit: SUBSCRIPTION_TIERS.pro.agentLimit, usageCap: SUBSCRIPTION_TIERS.pro.usageCap, currentPeriodEnd: null, freeTrialExpiresAt: null, nextTrialAt: null };
  }
  try {
    // Try full query with subscription_tier (may fail if migration not applied)
    let { data, error } = await supabaseAdmin
      .from("user_payments")
      .select("entrance_paid, subscription_status, current_period_end, subscription_tier, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    // Fallback: if the query fails (e.g. subscription_tier column missing), retry without it
    if (error) {
      console.warn("[stripe] full payment query failed, retrying without subscription_tier:", error.message);
      const fallback = await supabaseAdmin
        .from("user_payments")
        .select("entrance_paid, subscription_status, current_period_end, stripe_customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      data = fallback.data as any;
      error = fallback.error;
    }

    if (error || !data) {
      const trial = getFreeTrialStatus(userId);
      const nextTrialAt = !trial.active ? nextTrialResetAt() : null;
      return { entrancePaid: true, subscriptionStatus: "none", subscriptionActive: false, subscriptionTier: null, agentLimit: 0, usageCap: 0, currentPeriodEnd: null, freeTrialExpiresAt: trial.expiresAt, nextTrialAt };
    }

    const entrancePaid = true; // Entrance fee removed — always true

    const now = Math.floor(Date.now() / 1000);
    const subscriptionActive =
      data.subscription_status === "active" ||
      (data.subscription_status === "trialing") ||
      (data.subscription_status === "past_due" && data.current_period_end && data.current_period_end > now);

    const trialStatus = !subscriptionActive ? getFreeTrialStatus(userId) : null;
    const freeTrialExpiresAt = trialStatus?.expiresAt ?? null;
    const nextTrialAt = trialStatus && !trialStatus.active ? nextTrialResetAt() : null;

    const tier = parseTier(data.subscription_tier as string | null);
    // If subscription is active but tier is NULL (legacy subscription from before
    // tiered pricing was introduced), default to 'starter' so the user isn't
    // locked out with agentLimit=0 and usageCap=0.
    const effectiveTier = tier ?? (subscriptionActive ? "starter" : null);
    const agentLimit = effectiveTier ? SUBSCRIPTION_TIERS[effectiveTier].agentLimit : 0;
    const usageCap = effectiveTier ? SUBSCRIPTION_TIERS[effectiveTier].usageCap : 0;

    return {
      entrancePaid,
      subscriptionStatus: data.subscription_status ?? "none",
      subscriptionActive,
      subscriptionTier: effectiveTier,
      agentLimit,
      usageCap,
      currentPeriodEnd: data.current_period_end ?? null,
      freeTrialExpiresAt,
      nextTrialAt,
    };
  } catch {
    const trial = getFreeTrialStatus(userId);
    const nextTrialAt = !trial.active ? nextTrialResetAt() : null;
    return { entrancePaid: true, subscriptionStatus: "none", subscriptionActive: false, subscriptionTier: null, agentLimit: 0, usageCap: 0, currentPeriodEnd: null, freeTrialExpiresAt: trial.expiresAt, nextTrialAt };
  }
}

async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");

  const { data } = await supabaseAdmin
    .from("user_payments")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await supabaseAdmin
    .from("user_payments")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });

  return customer.id;
}

// ── Entrance fee removed — checkout-entrance route deleted ──

export async function createSubscriptionCheckoutSession(
  userId: string,
  email: string,
  tier: SubscriptionTier,
  billingPeriod: BillingPeriod = "annual",
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: "Stripe not configured" };
  if (!APP_URL) return { error: "APP_URL not configured" };

  const tierInfo = SUBSCRIPTION_TIERS[tier];
  if (!tierInfo) return { error: `Invalid tier: ${tier}` };

  const isAnnual = billingPeriod === "annual";
  const unitAmount = isAnnual ? tierInfo.annualPrice : tierInfo.price;
  const interval = isAnnual ? "year" : "month";
  const periodLabel = isAnnual ? "Annual" : "Monthly";

  try {
    const customerId = await getOrCreateStripeCustomer(userId, email);

    const taxCents = calcTaxCents(unitAmount);
    const lineItems: any[] = [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          recurring: { interval },
          product_data: {
            name: `Agent Heights — ${tierInfo.name} Subscription (${periodLabel})`,
            description: isAnnual ? `${tierInfo.description} Billed annually (2 months free).` : tierInfo.description,
          },
        },
      },
    ];
    if (taxCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: taxCents,
          recurring: { interval },
          product_data: { name: `Sales Tax (${SALES_TAX_PERCENT}%)` },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: lineItems,
      metadata: { userId, type: "subscription", tier, billingPeriod },
      subscription_data: { metadata: { userId, tier, billingPeriod } },
      success_url: `${APP_URL}/?payment=subscription_success`,
      cancel_url: `${APP_URL}/?payment=subscription_cancel`,
    });

    return { url: session.url! };
  } catch (err) {
    console.error("[stripe] subscription checkout error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create checkout session" };
  }
}

export async function createCustomerPortalSession(
  userId: string,
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: "Stripe not configured" };
  if (!APP_URL) return { error: "APP_URL not configured" };

  try {
    const { data } = await supabaseAdmin
      .from("user_payments")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data?.stripe_customer_id) {
      return { error: "No Stripe customer found. Please complete a payment first." };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: APP_URL,
    });

    return { url: session.url };
  } catch (err) {
    console.error("[stripe] portal session error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create portal session" };
  }
}

export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<{ received: boolean; error?: string }> {
  if (!stripe || !webhookSecret) return { received: false, error: "Stripe webhook not configured" };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return { received: false, error: `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;

        if (session.metadata?.type === "entrance") {
          // Entrance fee removed — no-op, but keep for backward compat
          console.log(`[stripe] legacy entrance fee payment for user ${userId} — entrance fee removed, ignoring`);
        }

        if (session.metadata?.type === "asset_upgrade") {
          await handleAssetUpgradeWebhook(session);
          console.log(`[stripe] asset upgrade payment for user ${userId}, deployment ${session.metadata?.deploymentId}`);
        }

        if (session.metadata?.type === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string, { expand: ['items.data.price'] });
          const tier = parseTier(session.metadata?.tier ?? sub.metadata?.tier);
          await supabaseAdmin
            .from("user_payments")
            .upsert({
              user_id: userId,
              subscription_id: sub.id,
              subscription_status: sub.status,
              subscription_tier: tier,
              current_period_end: sub.items.data[0]?.current_period_end ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
          console.log(`[stripe] subscription started for user ${userId}, status=${sub.status}, tier=${tier}, period_end=${sub.items.data[0]?.current_period_end ?? null}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const eventSub = event.data.object as Stripe.Subscription;
        const userId = eventSub.metadata?.userId;
        if (!userId) break;

        // Retrieve the full subscription to ensure current_period_end is populated
        const sub = await stripe.subscriptions.retrieve(eventSub.id);
        const tier = parseTier(sub.metadata?.tier);
        await supabaseAdmin
          .from("user_payments")
          .upsert({
            user_id: userId,
            subscription_status: sub.status,
            subscription_tier: tier,
            current_period_end: sub.items.data[0]?.current_period_end ?? null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        console.log(`[stripe] subscription updated for user ${userId}, status=${sub.status}, tier=${tier}, period_end=${sub.items.data[0]?.current_period_end ?? null}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await supabaseAdmin
          .from("user_payments")
          .update({
            subscription_status: "canceled",
            subscription_id: null,
            subscription_tier: null,
            current_period_end: null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        console.log(`[stripe] subscription canceled for user ${userId}`);
        break;
      }

      default:
        break;
    }

    return { received: true };
  } catch (err) {
    console.error("[stripe] webhook handler error:", err);
    return { received: false, error: err instanceof Error ? err.message : "Internal error" };
  }
}

// ── HTTP route handler ──────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyToken, type AuthUser } from "./supabase.js";
import { json, readBodyWithLimit } from "./security.js";

async function authenticate(req: IncomingMessage): Promise<AuthUser | null> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

export async function handleStripeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (!url.startsWith("/api/stripe")) return false;

  // Webhook — needs raw body, no auth
  if (url === "/api/stripe/webhook" && req.method === "POST") {
    if (!isStripeConfigured) {
      json(res, 503, { error: "Stripe not configured" });
      return true;
    }
    const rawBody = await readBodyWithLimit(req, 256 * 1024);
    const signature = req.headers["stripe-signature"] as string | undefined;
    if (!signature) {
      json(res, 400, { error: "Missing stripe-signature header" });
      return true;
    }
    const result = await handleStripeWebhook(rawBody, signature);
    json(res, result.received ? 200 : 400, result.received ? { received: true } : { error: result.error });
    return true;
  }

  // All other Stripe routes require auth
  if (!isSupabaseConfigured) {
    json(res, 503, { error: "Supabase not configured" });
    return true;
  }

  const user = await authenticate(req);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return true;
  }

  // GET /api/stripe/status — check payment status
  if (url === "/api/stripe/status" && req.method === "GET") {
    const status = await getUserPaymentStatus(user.id, user.email);
    json(res, 200, status);
    return true;
  }

  if (!isStripeConfigured) {
    json(res, 503, { error: "Stripe not configured" });
    return true;
  }

  // ── Entrance fee route removed ──

  // POST /api/stripe/checkout-subscription — create tiered subscription checkout
  if (url === "/api/stripe/checkout-subscription" && req.method === "POST") {
    const body = await readBodyWithLimit(req, 64 * 1024);
    let parsed: { tier?: string; billingPeriod?: string } = {};
    try { parsed = JSON.parse(body.toString()); } catch { /* empty body is fine */ }
    const tier = parseTier(parsed.tier);
    if (!tier) {
      json(res, 400, { error: "Missing or invalid 'tier' field. Expected: starter | pro | business" });
      return true;
    }
    const billingPeriod: BillingPeriod = parsed.billingPeriod === "monthly" ? "monthly" : "annual";
    const result = await createSubscriptionCheckoutSession(user.id, user.email ?? "", tier, billingPeriod);
    if ("error" in result) {
      json(res, 400, result);
    } else {
      json(res, 200, result);
    }
    return true;
  }

  // POST /api/stripe/portal — customer portal for managing subscription
  if (url === "/api/stripe/portal" && req.method === "POST") {
    const result = await createCustomerPortalSession(user.id);
    if ("error" in result) {
      json(res, 400, result);
    } else {
      json(res, 200, result);
    }
    return true;
  }

  json(res, 404, { error: "Unknown Stripe endpoint" });
  return true;
}
