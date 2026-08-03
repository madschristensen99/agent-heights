/**
 * Office Screenshot Generator
 *
 * Generates PNG screenshots of the Agent Heights office status using Playwright.
 * Renders an HTML template with agent sprites positioned at their desks, then
 * screenshots it. Used to send visual office updates to Telegram.
 */
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentInfo, AgentStatus } from "../shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = join(__dirname, "..", "shared", "img");
const OUTPUT_DIR = "/tmp/agent-heights-screenshots";

function spritePathForAgent(info: AgentInfo): string {
  // Map special agents to their sprites
  if (info.id === "agent-resources") return join(IMG_DIR, "char-agent-resources.png");
  if (info.id === "hermes") return join(IMG_DIR, "char-hermes.png");
  // Use sprite index for regular agents (char-0 through char-7)
  const idx = Math.max(0, Math.min(7, info.sprite ?? 0));
  return join(IMG_DIR, `char-${idx}.png`);
}

function statusEmoji(status: AgentStatus): string {
  switch (status) {
    case "working": return "🔧";
    case "thinking": return "💭";
    case "done": return "✅";
    case "error": return "❌";
    case "idle": return "😴";
    case "waiting": return "⏳";
    default: return "❓";
  }
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case "working": return "#4a9";
    case "thinking": return "#8af";
    case "done": return "#5c5";
    case "error": return "#e55";
    case "idle": return "#999";
    case "waiting": return "#b47ec4";
    default: return "#999";
  }
}

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just started";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m in`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m in`;
}

function imgToBase64(path: string): string {
  if (!existsSync(path)) return "";
  const buf = readFileSync(path);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export interface OfficeSnapshotAgent {
  info: AgentInfo;
  task: string | null;
  taskStartedAt?: number;
}

/**
 * Generate a PNG screenshot of the current office state.
 * Returns the file path to the saved PNG, or null on failure.
 */
export async function generateOfficeScreenshot(
  agents: OfficeSnapshotAgent[],
  caption?: string,
): Promise<string | null> {
  try {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

    const officeBg = imgToBase64(join(IMG_DIR, "office-classic.png"));
    const bossImg = imgToBase64(join(IMG_DIR, "boss.png"));

    // Build agent cards
    const now = Date.now();
    const agentCards = agents.map((a) => {
      const sprite = imgToBase64(spritePathForAgent(a.info));
      const emoji = statusEmoji(a.info.status);
      const color = statusColor(a.info.status);
      const task = a.task ? a.task.slice(0, 60) : "Waiting for tasks...";
      const elapsed = a.taskStartedAt && (a.info.status === "working" || a.info.status === "thinking")
        ? formatElapsed(now - a.taskStartedAt)
        : null;
      const isHermes = a.info.id === "hermes";

      return `
        <div class="agent-card" style="border-left-color: ${color}">
          <div class="sprite-wrap">
            ${sprite ? `<img src="${sprite}" class="sprite" />` : '<div class="sprite-placeholder">?</div>'}
            <div class="status-emoji">${emoji}</div>
          </div>
          <div class="agent-info">
            <div class="agent-name">${a.info.name}${isHermes ? " <span class=\"badge\">mail clerk</span>" : ""}</div>
            <div class="agent-role">${a.info.title || a.info.role || "worker"}</div>
            <div class="agent-task" title="${(a.task ?? "").replace(/"/g, '&quot;')}">${task}</div>
            ${elapsed ? `<div class="agent-elapsed">${elapsed}</div>` : ""}
          </div>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 800px;
    background: #1a1a2e;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    padding: 24px;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 2px solid #333;
  }
  .header img { width: 48px; height: 48px; border-radius: 8px; }
  .header h1 {
    color: #e0e0e0;
    font-size: 22px;
    font-weight: 600;
  }
  .header .subtitle {
    color: #888;
    font-size: 13px;
  }
  .office-bg {
    width: 100%;
    height: 80px;
    border-radius: 8px;
    margin-bottom: 16px;
    overflow: hidden;
    background: #2a2a3e;
  }
  .office-bg img { width: 100%; height: 100%; object-fit: cover; opacity: 0.6; }
  .agents-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .agent-card {
    display: flex;
    gap: 12px;
    background: #252535;
    border-radius: 10px;
    padding: 12px;
    border-left: 4px solid #999;
    align-items: center;
  }
  .sprite-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .sprite {
    width: 64px;
    height: 64px;
    image-rendering: pixelated;
    border-radius: 6px;
    background: #1a1a2e;
  }
  .sprite-placeholder {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #333;
    color: #666;
    border-radius: 6px;
    font-size: 24px;
  }
  .status-emoji {
    position: absolute;
    bottom: -2px;
    right: -2px;
    font-size: 18px;
    background: #1a1a2e;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .agent-info {
    flex: 1;
    min-width: 0;
  }
  .agent-name {
    color: #e0e0e0;
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .agent-role {
    color: #888;
    font-size: 11px;
    margin-bottom: 4px;
    text-transform: capitalize;
  }
  .agent-task {
    color: #aaa;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .agent-elapsed {
    color: #6a8;
    font-size: 11px;
    margin-top: 2px;
  }
  .badge {
    display: inline-block;
    background: #4a9;
    color: #1a1a2e;
    font-size: 9px;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
    text-transform: uppercase;
    vertical-align: middle;
  }
  .caption {
    color: #ccc;
    font-size: 14px;
    margin-top: 16px;
    padding: 12px 16px;
    border-top: 1px solid #333;
    text-align: center;
    background: #22223a;
    border-radius: 8px;
    font-style: italic;
  }
  .timestamp {
    color: #555;
    font-size: 11px;
    text-align: right;
    margin-top: 8px;
  }
</style>
</head>
<body>
  <div class="header">
    ${bossImg ? `<img src="${bossImg}" />` : ""}
    <div>
      <h1>Agent Heights Office</h1>
      <div class="subtitle">${agents.length} agent${agents.length !== 1 ? "s" : ""} on duty</div>
    </div>
  </div>
  ${officeBg ? `<div class="office-bg"><img src="${officeBg}" /></div>` : ""}
  <div class="agents-grid">
    ${agentCards}
  </div>
  ${caption ? `<div class="caption">${caption}</div>` : ""}
  <div class="timestamp">${new Date().toLocaleString()}</div>
</body>
</html>`;

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.waitForTimeout(200); // let images load

    const filename = `office-${Date.now()}.png`;
    const filepath = join(OUTPUT_DIR, filename);
    await page.screenshot({ path: filepath, type: "png" });
    await browser.close();

    console.log(`[office-screenshot] Generated ${filepath}`);
    return filepath;
  } catch (err) {
    console.warn(`[office-screenshot] Failed to generate screenshot: ${err}`);
    return null;
  }
}
