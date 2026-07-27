import Stripe from "stripe";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { SUBSCRIPTION_TIERS, parseTier, type SubscriptionTier, type BillingPeriod } from "../shared/types.js";

const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export const isStripeConfigured = Boolean(secretKey);

export const stripe: Stripe | null = isStripeConfigured
  ? new Stripe(secretKey)
  : null;

const ENTRANCE_FEE = 100;
const APP_URL = process.env.VITE_APP_URL ?? process.env.PUBLIC_URL ?? "";

// ── Free trial: 2 minutes per day for authed users who haven't paid entrance ──
const FREE_TRIAL_DURATION_MS = 2 * 60 * 1000;
const freeTrialMap = new Map<string, { date: string; expiresAt: number }>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
  entrancePaid: boolean;
  subscriptionStatus: string;
  subscriptionActive: boolean;
  subscriptionTier: SubscriptionTier | null;
  agentLimit: number;
  currentPeriodEnd: number | null;
  freeTrialExpiresAt: number | null;
}

export async function getUserPaymentStatus(userId: string): Promise<PaymentStatus> {
  if (!isSupabaseConfigured || !isStripeConfigured) {
    return { entrancePaid: true, subscriptionStatus: "active", subscriptionActive: true, subscriptionTier: "pro", agentLimit: SUBSCRIPTION_TIERS.pro.agentLimit, currentPeriodEnd: null, freeTrialExpiresAt: null };
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
      return { entrancePaid: false, subscriptionStatus: "none", subscriptionActive: false, subscriptionTier: null, agentLimit: 0, currentPeriodEnd: null, freeTrialExpiresAt: trial.expiresAt };
    }

    let entrancePaid = data.entrance_paid ?? false;

    // Fallback: if entrance_paid is false but the user has a Stripe customer,
    // check for recent completed entrance checkout sessions (webhook may have missed)
    if (!entrancePaid && data.stripe_customer_id && stripe) {
      try {
        const sessions = await stripe.checkout.sessions.list({
          customer: data.stripe_customer_id,
          limit: 10,
        });
        const hasEntrancePayment = sessions.data.some(
          (s) => s.metadata?.type === "entrance" &&
                 s.metadata?.userId === userId &&
                 s.payment_status === "paid"
        );
        if (hasEntrancePayment) {
          console.log(`[stripe] fallback: found completed entrance checkout for user ${userId}, updating DB`);
          entrancePaid = true;
          await supabaseAdmin
            .from("user_payments")
            .update({
              entrance_paid: true,
              entrance_paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
        }
      } catch (fallbackErr) {
        console.error("[stripe] fallback entrance check failed:", fallbackErr);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const subscriptionActive =
      data.subscription_status === "active" ||
      (data.subscription_status === "trialing") ||
      (data.subscription_status === "past_due" && data.current_period_end && data.current_period_end > now);

    const freeTrialExpiresAt = entrancePaid ? null : getFreeTrialStatus(userId).expiresAt;

    const tier = parseTier(data.subscription_tier as string | null);
    const agentLimit = tier ? SUBSCRIPTION_TIERS[tier].agentLimit : 0;

    return {
      entrancePaid,
      subscriptionStatus: data.subscription_status ?? "none",
      subscriptionActive,
      subscriptionTier: tier,
      agentLimit,
      currentPeriodEnd: data.current_period_end ?? null,
      freeTrialExpiresAt,
    };
  } catch {
    const trial = getFreeTrialStatus(userId);
    return { entrancePaid: false, subscriptionStatus: "none", subscriptionActive: false, subscriptionTier: null, agentLimit: 0, currentPeriodEnd: null, freeTrialExpiresAt: trial.expiresAt };
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

// Check if entrance fee is already paid — used to prevent duplicate charges
async function isEntrancePaid(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_payments")
    .select("entrance_paid")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.entrance_paid ?? false;
}

export async function createEntranceCheckoutSession(
  userId: string,
  email: string,
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: "Stripe not configured" };
  if (!APP_URL) return { error: "APP_URL not configured" };

  // Prevent duplicate entrance fee charges
  if (await isEntrancePaid(userId)) {
    return { error: "Entrance fee already paid" };
  }

  try {
    const customerId = await getOrCreateStripeCustomer(userId, email);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ENTRANCE_FEE,
            product_data: {
              name: "Agent Heights — World Entrance Fee",
              description: "One-time fee to enter the Agent Heights world",
            },
          },
        },
      ],
      metadata: { userId, type: "entrance" },
      success_url: `${APP_URL}/?payment=entrance_success`,
      cancel_url: `${APP_URL}/?payment=entrance_cancel`,
    });

    return { url: session.url! };
  } catch (err) {
    console.error("[stripe] entrance checkout error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create checkout session" };
  }
}

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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [
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
      ],
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
          await supabaseAdmin
            .from("user_payments")
            .upsert({
              user_id: userId,
              entrance_paid: true,
              entrance_paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
          console.log(`[stripe] entrance fee paid for user ${userId}`);
        }

        if (session.metadata?.type === "subscription" && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const tier = parseTier(session.metadata?.tier ?? sub.metadata?.tier);
          await supabaseAdmin
            .from("user_payments")
            .upsert({
              user_id: userId,
              subscription_id: sub.id,
              subscription_status: sub.status,
              subscription_tier: tier,
              current_period_end: (sub as any).current_period_end ?? null,
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
          console.log(`[stripe] subscription started for user ${userId}, status=${sub.status}, tier=${tier}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.userId;
        if (!userId) break;

        const tier = parseTier(sub.metadata?.tier);
        await supabaseAdmin
          .from("user_payments")
          .update({
            subscription_status: sub.status,
            subscription_tier: tier,
            current_period_end: (sub as any).current_period_end ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        console.log(`[stripe] subscription updated for user ${userId}, status=${sub.status}, tier=${tier}`);
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
    const status = await getUserPaymentStatus(user.id);
    json(res, 200, status);
    return true;
  }

  if (!isStripeConfigured) {
    json(res, 503, { error: "Stripe not configured" });
    return true;
  }

  // POST /api/stripe/checkout-entrance — create $1 entrance fee checkout
  if (url === "/api/stripe/checkout-entrance" && req.method === "POST") {
    const result = await createEntranceCheckoutSession(user.id, user.email ?? "");
    if ("error" in result) {
      if (result.error === "Entrance fee already paid") {
        json(res, 200, { alreadyPaid: true });
      } else {
        json(res, 400, result);
      }
    } else {
      json(res, 200, result);
    }
    return true;
  }

  // POST /api/stripe/checkout-subscription — create tiered subscription checkout
  if (url === "/api/stripe/checkout-subscription" && req.method === "POST") {
    const body = await readBodyWithLimit(req, 64 * 1024);
    let parsed: { tier?: string; billingPeriod?: string } = {};
    try { parsed = JSON.parse(body.toString()); } catch { /* empty body is fine */ }
    const tier = parseTier(parsed.tier);
    if (!tier) {
      json(res, 400, { error: "Missing or invalid 'tier' field. Expected: starter | pro" });
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
