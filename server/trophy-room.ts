/**
 * Trophy Room HTML renderer — server-side rendered public profile page.
 *
 * Generates a shareable HTML page at /u/{username} showing:
 * - Player name and workspace
 * - Achievement trophies grid
 * - Combat record stats
 * - Crown/weapon display
 * - Speedrun time (if completed)
 */

import type { TrophyProfile } from "../shared/types.js";

const BRAND_BG = "#0d0f1a";
const BRAND_ACCENT = "#58c866";
const BRAND_MUTED = "#7a8090";
const BRAND_TEXT = "#e0e0e0";
const BRAND_CARD = "#161929";
const BRAND_BORDER = "#2a2d3f";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function renderTrophyPage(profile: TrophyProfile): string {
  const { playerName, workspaceName, stats, weaponsCollected, crownPlaced, speedrunTimeMs, agentCount } = profile;

  const tasksDone = stats.tasksDone ?? 0;
  const creaturesKilled = stats.creaturesKilled ?? 0;
  const bossesSlain = stats.bossesSlain ?? 0;
  const holeInOnes = stats.holeInOnes ?? 0;
  const treesChopped = stats.treesChopped ?? 0;
  const flowersPicked = stats.flowersPicked ?? 0;
  const agentsFired = stats.agentsFired ?? 0;
  const agentsRecruited = stats.agentsRecruited ?? 0;
  const boardCardsDone = stats.boardCardsDone ?? 0;
  const maxDepth = stats.maxDepth ?? 0;

  const achievementCount = profile.unlockedAchievements.length;

  // Build stats grid
  const statItems = [
    { icon: "📋", label: "Tasks Completed", value: tasksDone },
    { icon: "🤖", label: "Agents Hired", value: agentCount },
    { icon: "⚔️", label: "Creatures Killed", value: creaturesKilled },
    { icon: "🐲", label: "Bosses Slain", value: bossesSlain },
    { icon: "🗡️", label: "Weapons Collected", value: weaponsCollected.length },
    { icon: "⛳", label: "Hole-in-Ones", value: holeInOnes },
    { icon: "🪓", label: "Trees Chopped", value: treesChopped },
    { icon: "💐", label: "Flowers Picked", value: flowersPicked },
    { icon: "🔥", label: "Agents Fired", value: agentsFired },
    { icon: "🤝", label: "Agents Recruited Back", value: agentsRecruited },
    { icon: "📌", label: "Board Cards Done", value: boardCardsDone },
    { icon: "🧭", label: "Deepest Exploration", value: `${maxDepth} chunks` },
  ];

  const statsGrid = statItems.map(s => `
    <div class="stat-card">
      <span class="stat-icon">${s.icon}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-label">${s.label}</span>
    </div>`).join("");

  // Build weapons display
  const weaponEmojis: Record<string, string> = {
    tennis_racket: "🎾", golf_club: "⛳", axe: "🪓", iron_sword: "🗡️",
    void_blade: "🔮", flame_greatsword: "⚔️", void_daggers: "🗡️", crystal_bow: "🏹",
  };
  const weaponsDisplay = weaponsCollected.length > 0
    ? weaponsCollected.map(w => `<span class="weapon-badge" title="${w}">${weaponEmojis[w] ?? "🗡️"}</span>`).join("")
    : `<span class="empty-state">No weapons collected yet</span>`;

  // Crown display
  const crownDisplay = crownPlaced
    ? `<div class="crown-display"><span class="crown-icon">👑</span><span>Sovereign Crown Placed</span></div>`
    : "";

  // Speedrun display
  const speedrunDisplay = speedrunTimeMs && speedrunTimeMs > 0
    ? `<div class="speedrun-display"><span class="speedrun-icon">⏱️</span><span>Speedrun: ${formatDuration(speedrunTimeMs)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtmlAttr(playerName)} — Agent Heights Trophy Room</title>
  <meta property="og:title" content="${escapeHtmlAttr(playerName)}'s Trophy Room — Agent Heights" />
  <meta property="og:description" content="Tasks: ${tasksDone} | Bosses: ${bossesSlain} | Weapons: ${weaponsCollected.length} | Achievements: ${achievementCount}" />
  <meta property="og:type" content="profile" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${BRAND_BG}; color: ${BRAND_TEXT};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh; padding: 2rem 1rem;
    }
    .container { max-width: 720px; margin: 0 auto; }
    .header {
      text-align: center; padding: 2rem 1rem; margin-bottom: 1.5rem;
      background: ${BRAND_CARD}; border: 1px solid ${BRAND_BORDER}; border-radius: 16px;
    }
    .header h1 { font-size: 1.8rem; color: ${BRAND_ACCENT}; margin-bottom: 0.25rem; }
    .header .workspace { color: ${BRAND_MUTED}; font-size: 0.95rem; }
    .header .badges { display: flex; justify-content: center; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
    .crown-display, .speedrun-display {
      display: inline-flex; align-items: center; gap: 0.4rem;
      background: rgba(88,200,102,0.1); border: 1px solid ${BRAND_ACCENT};
      padding: 0.4rem 0.8rem; border-radius: 8px; font-size: 0.85rem;
    }
    .crown-icon, .speedrun-icon { font-size: 1.1rem; }
    .section {
      background: ${BRAND_CARD}; border: 1px solid ${BRAND_BORDER};
      border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;
    }
    .section-title {
      font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em;
      color: ${BRAND_MUTED}; margin-bottom: 1rem;
    }
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem;
    }
    .stat-card {
      background: ${BRAND_BG}; border: 1px solid ${BRAND_BORDER}; border-radius: 8px;
      padding: 0.75rem; text-align: center; display: flex; flex-direction: column; gap: 0.2rem;
    }
    .stat-icon { font-size: 1.3rem; }
    .stat-value { font-size: 1.2rem; font-weight: 700; color: ${BRAND_ACCENT}; }
    .stat-label { font-size: 0.7rem; color: ${BRAND_MUTED}; }
    .weapons-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .weapon-badge {
      background: ${BRAND_BG}; border: 1px solid ${BRAND_BORDER}; border-radius: 8px;
      width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;
    }
    .empty-state { color: ${BRAND_MUTED}; font-style: italic; font-size: 0.85rem; }
    .footer { text-align: center; padding: 1rem; color: ${BRAND_MUTED}; font-size: 0.8rem; }
    .footer a { color: ${BRAND_ACCENT}; text-decoration: none; }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtmlAttr(playerName)}</h1>
      <div class="workspace">${escapeHtmlAttr(workspaceName) || "Agent Heights"}</div>
      <div class="badges">
        ${crownDisplay}
        ${speedrunDisplay}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Combat Record</div>
      <div class="stats-grid">${statsGrid}</div>
    </div>

    <div class="section">
      <div class="section-title">Weapons Collection</div>
      <div class="weapons-row">${weaponsDisplay}</div>
    </div>

    <div class="footer">
      <p>${achievementCount} achievements unlocked · Play at <a href="https://agentheights.com">agentheights.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

export function renderTrophyNotFound(username: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found — Agent Heights</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${BRAND_BG}; color: ${BRAND_TEXT};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .card { text-align: center; }
    .card h1 { color: ${BRAND_ACCENT}; font-size: 1.5rem; margin-bottom: 0.5rem; }
    .card p { color: ${BRAND_MUTED}; margin-bottom: 1rem; }
    .card a { color: ${BRAND_ACCENT}; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Office Not Found</h1>
    <p>No agent with the name "${escapeHtmlAttr(username)} was found.</p>
    <p><a href="https://agentheights.com">← Back to Agent Heights</a></p>
  </div>
</body>
</html>`;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
