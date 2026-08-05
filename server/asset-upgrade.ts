/**
 * AI Asset Upgrade — $19.99 one-time payment to upgrade a deployed world
 * from procedural assets to AI-generated high-fidelity assets.
 *
 * Flow:
 * 1. User pays via Stripe checkout ($19.99 one-time)
 * 2. Stripe webhook triggers generation job
 * 3. Generation pipeline runs fal.ai asset generation (tiles, objects,
 *    furniture, creatures, vehicle, portal) adapted from existing scripts
 * 4. Generated assets uploaded to the Railway deployment
 * 5. world-theme.json updated: assetTier = "ai"
 * 6. Railway redeploys → client loads AI assets on next visit
 *
 * Progress is reported via WS messages to the client.
 */

import { stripe, isStripeConfigured } from "./stripe.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import type { ServerMsg, WorldTheme } from "../shared/types.js";

const APP_URL = process.env.VITE_APP_URL ?? process.env.PUBLIC_URL ?? "";
const ASSET_UPGRADE_PRICE = 1999; // $19.99 in cents

/** Progress callback type — used to report generation progress to the client. */
export type ProgressCallback = (stage: string, percent: number, label: string) => void;

/** Broadcast callback — sends a ServerMsg to the user's WS session. */
export type BroadcastCallback = (msg: ServerMsg) => void;

// ── Stripe Checkout ──────────────────────────────────────────────────────

export async function createAssetUpgradeCheckoutSession(
  userId: string,
  email: string,
  deploymentId: string,
  branchName: string,
  repoFullName: string,
): Promise<{ url: string } | { error: string }> {
  if (!stripe) return { error: "Stripe not configured" };
  if (!APP_URL) return { error: "APP_URL not configured" };

  try {
    // Get or create Stripe customer
    const { data } = await supabaseAdmin
      .from("user_payments")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId = data?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
      await supabaseAdmin
        .from("user_payments")
        .upsert({ user_id: userId, stripe_customer_id: customerId }, { onConflict: "user_id" });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ASSET_UPGRADE_PRICE,
            product_data: {
              name: "Agent Heights — AI World Graphics Upgrade",
              description: "Upgrade your world from procedural to AI-generated high-fidelity assets. Includes tiles, objects, furniture, creatures, vehicle, and portal visuals.",
            },
          },
        },
      ],
      metadata: {
        userId,
        type: "asset_upgrade",
        deploymentId,
        branchName,
        repoFullName,
      },
      success_url: `${APP_URL}/?payment=asset_upgrade_success&deployment=${deploymentId}`,
      cancel_url: `${APP_URL}/?payment=asset_upgrade_cancel`,
    });

    return { url: session.url! };
  } catch (err) {
    console.error("[asset-upgrade] checkout error:", err);
    return { error: err instanceof Error ? err.message : "Failed to create checkout session" };
  }
}

// ── Webhook Handler ──────────────────────────────────────────────────────

export async function handleAssetUpgradeWebhook(
  session: any,
): Promise<void> {
  const userId = session.metadata?.userId;
  const deploymentId = session.metadata?.deploymentId;
  const branchName = session.metadata?.branchName;
  const repoFullName = session.metadata?.repoFullName;

  if (!userId || !deploymentId || !branchName || !repoFullName) {
    console.error("[asset-upgrade] missing metadata in webhook:", session.metadata);
    return;
  }

  console.log(`[asset-upgrade] payment received for deployment ${deploymentId} by user ${userId}`);

  // Record the upgrade in the database
  const { error: dbError } = await supabaseAdmin
    .from("heights_cloud_asset_upgrades")
    .insert({
      user_id: userId,
      deployment_id: deploymentId,
      branch_name: branchName,
      repo_full_name: repoFullName,
      stripe_payment_intent_id: session.payment_intent as string,
      stripe_checkout_session_id: session.id,
      status: "generating",
      current_stage: "init",
      created_at: new Date().toISOString(),
    });

  if (dbError) {
    console.error("[asset-upgrade] failed to record upgrade in DB:", dbError);
  }

  // The actual generation job runs asynchronously via the WS handler
  // when the client reconnects and sends upgrade_assets, or it can be
  // triggered here if we have a broadcast mechanism.
  // For now, we just record the payment — the client will trigger the
  // generation via WS when it reconnects after Stripe redirect.
}

