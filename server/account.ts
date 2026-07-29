import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { stripe, isStripeConfigured } from "./stripe.js";

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

export { GRACE_PERIOD_DAYS };

/**
 * Schedule a user's account for deletion after a 30-day grace period.
 * The user can sign back in and cancel during this window.
 */
export async function scheduleDeletion(userId: string): Promise<{ error: string | null; scheduledDeletionAt: number | null }> {
  if (!isSupabaseConfigured) return { error: "Database not configured", scheduledDeletionAt: null };
  try {
    const now = Date.now();
    const scheduledDeletionAt = new Date(now + GRACE_PERIOD_MS).toISOString();

    const { error } = await supabaseAdmin
      .from("agent_heights_deletion_requests")
      .upsert({
        user_id: userId,
        requested_at: new Date(now).toISOString(),
        scheduled_deletion_at: scheduledDeletionAt,
        cancelled_at: null,
      }, { onConflict: "user_id" });

    if (error) return { error: error.message, scheduledDeletionAt: null };

    // Cancel Stripe subscription at period end (don't cancel immediately —
    // user might change their mind during the grace period)
    if (isStripeConfigured && stripe) {
      try {
        const { data } = await supabaseAdmin
          .from("user_payments")
          .select("stripe_customer_id, subscription_status")
          .eq("user_id", userId)
          .maybeSingle();

        if (data?.stripe_customer_id && data.subscription_status === "active") {
          const subs = await stripe.subscriptions.list({
            customer: data.stripe_customer_id,
            status: "active",
            limit: 1,
          });
          if (subs.data.length > 0) {
            await stripe.subscriptions.update(subs.data[0].id, {
              cancel_at_period_end: true,
            });
          }
        }
      } catch (err) {
        console.error("[account] failed to cancel Stripe subscription for deletion:", err);
      }
    }

    return { error: null, scheduledDeletionAt: now + GRACE_PERIOD_MS };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), scheduledDeletionAt: null };
  }
}

/**
 * Cancel a pending deletion request. User signed back in during the grace period.
 */
export async function cancelDeletion(userId: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured) return { error: "Database not configured" };
  try {
    const { error } = await supabaseAdmin
      .from("agent_heights_deletion_requests")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("cancelled_at", null);

    if (error) return { error: error.message };

    // Reactivate Stripe subscription if it was set to cancel at period end
    if (isStripeConfigured && stripe) {
      try {
        const { data } = await supabaseAdmin
          .from("user_payments")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (data?.stripe_customer_id) {
          const subs = await stripe.subscriptions.list({
            customer: data.stripe_customer_id,
            status: "active",
            limit: 1,
          });
          if (subs.data.length > 0 && subs.data[0].cancel_at_period_end) {
            await stripe.subscriptions.update(subs.data[0].id, {
              cancel_at_period_end: false,
            });
          }
        }
      } catch (err) {
        console.error("[account] failed to reactivate Stripe subscription:", err);
      }
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Check if a user has a pending deletion request.
 * Returns the scheduled deletion timestamp (epoch ms) or null.
 */
export async function getDeletionStatus(userId: string): Promise<{ scheduledDeletionAt: number | null }> {
  if (!isSupabaseConfigured) return { scheduledDeletionAt: null };
  try {
    const { data, error } = await supabaseAdmin
      .from("agent_heights_deletion_requests")
      .select("scheduled_deletion_at, cancelled_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return { scheduledDeletionAt: null };
    if (data.cancelled_at) return { scheduledDeletionAt: null };

    const ts = new Date(data.scheduled_deletion_at).getTime();
    return { scheduledDeletionAt: isNaN(ts) ? null : ts };
  } catch {
    return { scheduledDeletionAt: null };
  }
}

/**
 * Find all users whose grace period has expired and permanently delete them.
 * Called periodically by the cleanup job.
 * Returns the list of deleted user IDs.
 */
export async function processExpiredDeletions(): Promise<string[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("agent_heights_deletion_requests")
      .select("user_id")
      .is("cancelled_at", null)
      .lte("scheduled_deletion_at", now);

    if (error || !data || data.length === 0) return [];

    const deletedIds: string[] = [];
    for (const row of data) {
      const userId = row.user_id as string;
      try {
        // Cancel any active Stripe subscriptions immediately
        if (isStripeConfigured && stripe) {
          try {
            const { data: payData } = await supabaseAdmin
              .from("user_payments")
              .select("stripe_customer_id")
              .eq("user_id", userId)
              .maybeSingle();

            if (payData?.stripe_customer_id) {
              const subs = await stripe.subscriptions.list({
                customer: payData.stripe_customer_id,
                status: "active",
                limit: 10,
              });
              for (const sub of subs.data) {
                await stripe.subscriptions.cancel(sub.id);
              }
            }
          } catch (err) {
            console.error(`[account] failed to cancel Stripe for ${userId}:`, err);
          }
        }

        // Delete the auth user — ON DELETE CASCADE wipes all FK tables
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (deleteError) {
          console.error(`[account] failed to delete auth user ${userId}:`, deleteError.message);
          continue;
        }

        // The deletion_requests row cascades too, but clean up explicitly in case
        await supabaseAdmin
          .from("agent_heights_deletion_requests")
          .delete()
          .eq("user_id", userId);

        deletedIds.push(userId);
        console.log(`[account] permanently deleted user ${userId} (grace period expired)`);
      } catch (err) {
        console.error(`[account] error deleting user ${userId}:`, err);
      }
    }

    return deletedIds;
  } catch (err) {
    console.error("[account] error in processExpiredDeletions:", err);
    return [];
  }
}
