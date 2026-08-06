/**
 * World Templates
 *
 * Templates store a concept prompt that the Wizard NPC uses to build
 * a world on a GitHub branch. The flow:
 *
 * 1. User picks a template (or types a custom prompt)
 * 2. Platform forks repo → creates branch → commits minimal world-theme.json
 * 3. Branch deployed to Railway
 * 4. Wizard spawns on the deployed world with the concept prompt as its first task
 * 5. Wizard writes files (furniture, theme config, tilemap, code) via GitHub tools
 * 6. Railway auto-redeploys on each commit — world evolves in real time
 */

import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import type { WorldTemplate, WorldDeployment } from "../shared/types.js";
import {
  getAuthenticatedUser,
  forkSourceRepo,
  createBranch,
  listBranches,
  createRepoFile,
} from "./github.js";
import { deployWorldToRailway } from "./providers/railway-mcp.js";

export interface GenerateWorldResult {
  deployment: WorldDeployment | null;
  conceptPrompt: string;
  error: string | null;
}

/** List all available world templates, ordered by sort_order. */
export async function listWorldTemplates(): Promise<{ templates: WorldTemplate[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { templates: [], error: "Supabase not configured" };
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_world_templates")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) return { templates: [], error: error.message };

    const templates: WorldTemplate[] = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      conceptPrompt: row.concept_prompt,
      referenceDoc: row.reference_doc ?? undefined,
      sortOrder: row.sort_order ?? 0,
    }));

    return { templates, error: null };
  } catch (err) {
    return { templates: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Get a single template by ID. */
export async function getWorldTemplate(templateId: string): Promise<{ template: WorldTemplate | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { template: null, error: "Supabase not configured" };
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("heights_cloud_world_templates")
      .select("*")
      .eq("id", templateId)
      .single();

    if (error) return { template: null, error: error.message };
    if (!data) return { template: null, error: "Template not found" };

    const template: WorldTemplate = {
      id: data.id,
      name: data.name,
      description: data.description,
      icon: data.icon,
      conceptPrompt: data.concept_prompt,
      referenceDoc: data.reference_doc ?? undefined,
      sortOrder: data.sort_order ?? 0,
    };

    return { template, error: null };
  } catch (err) {
    return { template: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Generate a world from a template:
 * 1. Fork the repo (if not already forked)
 * 2. Create a branch named worlds/<template-name>
 * 3. Commit a minimal world-theme.json
 * 4. Deploy to Railway
 * 5. Return the deployment + concept prompt for the Wizard
 */
export async function generateWorld(
  templateId: string,
  githubToken: string,
  worldName?: string,
): Promise<GenerateWorldResult> {
  const { template, error: templateError } = await getWorldTemplate(templateId);
  if (templateError || !template) {
    return { deployment: null, conceptPrompt: "", error: templateError ?? "Template not found" };
  }

  try {
    const user = await getAuthenticatedUser(githubToken);
    if (!user) {
      return { deployment: null, conceptPrompt: template.conceptPrompt, error: "Invalid GitHub token" };
    }

    // Fork the repo if it doesn't exist yet
    let forkOwner = user.login;
    let forkName = "agent-heights";
    try {
      await listBranches(githubToken, forkOwner, forkName);
    } catch {
      const fork = await forkSourceRepo(githubToken);
      forkOwner = fork.owner;
      forkName = fork.name;
    }

    // Create branch name from template name or custom world name
    const slug = (worldName ?? template.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const branchName = `worlds/${slug}`;

    // Create the branch
    await createBranch(githubToken, forkOwner, forkName, branchName);

    // Commit a minimal world-theme.json — the Wizard will expand this
    const themeJson = JSON.stringify({
      id: slug,
      name: worldName ?? template.name,
      description: template.description,
      workMetaphor: "office",
      arrivalMetaphor: "helicopter",
      office: {
        tilemapPath: "assets/tilemaps/office.json",
        tilesetPath: "assets/tilesets/office.png",
        floorTile: 0,
        wallTile: 1,
        doorTile: 2,
      },
      furniture: {},
      worldgen: {
        seed: Math.floor(Math.random() * 2147483647),
        biomeScale: 0.003,
        hostilityScale: 0.004,
      },
      interactables: {},
      assets: {
        tilesetPath: "assets/tilesets/world.png",
        assetTier: "procedural",
      },
    }, null, 2);

    try {
      await createRepoFile(
        githubToken,
        forkOwner,
        forkName,
        branchName,
        "client/public/assets/world-theme.json",
        themeJson,
        `Initialize world-theme.json for ${template.name}`,
      );
    } catch (err) {
      console.warn(`[world-templates] Failed to commit world-theme.json:`, err);
    }

    // Commit the concept prompt as wizard-task.txt — the deployed world's
    // Wizard NPC reads this at boot and auto-assigns it as its first task.
    try {
      await createRepoFile(
        githubToken,
        forkOwner,
        forkName,
        branchName,
        "wizard-task.txt",
        template.conceptPrompt,
        `Wizard task: build ${template.name}`,
      );
    } catch (err) {
      console.warn(`[world-templates] Failed to commit wizard-task.txt:`, err);
    }

    // Deploy to Railway
    const repoFullName = `${forkOwner}/${forkName}`;
    const deployResult = await deployWorldToRailway(branchName, repoFullName);

    if (deployResult.error || !deployResult.deployment) {
      return {
        deployment: null,
        conceptPrompt: template.conceptPrompt,
        error: deployResult.error ?? "Failed to deploy to Railway",
      };
    }

    return {
      deployment: deployResult.deployment,
      conceptPrompt: template.conceptPrompt,
      error: null,
    };
  } catch (err) {
    return {
      deployment: null,
      conceptPrompt: template.conceptPrompt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
