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
 * Build the world-theme.json content for a template.
 * Known templates (erics-alley, hawaii, old-south) get the full config
 * with furniture mappings, biomes, status colors, dialect, and asset paths
 * that activate the procedural rendering code already in the codebase.
 * Unknown/custom templates get a generic minimal config that the Wizard
 * NPC can expand later.
 */
function buildWorldThemeJson(template: WorldTemplate, slug: string, worldName?: string): string {
  const name = worldName ?? template.name;
  const seed = Math.floor(Math.random() * 2147483647);

  // Full configs for known templates — these match the specs in docs/WORLDS.md
  // and reference the procedural furniture/tile/map files already committed.
  const knownThemes: Record<string, any> = {
    "erics-alley": {
      id: "erics-alley",
      name,
      description: template.description,
      workMetaphor: "smoking",
      arrivalMetaphor: "van_delivery",
      office: {
        tilemapPath: "client/public/assets/maps/erics-alley.json",
        tilesetPath: "client/public/assets/tilesets/erics-alley.png",
        floorTile: 0,
        wallTile: 1,
        doorTile: 6,
      },
      furniture: {
        "17": "drawCardboardStationLeft",
        "18": "drawCardboardStationRight",
        "19": "drawCrateStool",
        "20": "drawDumpsterCabinet",
        "21": "drawBarrelFire",
        "22": "drawShoppingCartCooler",
        "23": "drawMattressSofaLeft",
        "24": "drawMattressSofaRight",
        "25": "drawFuseBoxRack",
        "26": "drawSteamVent",
        "27": "drawPuddle",
        "28": "drawTrashCan",
        "29": "drawSprayPaintCan",
        "30": "drawDeadPlant",
        "35": "drawFuseBoxScreen",
        "36": "drawFuseBoxScreen",
        "37": "drawManholeCover",
      },
      worldgen: {
        biomes: ["alley", "street", "abandoned", "undercity", "sewer", "hellmouth"],
        baseGround: { alley: 0, street: 6, abandoned: 7, undercity: 8, sewer: 9, hellmouth: 10 },
        obstacles: { alley: [2, 3, 4], street: [2, 24, 39], abandoned: [3, 37], undercity: [3, 9], sewer: [3, 21], hellmouth: [9, 11] },
        hostileTiles: { sewer: [9], hellmouth: [9, 11] },
        hostilityThresholds: [2, 4, 7, 11, 18],
      },
      statusColors: { idle: 6971752, thinking: 15138488, working: 5019238, done: 4882074, error: 15138488, waiting: 11822852 },
      dialect: {
        systemPromptSuffix: "Speak with a gritty urban street accent. Use slang like 'yo', 'ain't', 'cuz', 'hood'. Keep it real and direct.",
        chatStyle: "street_urban",
        emotes: ["yo", "nah", "bet"],
      },
      assets: {
        tilesetPath: "client/public/assets/tilesets/erics-alley.png",
        characterSpritesheetPath: "client/public/assets/characters/erics-alley-chars.png",
        furnitureSpritesheetPath: "client/public/assets/sprites/erics-alley-furniture.png",
        worldTileSpritesheetPath: "client/public/assets/tilesets/erics-alley-world.png",
        assetTier: "procedural",
      },
    },
    hawaii: {
      id: "hawaii",
      name,
      description: template.description,
      workMetaphor: "fire_spinning",
      arrivalMetaphor: "outrigger_delivery",
      office: {
        tilemapPath: "client/public/assets/maps/hawaii.json",
        tilesetPath: "client/public/assets/tilesets/hawaii.png",
        floorTile: 0,
        wallTile: 1,
        doorTile: 6,
      },
      furniture: {
        "17": "drawTorchStationLeft",
        "18": "drawTorchStationRight",
        "19": "drawLogStool",
        "20": "drawTreasureChest",
        "21": "drawHibiscus",
        "22": "drawOceanView",
        "23": "drawTikiBarTop",
        "24": "drawTikiBarBottom",
        "25": "drawRainCatchment",
        "26": "drawPrepTable",
        "27": "drawLavaRockGrill",
        "28": "drawHammockLeft",
        "29": "drawHammockRight",
        "30": "drawPalmTree",
        "31": "drawPlumeria",
        "32": "drawCoconutGrill",
        "35": "drawTikiTotem",
        "36": "drawTikiTotemEyes",
        "37": "drawVolcanoVent",
      },
      worldgen: {
        biomes: ["beach", "jungle", "volcanic_ridge", "lava_tubes", "underwater_cave", "volcano_summit"],
        baseGround: { beach: 0, jungle: 6, volcanic_ridge: 7, lava_tubes: 8, underwater_cave: 9, volcano_summit: 10 },
        obstacles: { beach: [2, 3, 4], jungle: [2, 24, 39], volcanic_ridge: [3, 37], lava_tubes: [3, 9], underwater_cave: [3, 21], volcano_summit: [9, 11] },
        hostileTiles: { lava_tubes: [9], volcano_summit: [9, 11] },
        hostilityThresholds: [2, 4, 7, 11, 18],
      },
      statusColors: { idle: 7143424, thinking: 13834552, working: 5019238, done: 4882074, error: 15138488, waiting: 12240244 },
      dialect: {
        systemPromptSuffix: "Speak in Hawaiian Pidgin English. Use words like 'brah', 'da kine', 'pau', 'mahalo'. Keep it warm and friendly.",
        chatStyle: "hawaiian_pidgin",
        emotes: ["shaka", "mahalo", "chee_hoo"],
      },
      assets: {
        tilesetPath: "client/public/assets/tilesets/hawaii.png",
        characterSpritesheetPath: "client/public/assets/characters/hawaii-chars.png",
        furnitureSpritesheetPath: "client/public/assets/sprites/hawaii-furniture.png",
        worldTileSpritesheetPath: "client/public/assets/tilesets/hawaii-world.png",
        assetTier: "procedural",
      },
      conflict: {
        factionA: { name: "Shark Tribe", color: 43690, spriteKey: "faction-shark" },
        factionB: { name: "Turtle Tribe", color: 26624, spriteKey: "faction-turtle" },
      },
    },
    "old-south": {
      id: "old-south",
      name,
      description: template.description,
      workMetaphor: "harvesting",
      arrivalMetaphor: "carriage_delivery",
      office: {
        tilemapPath: "client/public/assets/maps/old-south.json",
        tilesetPath: "client/public/assets/tilesets/old-south.png",
        floorTile: 0,
        wallTile: 1,
        doorTile: 6,
      },
      furniture: {
        "17": "drawFieldPlotLeft",
        "18": "drawFieldPlotRight",
        "19": "drawWoodenStool",
        "20": "drawStorageChest",
        "21": "drawCottonSprig",
        "22": "drawShutterWindow",
        "23": "drawSweetTeaPitcher",
        "24": "drawWellPump",
        "25": "drawRainBarrel",
        "26": "drawSmokehouse",
        "27": "drawCastIronStove",
        "28": "drawPorchSwingLeft",
        "29": "drawPorchSwingRight",
        "30": "drawLiveOak",
        "31": "drawMagnoliaTree",
        "32": "drawHorseshoePit",
        "35": "drawSmokehouseVent",
        "36": "drawSmokehouseScreen",
        "37": "drawBrickChimney",
      },
      worldgen: {
        biomes: ["garden", "cotton_field", "pine_forest", "bayou", "battlefield", "infernal"],
        baseGround: { garden: 0, cotton_field: 6, pine_forest: 7, bayou: 21, battlefield: 12, infernal: 9 },
        obstacles: { garden: [2, 4, 28], cotton_field: [2, 3, 22], pine_forest: [2, 24, 37], bayou: [3, 21, 20], battlefield: [3, 12, 13], infernal: [9, 11, 13] },
        hostileTiles: { bayou: [21], battlefield: [5], infernal: [9, 11] },
        hostilityThresholds: [2, 4, 7, 11, 18],
      },
      statusColors: { idle: 8026762, thinking: 13935160, working: 5925450, done: 4882074, error: 12071928, waiting: 10118644 },
      dialect: {
        systemPromptSuffix: "Speak with a refined Southern drawl appropriate to the early 1800s Louisiana territory. Use period language like 'I do declare', 'reckon', 'yonder'. Be courtly and genteel but capable.",
        chatStyle: "southern_1812",
        emotes: ["declare", "reckon", "yonder"],
      },
      assets: {
        tilesetPath: "client/public/assets/tilesets/old-south.png",
        characterSpritesheetPath: "client/public/assets/characters/old-south-chars.png",
        furnitureSpritesheetPath: "client/public/assets/sprites/old-south-furniture.png",
        worldTileSpritesheetPath: "client/public/assets/tilesets/old-south-world.png",
        assetTier: "procedural",
      },
      conflict: {
        factionA: { name: "Union", color: 30840, spriteKey: "faction-union" },
        factionB: { name: "Confederacy", color: 9211020, spriteKey: "faction-confederate" },
      },
    },
  };

  // Look up by template name slug (template.name lowercased and dashed)
  const templateSlug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const known = knownThemes[templateSlug] ?? knownThemes[slug];

  if (known) {
    // Override name/description if custom world name was provided
    known.name = name;
    known.description = template.description;
    return JSON.stringify(known, null, 2);
  }

  // Generic minimal config for unknown/custom templates
  return JSON.stringify({
    id: slug,
    name,
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
      seed,
      biomeScale: 0.003,
      hostilityScale: 0.004,
    },
    interactables: {},
    assets: {
      tilesetPath: "assets/tilesets/world.png",
      assetTier: "procedural",
    },
  }, null, 2);
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

    // Commit the full world-theme.json for known templates, or a generic
    // minimal one for custom/unknown templates. The full config includes
    // furniture mappings, biomes, status colors, dialect, and asset paths
    // that activate the procedural rendering code already in the codebase.
    const themeJson = buildWorldThemeJson(template, slug, worldName);

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
