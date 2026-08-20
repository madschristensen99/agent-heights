import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { execSync } from "node:child_process";
import type { BridgeClient, ExternalEvent } from "./ws-client.js";

const LANG_MAP: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
  ".py": "python", ".rs": "rust", ".go": "go", ".java": "java", ".rb": "ruby",
  ".css": "css", ".html": "html", ".json": "json", ".md": "markdown", ".sql": "sql",
};

const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".cache"]);

export function startWatcher(
  bridge: BridgeClient,
  dir: string,
  opts?: { pollMs?: number },
): () => void {
  const pollMs = opts?.pollMs ?? 3000;
  const watchers: FSWatcher[] = [];
  const fileLines = new Map<string, number>();

  // Get initial git branch
  let lastBranch = getGitBranch(dir);
  let filesChanged = 0;
  let linesAdded = 0;
  let linesRemoved = 0;

  // Recursively watch directory
  function watchDir(d: string, depth = 0): void {
    if (depth > 5) return;
    readdir(d, { withFileTypes: true }).then(entries => {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          const sub = join(d, entry.name);
          watchDir(sub, depth + 1);
        }
      }
    }).catch(() => { /* ignore */ });

    try {
      const w = watch(d, { persistent: false }, (event, filename) => {
        if (!filename) return;
        const fullPath = join(d, filename);
        const rel = relative(dir, fullPath);
        if (IGNORED_DIRS.has(rel.split("/")[0])) return;

        if (event === "change") {
          handleFileChange(fullPath, rel);
        }
      });
      watchers.push(w);
    } catch { /* ignore */ }
  }

  function handleFileChange(fullPath: string, rel: string): void {
    const ext = extname(fullPath);
    if (!LANG_MAP[ext] && ext !== "") return;

    stat(fullPath).then(st => {
      if (!st.isFile()) return;
      return readFile(fullPath, "utf-8");
    }).then(content => {
      if (!content) return;
      const newLines = content.split("\n").length;
      const oldLines = fileLines.get(rel);
      if (oldLines !== undefined) {
        const diff = newLines - oldLines;
        if (diff > 0) linesAdded += diff;
        else if (diff < 0) linesRemoved += -diff;
        filesChanged++;
      }
      fileLines.set(rel, newLines);

      const ev: ExternalEvent = {
        type: "file_edit",
        timestamp: Date.now(),
        file: rel,
        linesAdded: Math.max(0, newLines - (oldLines ?? newLines)),
        linesRemoved: Math.max(0, (oldLines ?? newLines) - newLines),
      };
      bridge.pushEvent(ev);
      bridge.activity("active", {
        currentFile: rel,
        language: LANG_MAP[ext],
        gitBranch: lastBranch,
        filesChanged,
        linesAdded,
        linesRemoved,
      });
    }).catch(() => { /* file deleted or unreadable */ });
  }

  // Initialize line counts
  function initLineCounts(d: string, depth = 0): void {
    if (depth > 5) return;
    readdir(d, { withFileTypes: true }).then(entries => {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          initLineCounts(join(d, entry.name), depth + 1);
        } else {
          const ext = extname(entry.name);
          if (!LANG_MAP[ext]) continue;
          const fullPath = join(d, entry.name);
          readFile(fullPath, "utf-8").then(content => {
            fileLines.set(relative(dir, fullPath), content.split("\n").length);
          }).catch(() => { /* ignore */ });
        }
      }
    }).catch(() => { /* ignore */ });
  }

  // Poll git branch changes
  const gitTimer = setInterval(() => {
    const branch = getGitBranch(dir);
    if (branch && branch !== lastBranch) {
      lastBranch = branch;
      const ev: ExternalEvent = {
        type: "git_branch",
        timestamp: Date.now(),
        message: `Switched to ${branch}`,
      };
      bridge.pushEvent(ev);
      bridge.activity("active", { gitBranch: branch });
    }
  }, pollMs);

  // Periodic flush
  const flushTimer = setInterval(() => bridge.flushEvents(), 2000);

  // Start watching
  watchDir(dir);
  initLineCounts(dir);

  // Initial activity
  bridge.activity("active", { gitBranch: lastBranch });

  // Return cleanup function
  return () => {
    for (const w of watchers) w.close();
    clearInterval(gitTimer);
    clearInterval(flushTimer);
  };
}

function getGitBranch(dir: string): string | undefined {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: dir, encoding: "utf-8" }).trim() || undefined;
  } catch { return undefined; }
}
