/**
 * Wizard GitHub Tools
 *
 * Injects GitHub file operations into a Cline agent so the Wizard NPC
 * can read and modify files on the world's Git branch. Uses a
 * server-side PAT (WIZARD_GITHUB_PAT) scoped to the agent-heights repo.
 *
 * Pattern follows CDP Solana / Crossmint wallet tools — auto-provisioned,
 * no user credentials needed.
 */

import type { AgentTool } from "@cline/sdk";
import {
  SOURCE_REPO_OWNER,
  SOURCE_REPO_NAME,
  listRepoDir,
  readRepoFile,
  writeRepoFile,
  createRepoFile,
  createBranch,
  listBranches,
  getAuthenticatedUser,
} from "../github.js";

export interface WizardContext {
  /** GitHub PAT scoped to the agent-heights repo. */
  pat: string;
  /** Branch name for this world (e.g. "worlds/erics-alley"). */
  branch: string;
}

/**
 * Create GitHub tools for the Wizard agent. These let the Wizard read,
 * write, and manage files on the world's Git branch.
 */
export async function loadWizardTools(ctx: WizardContext): Promise<AgentTool<any, any>[]> {
  const { pat, branch } = ctx;

  // Verify the token works and get the repo owner
  let repoOwner = SOURCE_REPO_OWNER;
  let repoName = SOURCE_REPO_NAME;
  try {
    const user = await getAuthenticatedUser(pat);
    if (user) {
      // Check if the user has a fork of the repo
      try {
        await listBranches(pat, user.login, repoName);
        repoOwner = user.login;
      } catch {
        // No fork — use the source repo (token must have access)
      }
    }
  } catch (err) {
    console.error("[wizard-tools] Failed to validate PAT:", err);
    return [];
  }

  const githubReadFile: AgentTool<any, any> = {
    name: "github_read_file",
    description:
      "Read a file from the world's Git branch. Returns the file content as text. " +
      "Use this to inspect existing code, configs, and assets before making changes.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file in the repo (e.g. 'client/src/game/scene.ts')",
        },
      },
      required: ["path"],
    },
    async execute(input: any) {
      try {
        const result = await readRepoFile(pat, repoOwner, repoName, branch, String(input.path));
        if (!result) return `File not found: ${input.path}`;
        return result.content;
      } catch (err) {
        return `Failed to read ${input.path}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubWriteFile: AgentTool<any, any> = {
    name: "github_write_file",
    description:
      "Create or update a file on the world's Git branch. The change is committed immediately. " +
      "Use this to modify code, configs, world-theme.json, or any other file in the repo.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file in the repo (e.g. 'assets/world-theme.json')",
        },
        content: {
          type: "string",
          description: "The full file content to write",
        },
        commitMessage: {
          type: "string",
          description: "A descriptive commit message",
        },
      },
      required: ["path", "content", "commitMessage"],
    },
    async execute(input: any) {
      try {
        const path = String(input.path);
        const content = String(input.content);
        const commitMessage = String(input.commitMessage ?? `Wizard: update ${path}`);
        // Try to get the existing file's SHA (for updates)
        let sha: string | null = null;
        try {
          const existing = await readRepoFile(pat, repoOwner, repoName, branch, path);
          if (existing) sha = existing.sha;
        } catch { /* file doesn't exist yet — that's fine */ }
        await writeRepoFile(pat, repoOwner, repoName, branch, path, content, sha, commitMessage);
        return `Successfully ${sha ? "updated" : "created"} ${path} on branch ${branch}`;
      } catch (err) {
        return `Failed to write ${input.path}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubCreateFile: AgentTool<any, any> = {
    name: "github_create_file",
    description:
      "Create a new file on the world's Git branch. Fails if the file already exists. " +
      "Use github_write_file instead if you want to overwrite an existing file.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path for the new file in the repo",
        },
        content: {
          type: "string",
          description: "The full file content",
        },
        commitMessage: {
          type: "string",
          description: "A descriptive commit message",
        },
      },
      required: ["path", "content", "commitMessage"],
    },
    async execute(input: any) {
      try {
        const path = String(input.path);
        const content = String(input.content);
        const commitMessage = String(input.commitMessage ?? `Wizard: create ${path}`);
        // Check if file already exists
        const existing = await readRepoFile(pat, repoOwner, repoName, branch, path).catch(() => null);
        if (existing) return `File already exists: ${path}. Use github_write_file to update it.`;
        await createRepoFile(pat, repoOwner, repoName, branch, path, content, commitMessage);
        return `Successfully created ${path} on branch ${branch}`;
      } catch (err) {
        return `Failed to create ${input.path}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubListDir: AgentTool<any, any> = {
    name: "github_list_dir",
    description:
      "List files and directories at a path on the world's Git branch. " +
      "Use this to explore the repo structure before reading or modifying files.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (e.g. 'client/src/game' or '' for root)",
        },
      },
    },
    async execute(input: any) {
      try {
        const path = String(input.path ?? "");
        const entries = await listRepoDir(pat, repoOwner, repoName, branch, path);
        if (entries.length === 0) return `Directory is empty or not found: ${path || "(root)"}`;
        return entries.map((e) => `${e.type === "dir" ? "[DIR] " : "      "}${e.path}`).join("\n");
      } catch (err) {
        return `Failed to list ${input.path ?? "(root)"}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubListBranches: AgentTool<any, any> = {
    name: "github_list_branches",
    description:
      "List all branches in the repo. Use this to see what worlds exist and find branch names.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const branches = await listBranches(pat, repoOwner, repoName);
        return branches.map((b) => `${b.name}${b.protected ? " (protected)" : ""}`).join("\n");
      } catch (err) {
        return `Failed to list branches: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubCreateBranch: AgentTool<any, any> = {
    name: "github_create_branch",
    description:
      "Create a new branch from the current world branch. Use this when the boss asks to " +
      "create a new world variant or experiment with changes on a separate branch.",
    inputSchema: {
      type: "object",
      properties: {
        branchName: {
          type: "string",
          description: "Name for the new branch (e.g. 'worlds/erics-alley-v2')",
        },
      },
      required: ["branchName"],
    },
    async execute(input: any) {
      try {
        const branchName = String(input.branchName);
        const result = await createBranch(pat, repoOwner, repoName, branchName, branch);
        return `Created branch ${result.name} (sha: ${result.sha}) from ${branch}`;
      } catch (err) {
        return `Failed to create branch: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const githubGetTheme: AgentTool<any, any> = {
    name: "github_get_theme",
    description:
      "Read the current world-theme.json file. Returns the full JSON content. " +
      "Use this to understand the current world configuration before modifying it.",
    inputSchema: { type: "object", properties: {} },
    async execute() {
      try {
        const result = await readRepoFile(pat, repoOwner, repoName, branch, "assets/world-theme.json");
        if (!result) return "No world-theme.json found. This world may not have a theme configured yet.";
        return result.content;
      } catch (err) {
        return `Failed to read world-theme.json: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };

  const tools = [
    githubReadFile,
    githubWriteFile,
    githubCreateFile,
    githubListDir,
    githubListBranches,
    githubCreateBranch,
    githubGetTheme,
  ];

  console.log(`[wizard-tools] Loaded ${tools.length} GitHub tools for branch ${branch} (repo: ${repoOwner}/${repoName})`);
  return tools;
}