// ── Generation Job Orchestrator ──────────────────────────────────────────

/**
 * Run the full AI asset generation pipeline for a world.
 * This is an async function that calls fal.ai APIs and uploads results.
 * Progress is reported via the provided callback.
 *
 * Stages:
 * 1. World tiles (~15%) — PATINA Material
 * 2. World objects + furniture (~30%) — Recraft V4.1 + Nano Banana 2
 * 3. Office tileset (~45%) — PATINA + Recraft
 * 4. Creature source images (~55%) — Nano Banana 2
 * 5. Creature 3D models (~70%) — Hunyuan 3D Rapid
 * 6. Creature spritesheet rendering (~85%) — Playwright + Three.js
 * 7. Atlas packing (~90%) — sharp
 * 8. Deploy to Railway (~100%) — upload + update world-theme.json
 */
export async function runAssetGenerationJob(
  deploymentId: string,
  branchName: string,
  repoFullName: string,
  worldTheme: WorldTheme | null,
  onProgress: ProgressCallback,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Stage 1: World tiles
    onProgress("world_tiles", 5, "Generating world tiles…");
    await generateWorldTiles(worldTheme, onProgress);

    // Stage 2: World objects + furniture
    onProgress("objects_furniture", 20, "Generating objects & furniture…");
    await generateObjectsAndFurniture(worldTheme, onProgress);

    // Stage 3: Office tileset
    onProgress("office_tileset", 40, "Generating office tileset…");
    await generateOfficeTileset(worldTheme, onProgress);

    // Stage 4: Creature source images
    onProgress("creature_sources", 50, "Generating creature models…");
    await generateCreatureSources(worldTheme, onProgress);

    // Stage 5: Creature 3D models
    onProgress("creature_3d", 60, "Generating 3D creature models…");
    await generateCreature3DModels(worldTheme, onProgress);

    // Stage 6: Creature spritesheet rendering
    onProgress("creature_render", 75, "Rendering creature spritesheets…");
    await renderCreatureSpritesheets(worldTheme, onProgress);

    // Stage 7: Atlas packing
    onProgress("atlas_packing", 85, "Packing texture atlases…");
    await packAtlases(onProgress);

    // Stage 8: Deploy
    onProgress("deploy", 90, "Deploying to world…");
    await deployAssets(deploymentId, branchName, repoFullName, worldTheme, onProgress);

    // Update DB status
    if (isSupabaseConfigured) {
      await supabaseAdmin
        .from("heights_cloud_asset_upgrades")
        .update({
          status: "ready",
          current_stage: "complete",
          completed_at: new Date().toISOString(),
        })
        .eq("deployment_id", deploymentId);
    }

    onProgress("complete", 100, "Upgrade complete!");
    return { success: true };
  } catch (err) {
    console.error("[asset-upgrade] generation failed:", err);

    if (isSupabaseConfigured) {
      await supabaseAdmin
        .from("heights_cloud_asset_upgrades")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        })
        .eq("deployment_id", deploymentId);
    }

    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Stage implementations (stubs — to be wired to refactored scripts) ────
// These will call the extracted functions from scripts/generate-ai-assets.ts,
// scripts/generate-creature-sprites.ts, scripts/generate-creature-3d.ts,
// scripts/render-creature-sprites.ts, and scripts/pack-ai-atlas.ts.

async function generateWorldTiles(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Call generateWorldAssets() from scripts/generate-ai-assets.ts
  // with theme-driven PATINA Material prompts for all tileable surfaces.
  onProgress("world_tiles", 12, "Generating world tiles… (PATINA Material)");
  // Placeholder — actual implementation will call fal.ai PATINA Material API
}

async function generateObjectsAndFurniture(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Call Recraft V4.1 for SVG sprites + Nano Banana 2 for complex sprites
  onProgress("objects_furniture", 28, "Generating objects & furniture… (Recraft + Nano Banana)");
}

