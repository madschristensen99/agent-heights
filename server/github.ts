/**
 * GitHub REST API client — uses the user's stored GitHub PAT (from MCP keys)
 * to fork repos, create branches, and manage world forks.
 *
 * No external dependency — uses built-in fetch (Node 18+).
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/";
const SOURCE_REPO_OWNER = process.env.GITHUB_SOURCE_OWNER ?? "madschristensen99";
const SOURCE_REPO_NAME = process.env.GITHUB_SOURCE_REPO ?? "agent-hq";

/** Info about a forked repo. */
export interface RepoFork {
  owner: string;
  name: string;
  fullName: string;
  cloneUrl: string;
  branch: string;
}

/** A branch in a repo. */
export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

async function ghRequest(path: string, token: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...opts.headers,
    },
  });

  // Rate-limited: throw immediately — callers (MCP client) handle cooldown/backoff
  if (res.status === 429 || res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    const resetEpoch = res.headers.get("x-ratelimit-reset");
    const resetDate = resetEpoch ? new Date(Number(resetEpoch) * 1000).toISOString() : "unknown";
    const body = await res.text().catch(() => "");
    console.warn(`[github] rate limited on ${path}. Reset at ${resetDate}.`);
    throw new Error(`GitHub API rate limit exceeded (429). Reset at ${resetDate}. Body: ${body.slice(0, 200)}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Get the authenticated user's login. */
export async function getAuthenticatedUser(token: string): Promise<{ login: string; id: number } | null> {
  try {
    return await ghRequest("/user", token);
  } catch {
    return null;
  }
}

/** Fork the source repo into the user's account. */
export async function forkSourceRepo(token: string): Promise<RepoFork> {
  const data = await ghRequest(`/repos/${SOURCE_REPO_OWNER}/${SOURCE_REPO_NAME}/forks`, token, {
    method: "POST",
    body: JSON.stringify({ default_branch_only: true }),
  });
  return {
    owner: data.owner.login,
    name: data.name,
    fullName: data.full_name,
    cloneUrl: data.clone_url,
    branch: data.default_branch ?? "main",
  };
}

/** Create a new branch from an existing branch's HEAD. */
export async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch = "main",
): Promise<BranchInfo> {
  // Get the SHA of the source branch
  const refData = await ghRequest(`/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`, token);
  const sha = refData.object.sha;

  // Create the new branch ref
  await ghRequest(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  });

  return { name: branchName, sha, protected: false };
}

/** List branches in a repo. */
export async function listBranches(token: string, owner: string, repo: string): Promise<BranchInfo[]> {
  const data = await ghRequest(`/repos/${owner}/${repo}/branches?per_page=100`, token);
  return data.map((b: any) => ({ name: b.name, sha: b.commit.sha, protected: b.protected }));
}

/** Get a repo's info. */
export async function getRepo(token: string, owner: string, repo: string): Promise<any> {
  return ghRequest(`/repos/${owner}/${repo}`, token);
}

/** Delete a branch. */
export async function deleteBranch(token: string, owner: string, repo: string, branchName: string): Promise<void> {
  await ghRequest(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, token, {
    method: "DELETE",
  });
}

/** Delete a repo (must be owned by the authenticated user). */
export async function deleteRepo(token: string, owner: string, repo: string): Promise<void> {
  await ghRequest(`/repos/${owner}/${repo}`, token, {
    method: "DELETE",
  });
}

/** Get the user's GitHub token from stored MCP keys. */
export function getGithubToken(userId: string, mcpKeys: Record<string, string>): string | null {
  return mcpKeys[GITHUB_MCP_URL] ?? null;
}

// ── File operations for in-game code editing ──────────────────────────

/** A file or directory entry in a repo tree. */
export interface RepoTreeEntry {
  path: string;
  type: "file" | "dir";
  size: number;
}

/** List contents of a directory in a repo branch. */
export async function listRepoDir(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path = "",
): Promise<RepoTreeEntry[]> {
  const query = path ? `?ref=${branch}` : `?ref=${branch}`;
  const data = await ghRequest(`/repos/${owner}/${repo}/contents/${path}${query}`, token);
  if (!Array.isArray(data)) return [];
  return data.map((e: any) => ({
    path: e.path as string,
    type: e.type === "dir" ? "dir" : "file",
    size: e.size ?? 0,
  }));
}

/** Read a file's content from a repo branch. Returns decoded text. */
export async function readRepoFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<{ content: string; sha: string } | null> {
  const data = await ghRequest(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
  if (!data || data.type !== "file") return null;
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha as string };
}

/** Create or update a file in a repo branch. */
export async function writeRepoFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  sha: string | null,
  commitMessage: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;

  await ghRequest(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** Create a new file in a repo branch. */
export async function createRepoFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  commitMessage: string,
): Promise<void> {
  await writeRepoFile(token, owner, repo, branch, path, content, null, commitMessage);
}

/** Delete a file from a repo branch. */
export async function deleteRepoFile(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  sha: string,
  commitMessage: string,
): Promise<void> {
  await ghRequest(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "DELETE",
    body: JSON.stringify({ message: commitMessage, sha, branch }),
  });
}

export { SOURCE_REPO_OWNER, SOURCE_REPO_NAME };