async function generateOfficeTileset(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Generate AI office tileset (PATINA floors/walls + Recraft furniture sprites)
  onProgress("office_tileset", 42, "Generating office tileset… (PATINA + Recraft)");
}

async function generateCreatureSources(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Call generateCreatureSources() from scripts/generate-creature-sprites.ts
  onProgress("creature_sources", 53, "Generating creature source images… (Nano Banana 2)");
}

async function generateCreature3DModels(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Call generateCreature3DModels() from scripts/generate-creature-3d.ts
  onProgress("creature_3d", 65, "Generating 3D creature models… (Hunyuan 3D Rapid)");
}

async function renderCreatureSpritesheets(theme: WorldTheme | null, onProgress: ProgressCallback): Promise<void> {
  // TODO: Call renderCreatureSpritesheets() from scripts/render-creature-sprites.ts
  onProgress("creature_render", 80, "Rendering creature spritesheets… (Playwright + Three.js)");
}

async function packAtlases(onProgress: ProgressCallback): Promise<void> {
  // TODO: Call packAtlases() from scripts/pack-ai-atlas.ts
  onProgress("atlas_packing", 88, "Packing texture atlases…");
}

async function deployAssets(
  deploymentId: string,
  branchName: string,
  repoFullName: string,
  theme: WorldTheme | null,
  onProgress: ProgressCallback,
): Promise<void> {
  // TODO: Upload generated assets to Railway deployment's /public/assets/ai/ directory
  // Update world-theme.json on the branch: set assetTier = "ai"
  // Commit via GitHub API → Railway auto-redeploys
  onProgress("deploy", 95, "Uploading assets & updating world config…");
}

// ── HTTP route handler ───────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from "node:http";
import { json, readBodyWithLimit } from "./security.js";
import { verifyToken, type AuthUser } from "./supabase.js";

async function authenticate(req: IncomingMessage): Promise<AuthUser | null> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  return verifyToken(token);
}

export async function handleAssetUpgradeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = req.url?.split("?")[0] ?? "";
  if (!url.startsWith("/api/asset-upgrade")) return false;

  if (!isSupabaseConfigured) {
    json(res, 503, { error: "Supabase not configured" });
    return true;
  }

  const user = await authenticate(req);
  if (!user) {
    json(res, 401, { error: "Authentication required" });
    return true;
  }

  // POST /api/asset-upgrade/checkout — create $19.99 checkout session
  if (url === "/api/asset-upgrade/checkout" && req.method === "POST") {
    const body = await readBodyWithLimit(req, 64 * 1024);
    let parsed: { deploymentId?: string; branchName?: string; repoFullName?: string } = {};
    try { parsed = JSON.parse(body.toString()); } catch { /* empty */ }

    if (!parsed.deploymentId || !parsed.branchName || !parsed.repoFullName) {
      json(res, 400, { error: "Missing required fields: deploymentId, branchName, repoFullName" });
      return true;
    }

    if (!isStripeConfigured) {
      json(res, 503, { error: "Stripe not configured" });
      return true;
    }

    const result = await createAssetUpgradeCheckoutSession(
      user.id,
      user.email ?? "",
      parsed.deploymentId,
      parsed.branchName,
      parsed.repoFullName,
    );

    if ("error" in result) {
      json(res, 400, result);
    } else {
      json(res, 200, result);
    }
    return true;
  }

  // GET /api/asset-upgrade/status?deploymentId=xxx — check upgrade status
  if (url === "/api/asset-upgrade/status" && req.method === "GET") {
    const deploymentId = new URL(req.url ?? "", "http://localhost").searchParams.get("deploymentId");
    if (!deploymentId) {
      json(res, 400, { error: "Missing deploymentId query parameter" });
      return true;
    }

    const { data } = await supabaseAdmin
      .from("heights_cloud_asset_upgrades")
      .select("status, current_stage, error, created_at, completed_at")
      .eq("deployment_id", deploymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    json(res, 200, { status: data?.status ?? "none", currentStage: data?.current_stage ?? null, error: data?.error ?? null });
    return true;
  }

  json(res, 404, { error: "Unknown asset upgrade endpoint" });
  return true;
}
