import type { Net } from "../net";
import type { FeedItem, PendingInvite, Store } from "../store";
import type { AgentRole, CardStatus, LogEntry, OfficeTheme, Provider, TaskCard, TaskPhase, CharAppearance, MCPServerConfig, PersonalityTraits, AgentInfo } from "../../../shared/types";
import { AGENT_MODELS, OFFICE_THEMES, OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID, SCHEDULE_PRESETS,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES,
  ACCENT_COLOR_OPTIONS, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
  randomAppearance, DEFAULT_APPEARANCE, isValidAppearance, randomPersonality,
  SUBSCRIPTION_TIER_LIST, type SubscriptionTier,
} from "../../../shared/types";
import { md } from "./md";
import { achievements, ACHIEVEMENTS } from "../game/achievements";
import { touchInput, isTouchDevice } from "../touch";
import { generateCharPreviewDataURL } from "../game/chargen";
import { MarketplaceBrowser } from "./marketplace";
import type { MarketplaceAgent } from "../../../shared/marketplace";
import { SECURITY_NOTES } from "../../../shared/mcp-catalog";
import { getToken, getUserEmail, getUserId, signOut, isAuthEnabled, onAuthChange } from "../auth";
import { startSubscriptionCheckout, openCustomerPortal } from "../payment";
let monacoModule: typeof import("monaco-editor") | null = null;

const NAME_POOL = [
  "Pixel", "Mocha", "Byte", "Clippy", "Turbo", "Wren", "Dot", "Gizmo",
  "Nova", "Patch", "Echo", "Quill", "Zippy", "Lumen", "Socket", "Beep",
];

const PLAYER_KEY = "agent-heights-player";
const OLD_PLAYER_KEY = "sprite-heights-player";
try { const old = localStorage.getItem(OLD_PLAYER_KEY); if (old && !localStorage.getItem(PLAYER_KEY)) { localStorage.setItem(PLAYER_KEY, old); localStorage.removeItem(OLD_PLAYER_KEY); } } catch {}

/** In-game styled confirmation modal — replaces browser confirm() to preserve immersion. */
function inlineConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  const modal = document.createElement("div");
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;";
  modal.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:0.75rem;padding:1.5rem;max-width:360px;width:90vw;text-align:center;font-family:'M Plus Rounded 1c',sans-serif;">
      <h3 style="margin:0 0 0.5rem;font-size:1.05rem;color:#e0e0e0;">${title}</h3>
      <p style="color:#888;font-size:0.82rem;margin:0 0 1.25rem;line-height:1.4;">${message}</p>
      <div style="display:flex;gap:0.75rem;justify-content:center;">
        <button id="ic-cancel" style="padding:0.5rem 1.25rem;border:1px solid #333;border-radius:0.5rem;background:#1a1a1a;color:#999;font-size:0.85rem;cursor:pointer;">Cancel</button>
        <button id="ic-confirm" style="padding:0.5rem 1.25rem;border:none;border-radius:0.5rem;background:#c44a4a;color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;">${confirmLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#ic-cancel")!.addEventListener("click", () => modal.remove());
  modal.querySelector("#ic-confirm")!.addEventListener("click", () => { modal.remove(); onConfirm(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

// ----------------------------------------------------------- character builder

interface BuilderPart {
  key: keyof CharAppearance;
  label: string;
  options: string[];
  max: number;
}

const BUILDER_PARTS: BuilderPart[] = [
  { key: "skin",      label: "SKIN",      options: SKIN_TONES,          max: SKIN_TONES.length },
  { key: "hairStyle", label: "HAIR STYLE",options: HAIR_STYLES,         max: HAIR_STYLES.length },
  { key: "hair",      label: "HAIR COLOR",options: HAIR_COLORS,         max: HAIR_COLORS.length },
  { key: "beard",     label: "BEARD",     options: BEARD_STYLES,        max: BEARD_STYLES.length },
  { key: "shirt",     label: "SHIRT",     options: SHIRT_COLORS,        max: SHIRT_COLORS.length },
  { key: "pants",     label: "PANTS",     options: PANTS_COLORS,        max: PANTS_COLORS.length },
  { key: "accessory", label: "ACCESSORY", options: ACCESSORIES,         max: ACCESSORIES.length },
  { key: "headFeature",label:"HEAD FEAT", options: HEAD_FEATURES,       max: HEAD_FEATURES.length },
  { key: "eyeColor",  label: "EYE COLOR", options: EYE_COLORS,          max: EYE_COLORS.length },
  { key: "accent",    label: "ACCENT",    options: ACCENT_COLOR_OPTIONS,max: ACCENT_COLOR_OPTIONS.length },
];

/** Renders the character builder HTML and wires up arrow selectors + live preview. */
class CharBuilder {
  private appearance: CharAppearance;
  private prefix: string;
  private onPreview: (ap: CharAppearance) => void;

  constructor(prefix: string, initial: CharAppearance, onPreview: (ap: CharAppearance) => void) {
    this.prefix = prefix;
    this.appearance = { ...initial };
    this.onPreview = onPreview;
  }

  /** Returns the HTML string for the builder UI. */
  html(): string {
    const p = this.prefix;
    const rows = BUILDER_PARTS.map((part) => {
      const idx = this.appearance[part.key];
      const val = part.options[idx % part.max];
      const isColor = part.key !== "hairStyle" && part.key !== "accessory" && part.key !== "beard" && part.key !== "headFeature";
      const swatch = isColor ? `<span class="builder-swatch" style="background:${val}"></span>` : "";
      return `
        <div class="builder-row" data-part="${part.key}">
          <button class="builder-arrow" data-dir="-1">◀</button>
          <span class="builder-label">${part.label}</span>
          <span class="builder-value">${swatch}<span class="builder-value-text">${isColor ? "" : val}</span></span>
          <button class="builder-arrow" data-dir="1">▶</button>
        </div>`;
    }).join("");

    return `
      <div class="char-builder" id="${p}-builder">
        <div class="builder-preview-wrap">
          <div class="sprite-preview builder-preview" id="${p}-preview"></div>
        </div>
        <button class="builder-randomize" id="${p}-randomize">🎲 RANDOMIZE</button>
        <div class="builder-controls">
          ${rows}
        </div>
      </div>`;
  }

  /** Wire up event listeners after the HTML is in the DOM. */
  mount(): void {
    const p = this.prefix;
    const root = document.getElementById(`${p}-builder`);
    if (!root) return;

    root.querySelectorAll<HTMLElement>(".builder-row").forEach((row) => {
      const partKey = row.dataset.part as keyof CharAppearance;
      const part = BUILDER_PARTS.find((b) => b.key === partKey)!;
      row.querySelectorAll<HTMLElement>(".builder-arrow").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = Number(btn.dataset.dir);
          const cur = this.appearance[partKey];
          this.appearance[partKey] = (cur + dir + part.max) % part.max;
          this.updateRow(row, part);
          this.refreshPreview();
        });
      });
    });

    const randBtn = document.getElementById(`${p}-randomize`);
    if (randBtn) {
      randBtn.addEventListener("click", () => {
        this.appearance = randomAppearance();
        root.querySelectorAll<HTMLElement>(".builder-row").forEach((row) => {
          const partKey = row.dataset.part as keyof CharAppearance;
          const part = BUILDER_PARTS.find((b) => b.key === partKey)!;
          this.updateRow(row, part);
        });
        this.refreshPreview();
      });
    }

    this.refreshPreview();
  }

  private updateRow(row: HTMLElement, part: BuilderPart): void {
    const idx = this.appearance[part.key];
    const val = part.options[idx % part.max];
    const isColor = part.key !== "hairStyle" && part.key !== "accessory" && part.key !== "beard" && part.key !== "headFeature";
    const valueEl = row.querySelector(".builder-value")!;
    const swatch = isColor ? `<span class="builder-swatch" style="background:${val}"></span>` : "";
    valueEl.innerHTML = `${swatch}<span class="builder-value-text">${isColor ? "" : val}</span>`;
  }

  private refreshPreview(): void {
    const previewEl = document.getElementById(`${this.prefix}-preview`);
    if (previewEl) {
      previewEl.style.backgroundImage = `url('${generateCharPreviewDataURL(this.appearance, 3)}')`;
    }
    this.onPreview(this.appearance);
  }

  getAppearance(): CharAppearance {
    return { ...this.appearance };
  }

  setAppearance(ap: CharAppearance): void {
    this.appearance = { ...ap };
    const root = document.getElementById(`${this.prefix}-builder`);
    if (root) {
      root.querySelectorAll<HTMLElement>(".builder-row").forEach((row) => {
        const partKey = row.dataset.part as keyof CharAppearance;
        const part = BUILDER_PARTS.find((b) => b.key === partKey)!;
        this.updateRow(row, part);
      });
    }
    this.refreshPreview();
  }
}

/* Crisp inline icons — font glyphs like ⛶ render as tofu in the pixel font. */
const ICON = {
  expand: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M7 1h4v4"/><path d="M11 1 7 5"/><path d="M5 11H1V7"/><path d="M1 11l4-4"/></svg>`,
  shrink: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M11 5H7V1"/><path d="M7 5l4-4"/><path d="M1 7h4v4"/><path d="M5 7l-4 4"/></svg>`,
  collapse: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M2 4l4 4 4-4"/></svg>`,
  open: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6">
    <path d="M2 8l4-4 4 4"/></svg>`,
  history: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 5h10"/><path d="M3 8h10"/><path d="M3 11h6"/><path d="M2 2.5h12v11H2z" opacity="0.3"/></svg>`,
  brain: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3a2.5 2.5 0 0 0-2.5 2.5v5A2.5 2.5 0 0 0 8 13a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 8 3z"/><path d="M5.5 5.5a2 2 0 0 0-2 2"/><path d="M5.5 10.5a2 2 0 0 0-2-2"/><path d="M10.5 5.5a2 2 0 0 1 2 2"/><path d="M10.5 10.5a2 2 0 0 1 2-2"/><path d="M8 3v10"/></svg>`,
};

export class Hud {
  private lastLogCount = -1;
  private lastLogTail: LogEntry | null = null;
  private lastSelected: string | null = null;
  private lastFeedSeq = -1;
  private lastFeedVersion = -1;
  private lastRosterSig = "";
  private lastHandoffSig = "";
  private lastBoardSig = "";
  private detailMcpListener: ((results: { serverUrl: string; hasKey: boolean }[]) => void) | null = null;
  private detailCdpListener: ((msg: { agentId: string; address: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => void) | null = null;
  private detailCdpPolicyListener: ((msg: { agentId: string; policyId: string | null; maxSolPerTransfer: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; allowedTokenMints: string[] | null; blockedTokenMints: string[] | null; network: string; error?: string }) => void) | null = null;
  private detailCdpTxHistoryListener: ((msg: { agentId: string; transactions: { signature: string; slot: number; blockTime: number | null; err: boolean | null; memo: string | null }[] | null; error?: string }) => void) | null = null;
  private detailCdpOnrampListener: ((msg: { agentId: string; url: string | null; error?: string }) => void) | null = null;
  private cdpDetailAgentId: string | null = null;
  private detailCrossmintListener: ((msg: { agentId: string; address: string | null; chain: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => void) | null = null;
  private detailCrossmintPolicyListener: ((msg: { agentId: string; chain: string | null; spendingLimitUsd: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; description: string | null; error?: string }) => void) | null = null;
  private detailCrossmintTxHistoryListener: ((msg: { agentId: string; transactions: any[] | null; error?: string }) => void) | null = null;
  private detailCrossmintFundListener: ((msg: { agentId: string; success: boolean; message: string }) => void) | null = null;
  private detailCrossmintOnrampListener: ((msg: { agentId: string; url: string | null; error?: string }) => void) | null = null;
  private crossmintDetailAgentId: string | null = null;
  private _scheduleCreateOpen = false;
  private _renaming = false;
  private _scheduleEditingId: string | null = null;
  private scheduleCountdownTimer: ReturnType<typeof setInterval> | null = null;
  private lastSchedulesSig = "";
  private feedCollapsed = false;
  private feedExpanded = false;
  private rosterCollapsed = false;
  private renderQueued = false;
  private tourBannerDismissed = false;
  private perfVisible = false;
  private voiceBtn: HTMLButtonElement | null = null;
  private speakerBtn: HTMLButtonElement | null = null;
  private monacoEditor: any = null;
  private monacoFilePath: string | null = null;
  private codeEditorSig = "";
  private lastWardrobeOpen = false;
  private wardrobeBuilder: CharBuilder | null = null;

  constructor(
    private store: Store,
    private net: Net,
  ) {
    const root = document.getElementById("hud")!;
    root.innerHTML = `
      <div class="topbar">
        <span class="logo">AGENT&nbsp;HEIGHTS</span>
        <span id="workspace-name"></span>
        <button class="btn mini" id="marketplace-btn">🛒 MARKET</button>
        <button class="btn mini" id="rooms-btn">🚪 ROOMS</button>
        <button class="btn mini" id="worlds-btn">🌀 WORLDS</button>
        <button class="btn mini" id="voice-btn" title="Toggle microphone">🎤</button>
        <button class="btn mini" id="speaker-btn" title="Toggle speaker (mute/unmute incoming audio)">🔊</button>
        <button class="btn mini" id="settings-btn">⚙ SETTINGS</button>
        <button class="btn mini" id="help-btn" title="How to play">? HELP</button>
        <span id="user-menu" style="display:none; margin-left:auto; align-items:center; gap:0.5rem;">
          <span id="user-email" style="font-size:0.75rem; color:#888; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
          <button class="btn mini" id="signout-btn" title="Sign out" style="font-size:0.75rem;">⏻</button>
        </span>
        <span id="conn" class="conn">●</span>
      </div>
      <div class="panel roster" id="roster"></div>
      <div class="panel feed" id="feed">
        <div class="panel-title">OFFICE FEED
          <button class="icon-btn" id="feed-expand" title="Expand chat">${ICON.expand}</button>
          <button class="icon-btn" id="feed-toggle" title="Collapse">${ICON.collapse}</button>
        </div>
        <div class="logs feed-logs" id="feed-logs"></div>
        <textarea id="all-task" rows="2" placeholder="Task for the whole office…"></textarea>
        <button class="btn primary" id="all-assign">ASSIGN TO ALL ▶</button>
      </div>
      <button class="btn hire-btn" id="hire-btn">+ HIRE AGENT</button>
      <div class="panel detail" id="detail" hidden>
        <div class="panel-title" id="d-titlebar">
          <span id="d-title"></span>
          <button class="x" id="d-close">✕</button>
        </div>
        <div class="meta" id="d-meta"></div>
        <div class="task" id="d-task" hidden></div>
        <div id="d-mcp-section" hidden></div>
        <div id="d-security-section" hidden></div>
        <div id="d-acl-section" hidden></div>
        <div id="d-premium-section" hidden></div>
        <div id="d-cdp-section" hidden></div>
        <div id="d-crossmint-section" hidden></div>
        <div class="d-schedules" id="d-schedules" hidden></div>
        <div class="logs-wrap">
          <div class="logs" id="logs"></div>
          <button class="logs-history-btn" id="d-history" title="View conversation history">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
          </button>
        </div>
        <textarea id="task-input" rows="4" placeholder="Give them a task…"></textarea>
        <div class="handoff">WHEN DONE, HAND OFF TO
          <select id="d-handoff"><option value="">— nobody —</option></select>
        </div>
        <div class="row chat-row">
          <input id="d-chat" placeholder="Say something… (chat, not a task)" />
          <button class="btn" id="d-say">SAY</button>
        </div>
        <div class="row">
          <button class="btn primary" id="d-assign-new" title="Start a fresh conversation — agent keeps a summary of prior work">NEW TASK ▶</button>
          <button class="btn" id="d-assign" title="Continue the existing conversation — agent remembers everything">CONTINUE ▶</button>
          <button class="btn" id="d-stop">STOP</button>
          <button class="btn" id="d-clear">CLEAR</button>
          <button class="btn" id="d-vacation">VACATION</button>
          <button class="btn" id="d-fuse" title="Merge two agents into one">FUSE</button>
          <button class="btn danger" id="d-fire">FIRE</button>
        </div>
      </div>
      <div class="modal-backdrop" id="hire-modal" hidden></div>
      <div class="modal-backdrop" id="settings-modal" hidden></div>
      <div class="modal-backdrop" id="onboard-modal" hidden></div>
      <div class="modal-backdrop" id="achievements-modal" hidden></div>
      <div class="modal-backdrop" id="hall-of-fame-modal" hidden></div>
      <div class="modal-backdrop" id="railway-modal" hidden></div>
      <div class="modal-backdrop" id="github-modal" hidden></div>
      <div class="modal-backdrop" id="code-editor-modal" hidden></div>
      <div class="modal-backdrop" id="worlds-modal" hidden></div>
      <div class="modal-backdrop" id="wardrobe-modal" hidden></div>
      <div class="modal-backdrop" id="forge-modal" hidden></div>
      <div class="modal-backdrop" id="fuse-modal" hidden></div>
      <div class="board-panel" id="board-panel" hidden>
        <div class="panel-title" id="board-titlebar">
          <span>TASK BOARD</span>
          <button class="x" id="board-close">✕</button>
        </div>
        <div class="board-columns" id="board-columns"></div>
        <div class="board-add">
          <input id="board-new-title" maxlength="200" placeholder="New task title…" />
          <textarea id="board-new-desc" rows="2" placeholder="Description (optional)"></textarea>
          <button class="btn primary" id="board-add-btn">+ ADD CARD</button>
        </div>
      </div>
      <div class="gantt-panel" id="gantt-panel" hidden>
        <div class="panel-title" id="gantt-titlebar">
          <span>GANTT CHART</span>
          <button class="x" id="gantt-close">✕</button>
        </div>
        <div class="gantt-legend">
          <span class="gantt-leg phase-requirements">Requirements</span>
          <span class="gantt-leg phase-design">Design</span>
          <span class="gantt-leg phase-implementation">Implementation</span>
          <span class="gantt-leg phase-verification">Verification</span>
          <span class="gantt-leg phase-done">Done</span>
          <span class="gantt-leg gantt-milestone-leg">◆ Milestone</span>
          <span class="gantt-leg gantt-critical-leg">━ Critical Path</span>
        </div>
        <div class="gantt-timeline" id="gantt-timeline"></div>
      </div>
      <div class="vmodel-panel" id="vmodel-panel" hidden>
        <div class="panel-title" id="vmodel-titlebar">
          <span>V-MODEL LIFECYCLE</span>
          <button class="x" id="vmodel-close">✕</button>
        </div>
        <div class="vmodel-legend">
          <span class="vmodel-leg phase-requirements">Requirements</span>
          <span class="vmodel-leg phase-design">Design</span>
          <span class="vmodel-leg phase-implementation">Implementation</span>
          <span class="vmodel-leg phase-verification">Verification</span>
          <span class="vmodel-leg phase-done">Done</span>
          <span class="vmodel-leg vmodel-gate-passed">✓ Gate Passed</span>
          <span class="vmodel-leg vmodel-gate-blocked">⊘ Gate Blocked</span>
        </div>
        <div class="vmodel-diagram" id="vmodel-diagram"></div>
      </div>
      <div class="toasts" id="toasts"></div>
      <div class="hint">WASD/arrows move · E talk/board · H hire · F feed · B board · G gantt · N v-model · V voice · M manage projector · click an agent · ESC close · scroll to zoom</div>
      <div class="hint touch">Tap an agent to talk · Tap objects to interact · Pinch to zoom · 2-finger drag to pan</div>
      <div class="mobile-panel-backdrop" id="mobile-backdrop"></div>
      <div class="mobile-panel-toggles">
        <button class="mpt-btn" id="mpt-roster" title="Roster">👥</button>
        <button class="mpt-btn" id="mpt-feed" title="Feed">💬</button>
        <button class="mpt-btn" id="mpt-hire" title="Hire">➕</button>
        <button class="mpt-btn" id="mpt-board" title="Board">📋</button>
        <button class="mpt-btn" id="mpt-recenter" title="Recenter camera">🎯</button>
      </div>
      <div class="touch-controls">
        <div class="mobile-actions">
          <button class="mobile-action-btn primary" id="ma-interact" title="Interact / Talk">E</button>
          <button class="mobile-action-btn" id="ma-voice" title="Voice chat">🎤</button>
          <button class="mobile-action-btn" id="ma-teleport" title="Teleport">Q</button>
        </div>
      </div>
      <div id="server-restart-overlay" style="display:none; position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.7); align-items:center; justify-content:center; flex-direction:column; gap:1rem;">
        <div style="font-size:1.5rem; font-weight:bold; color:#e0e0e0; font-family:monospace; display:flex; align-items:center; gap:0.6rem;">
          <svg width="28" height="28" viewBox="0 0 48 48" style="animation: restart-spin 1.2s linear infinite;" fill="none" stroke="#4f9dde" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M38.8 18.6a16 16 0 1 0 1.2 6.4"/>
            <path d="M40 6v12h-12"/>
          </svg>
          Office Update In Progress
        </div>
        <div style="font-size:0.9rem; color:#9aa0b0; font-family:monospace;">Your agents will resume their tasks shortly…</div>
        <div style="width:120px; height:4px; background:#222; border-radius:2px; overflow:hidden;">
          <div style="width:40%; height:100%; background:#4f9dde; border-radius:2px; animation: restart-pulse 1.2s ease-in-out infinite;"></div>
        </div>
      </div>
    `;

    document.getElementById("hire-btn")!.addEventListener("click", () => this.openHireModal());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());
    document.getElementById("help-btn")!.addEventListener("click", () => this.showIntroGuide());
    document.getElementById("rooms-btn")!.addEventListener("click", () => {
      this.net.send({ type: "list_orgs" });
      this.openRoomsPanel();
    });
    document.getElementById("worlds-btn")!.addEventListener("click", () => {
      this.store.toggleWorldsPanel();
    });

    // ── Voice chat toggle ──────────────────────────────────────────────
    const voiceBtn = document.getElementById("voice-btn")! as HTMLButtonElement;
    voiceBtn.addEventListener("click", () => this.toggleVoice());
    this.voiceBtn = voiceBtn;

    // ── Speaker mute toggle (incoming audio) ───────────────────────────
    const speakerBtn = document.getElementById("speaker-btn")! as HTMLButtonElement;
    speakerBtn.addEventListener("click", () => this.toggleSpeaker());
    this.speakerBtn = speakerBtn;

    // User menu: show email + sign-out button (reactive to auth state)
    if (isAuthEnabled) {
      const userMenu = document.getElementById("user-menu")!;
      const emailEl = document.getElementById("user-email")!;
      const signoutBtn = document.getElementById("signout-btn")!;
      signoutBtn.addEventListener("click", () => {
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;";
        modal.innerHTML = `
          <div style="background:#1a1a1a;border:1px solid #333;border-radius:0.75rem;padding:1.5rem;max-width:340px;width:90vw;text-align:center;">
            <h3 style="margin:0 0 0.5rem;font-size:1.1rem;">Sign out of your office?</h3>
            <p style="color:#888;font-size:0.85rem;margin:0 0 1.25rem;">Your agents will keep working, but you'll need to sign back in to manage them.</p>
            <div style="display:flex;gap:0.75rem;justify-content:center;">
              <button id="signout-cancel" class="btn" style="padding:0.6rem 1.2rem;border-radius:0.5rem;border:1px solid #333;background:#222;color:#e0e0e0;cursor:pointer;">Cancel</button>
              <button id="signout-confirm" class="btn danger" style="padding:0.6rem 1.2rem;border-radius:0.5rem;border:none;background:#e05d5d;color:#fff;font-weight:600;cursor:pointer;">Sign out</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector("#signout-cancel")!.addEventListener("click", () => modal.remove());
        modal.querySelector("#signout-confirm")!.addEventListener("click", async () => {
          modal.remove();
          await signOut();
          location.reload();
        });
        modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
      });
      onAuthChange((state) => {
        if (state.session) {
          emailEl.textContent = getUserEmail() ?? "";
          userMenu.style.display = "inline-flex";
        } else {
          userMenu.style.display = "none";
        }
      });
    }

    const mqBrowser = new MarketplaceBrowser();
    mqBrowser.onHireAgent = (agent: MarketplaceAgent) => this.hireFromMarketplace(agent);
    mqBrowser.onHireCommunityMCP = (name: string, mcpConfig: MCPServerConfig) => this.hireCommunityMCP(name, mcpConfig);
    mqBrowser.onSetMcpKey = (serverUrl: string, apiKey: string) => {
      this.net.send({ type: "set_mcp_key", serverUrl, apiKey });
    };
    mqBrowser.onCheckMcpKeys = (serverUrls: string[]) => {
      this.net.send({ type: "check_mcp_keys", serverUrls });
    };
    mqBrowser.onStartMcpOAuth = (serverUrl: string) => {
      this.net.send({ type: "start_mcp_oauth", serverUrl, clientOrigin: window.location.origin });
    };
    const mcpKeysListener = (results: { serverUrl: string; hasKey: boolean }[]) => {
      if (mqBrowser.onMcpKeysStatusHandler) mqBrowser.onMcpKeysStatusHandler(results);
    };
    this.store.mcpKeysStatusListeners.push(mcpKeysListener);
    document.getElementById("marketplace-btn")!.addEventListener("click", () => mqBrowser.toggle());

    this.bindDetail();
    this.bindFeed();
    this.bindBoard();
    this.bindGantt();
    this.bindVModel();
    this.bindHallOfFame();
    this.bindRailwayPanel();
    this.bindGitHubPanel();
    this.bindCodeEditorPanel();
    this.bindWorldsPanel();
    this.bindForgePanel();
    this.bindShortcuts();
    this.bindMobileControls();
    // agents stream many messages per second — coalesce to one render per frame
    // so DOM work never starves the game loop
    store.subscribe(() => this.scheduleRender());
    store.onForgeUpdate(() => this.scheduleRender());
    store.onToast((text) => this.toast(text));
    store.outfitUpdateListeners.push(() => {
      if (this.store.wardrobeOpen) this.refreshOutfitList();
    });
    achievements.onUnlock((def) => {
      this.toast(`🏆 ${def.name} — ${def.desc}`);
    });

    // Show invite modal when a pending invite arrives
    store.subscribe(() => {
      if (store.pendingInvite) {
        const invite = store.pendingInvite;
        store.pendingInvite = null;
        this.showInviteModal(invite);
      }
    });

    // Live countdown for scheduled tasks
    this.scheduleCountdownTimer = setInterval(() => this.updateScheduleCountdowns(), 1000);

    this.maybeOnboard();
  }

  private updateScheduleCountdowns(): void {
    const els = document.querySelectorAll<HTMLElement>("[data-next-run]");
    if (els.length === 0) return;
    const now = Date.now();
    for (const el of els) {
      const ts = Number(el.dataset.nextRun);
      if (!ts) continue;
      const diff = ts - now;
      if (diff <= 0) {
        if (diff < -120_000) {
          el.textContent = "overdue";
          el.style.color = "var(--red, #e05d5d)";
        } else {
          el.textContent = "now";
          el.style.color = "var(--green)";
        }
      } else {
        const h = Math.floor(diff / 3_600_000);
        const m = Math.floor((diff % 3_600_000) / 60_000);
        const s = Math.floor((diff % 60_000) / 1000);
        el.textContent = h > 0 ? `in ${h}h ${m}m ${s}s` : m > 0 ? `in ${m}m ${s}s` : `in ${s}s`;
      }
    }
  }

  /** Stop the countdown timer (called on page unload). */
  destroy(): void {
    if (this.scheduleCountdownTimer) clearInterval(this.scheduleCountdownTimer);
  }

  // ---------------------------------------------------------- static wiring

  private bindDetail(): void {
    const input = document.getElementById("task-input") as HTMLTextAreaElement;
    document.getElementById("d-close")!.addEventListener("click", () => this.store.select(null));
    const logsEl = document.getElementById("logs")!;
    logsEl.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest(".log.collapsible") as HTMLElement | null;
      if (target) target.classList.toggle("expanded");
    });
    const handoffSel = document.getElementById("d-handoff") as HTMLSelectElement;
    document.getElementById("d-assign")!.addEventListener("click", () => {
      const id = this.store.selectedId;
      const task = input.value.trim();
      if (!id || !task) return;
      this.net.send({ type: "assign", agentId: id, task, handoffTo: handoffSel.value || undefined });
      input.value = "";
      handoffSel.value = "";
      achievements.unlock("first_task");
    });
    document.getElementById("d-assign-new")!.addEventListener("click", () => {
      const id = this.store.selectedId;
      const task = input.value.trim();
      if (!id || !task) return;
      this.net.send({ type: "assign_new", agentId: id, task, handoffTo: handoffSel.value || undefined });
      input.value = "";
      handoffSel.value = "";
      achievements.unlock("first_task");
    });
    const chatInput = document.getElementById("d-chat") as HTMLInputElement;
    const sendChat = () => {
      const id = this.store.selectedId;
      const text = chatInput.value.trim();
      if (!id || !text) return;
      this.net.send({ type: "chat", agentId: id, text });
      chatInput.value = "";
      achievements.unlock("chat_with_agent");
    };
    document.getElementById("d-say")!.addEventListener("click", sendChat);
    document.getElementById("d-history")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (agent) this.openConversationModal(agent.id, agent.name, agent.accent);
    });
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        (document.getElementById("d-assign-new") as HTMLButtonElement).click();
      }
    });
    document.getElementById("d-stop")!.addEventListener("click", () => {
      if (this.store.selectedId) this.net.send({ type: "stop", agentId: this.store.selectedId });
    });
    document.getElementById("d-clear")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (!agent) return;
      inlineConfirm(
        `Clear ${agent.name}?`,
        "Wipes all conversation memory, task history, and logs. Files in their workspace stay. Use NEW TASK instead if you want them to remember prior work.",
        "Clear",
        () => this.net.send({ type: "clear", agentId: agent.id }),
      );
    });
    document.getElementById("d-vacation")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (!agent) return;
      inlineConfirm(
        `Send ${agent.name} on vacation?`,
        "All data preserved — workspace, memory, and session. Restore them anytime.",
        "Vacation",
        () => this.net.send({ type: "vacation", agentId: agent.id }),
      );
    });
    document.getElementById("d-fire")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (!agent) return;
      inlineConfirm(
        `Fire ${agent.name}?`,
        "Their workspace files will be deleted. Inference and prompt logs are preserved. This cannot be undone.",
        "Fire",
        () => this.net.send({ type: "fire", agentId: agent.id }),
      );
    });
    document.getElementById("d-fuse")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (!agent) return;
      this.openFuseModal(agent.id);
    });
  }

  private bindFeed(): void {
    const allTask = document.getElementById("all-task") as HTMLTextAreaElement;
    const send = () => {
      const task = allTask.value.trim();
      if (!task) return;
      this.net.send({ type: "assign_all", task });
      allTask.value = "";
      achievements.unlock("first_task");
      achievements.unlock("broadcast");
    };
    document.getElementById("all-assign")!.addEventListener("click", send);
    allTask.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
    });
    document.getElementById("feed-toggle")!.addEventListener("click", () => this.toggleFeed());
    document.getElementById("feed-expand")!.addEventListener("click", () => this.toggleFeedExpand());
  }

  private bindBoard(): void {
    document.getElementById("board-close")!.addEventListener("click", () => this.store.toggleBoard(false));
    const titleEl = document.getElementById("board-new-title") as HTMLInputElement;
    const descEl = document.getElementById("board-new-desc") as HTMLTextAreaElement;
    const addCard = () => {
      const title = titleEl.value.trim();
      if (!title) return;
      this.net.send({ type: "create_card", title, description: descEl.value.trim() || undefined });
      titleEl.value = "";
      descEl.value = "";
    };
    document.getElementById("board-add-btn")!.addEventListener("click", addCard);
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addCard();
    });
  }

  private toggleFeed(): void {
    this.feedCollapsed = !this.feedCollapsed;
    this.feedExpanded = false;
    this.syncFeedClasses();
  }

  /** Grow the feed into a big chat panel (and back). Un-collapses if needed. */
  private toggleFeedExpand(): void {
    this.feedExpanded = !this.feedExpanded;
    this.feedCollapsed = false;
    this.syncFeedClasses();
    if (this.feedExpanded) {
      const el = document.getElementById("feed-logs")!;
      el.scrollTop = el.scrollHeight;
    }
  }

  private syncFeedClasses(): void {
    const feed = document.getElementById("feed")!;
    feed.classList.toggle("collapsed", this.feedCollapsed);
    feed.classList.toggle("expanded", this.feedExpanded);
    const expandBtn = document.getElementById("feed-expand")!;
    expandBtn.innerHTML = this.feedExpanded ? ICON.shrink : ICON.expand;
    expandBtn.title = this.feedExpanded ? "Shrink chat" : "Expand chat";
    const toggleBtn = document.getElementById("feed-toggle")!;
    toggleBtn.innerHTML = this.feedCollapsed ? ICON.open : ICON.collapse;
    toggleBtn.title = this.feedCollapsed ? "Open feed" : "Collapse";
  }

  private toggleVoice(): void {
    const scene = this.store.sceneRef;
    if (!scene) {
      this.store.toast("Voice chat unavailable — scene not ready.");
      return;
    }
    const voice = scene.voice;
    if (!voice) {
      this.store.toast("Voice chat unavailable.");
      return;
    }
    if (voice.active) {
      // Mic on → turn off mic, fall back to listen-only
      voice.stop();
      // Re-enter listen-only mode so we still hear others
      voice.startListenOnly().catch(() => {});
      if (this.voiceBtn) {
        this.voiceBtn.textContent = "🎤";
        this.voiceBtn.style.color = "";
      }
      const maVoice = document.getElementById("ma-voice");
      if (maVoice) { maVoice.textContent = "🎤"; maVoice.classList.remove("primary"); }
    } else {
      // Mic off → enable mic (upgrades from listen-only to full voice)
      voice.start().then(() => {
        if (this.voiceBtn) {
          this.voiceBtn.textContent = "🎙";
          this.voiceBtn.style.color = "#4caf50";
        }
        const maVoice = document.getElementById("ma-voice");
        if (maVoice) { maVoice.textContent = "🎙"; maVoice.classList.add("primary"); }
      }).catch((err: any) => {
        this.showMicPermissionHelp(err);
      });
    }
  }

  private toggleSpeaker(): void {
    const scene = this.store.sceneRef;
    if (!scene) {
      this.store.toast("Voice chat unavailable — scene not ready.");
      return;
    }
    const voice = scene.voice;
    if (!voice) {
      this.store.toast("Voice chat unavailable.");
      return;
    }
    const newMuted = !voice.outputMuted;
    voice.setOutputMuted(newMuted);
    if (this.speakerBtn) {
      this.speakerBtn.textContent = newMuted ? "🔇" : "🔊";
      this.speakerBtn.style.color = newMuted ? "#f44336" : "";
    }
  }

  private showMicPermissionHelp(err: any): void {
    const isFirefox = navigator.userAgent.includes("Firefox");
    const isChrome = navigator.userAgent.includes("Chrome") && !navigator.userAgent.includes("Edg");
    const isEdge = navigator.userAgent.includes("Edg");
    const isSafari = navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome");

    const browserName = isFirefox ? "Firefox" : isEdge ? "Edge" : isChrome ? "Chrome" : isSafari ? "Safari" : "your browser";
    const settingsUrl = isFirefox ? "about:preferences#privacy"
      : isEdge ? "edge://settings/content/microphone"
      : isChrome ? "chrome://settings/content/microphone"
      : "";

    const isDenied = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
    const isNotFound = err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError";

    const title = isNotFound ? "No Microphone Found" : isDenied ? "Microphone Access Denied" : "Microphone Error";
    const reason = isNotFound
      ? "We couldn't detect a microphone on your device. Make sure a mic is plugged in and enabled in your OS settings."
      : isDenied
      ? `You previously denied microphone access for this site. You need to reset the permission in ${browserName} to use voice chat.`
      : "An unexpected error occurred while accessing your microphone.";

    const steps = isNotFound
      ? "<li>Plug in a microphone or headset</li><li>Check your OS sound settings to ensure the mic is enabled</li><li>Refresh the page and try again</li>"
      : settingsUrl
      ? `<li>Copy the settings URL below and paste it in a new tab</li><li>Find this site in the "Block" list and change it to "Allow"</li><li>Refresh this page and click the 🎤 button again</li>`
      : `<li>Open ${browserName} settings → Privacy → Microphone</li><li>Allow microphone access for this site</li><li>Refresh this page and click the 🎤 button again</li>`;

    const modal = document.createElement("div");
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;";
    modal.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid #444;border-radius:0.75rem;padding:1.5rem;max-width:420px;width:90vw;color:#eee;">
        <h3 style="margin:0 0 0.5rem;font-size:1.1rem;color:#f44336;">${title}</h3>
        <p style="margin:0 0 1rem;font-size:0.85rem;color:#aaa;line-height:1.4;">${reason}</p>
        <ol style="margin:0 0 1rem;padding-left:1.2rem;font-size:0.85rem;color:#ccc;line-height:1.6;">${steps}</ol>
        ${settingsUrl ? `<div style="margin-bottom:1rem;"><input id="mic-url-input" readonly value="${settingsUrl}" style="width:100%;padding:0.4rem 0.6rem;background:#111;border:1px solid #333;border-radius:0.3rem;color:#8FC4E8;font-size:0.8rem;font-family:monospace;" /><button id="mic-copy-btn" style="margin-top:0.4rem;padding:0.3rem 0.8rem;border:1px solid #3A8CD4;background:transparent;color:#3A8CD4;border-radius:0.3rem;cursor:pointer;font-size:0.75rem;">Copy URL</button></div>` : ""}
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button id="mic-close-btn" style="padding:0.5rem 1rem;border:1px solid #555;background:#333;color:#eee;border-radius:0.4rem;cursor:pointer;font-size:0.8rem;">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = modal.querySelector("#mic-close-btn");
    closeBtn?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    const copyBtn = modal.querySelector("#mic-copy-btn");
    copyBtn?.addEventListener("click", () => {
      const input = modal.querySelector("#mic-url-input") as HTMLInputElement | null;
      if (input) {
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
          if (copyBtn instanceof HTMLButtonElement) {
            copyBtn.textContent = "Copied!";
            setTimeout(() => { copyBtn.textContent = "Copy URL"; }, 2000);
          }
        }).catch(() => {});
      }
    });
  }

  /** Global hotkeys: H hire · F feed · B board · , settings · ESC closes modals. */
  private bindShortcuts(): void {
    document.addEventListener("keydown", (e) => {
      const hire = document.getElementById("hire-modal")!;
      const settings = document.getElementById("settings-modal")!;
      const onboard = document.getElementById("onboard-modal")!;
      const ach = document.getElementById("achievements-modal")!;
      const hof = document.getElementById("hall-of-fame-modal")!;
      const railway = document.getElementById("railway-modal")!;
      const github = document.getElementById("github-modal")!;
      const codeEditor = document.getElementById("code-editor-modal")!;
      const worlds = document.getElementById("worlds-modal")!;
      const wardrobe = document.getElementById("wardrobe-modal")!;
      const forge = document.getElementById("forge-modal")!;
      const fuse = document.getElementById("fuse-modal")!;
      if (e.key === "Escape") {
        hire.hidden = true;
        settings.hidden = true;
        ach.hidden = true;
        hof.hidden = true;
        railway.hidden = true;
        github.hidden = true;
        codeEditor.hidden = true;
        worlds.hidden = true;
        wardrobe.hidden = true;
        forge.hidden = true;
        fuse.hidden = true;
        this.store.toggleForgePanel(false);
        this.store.toggleAchievements(false);
        this.store.toggleHallOfFame(false);
        this.store.toggleWardrobe(false);
        this.store.toggleWorldsPanel(false);
        return;
      }
      // never steal keystrokes from a form field or while a modal is up
      const active = document.activeElement as HTMLElement | null;
      if (active?.isContentEditable) return;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (!hire.hidden || !settings.hidden || !onboard.hidden || !ach.hidden || !hof.hidden || !wardrobe.hidden || !railway.hidden || !github.hidden || !codeEditor.hidden || !worlds.hidden || !forge.hidden || !fuse.hidden) return;
      switch (e.key.toLowerCase()) {
        case "h":
          e.preventDefault();
          this.openHireModal();
          break;
        case "f":
          e.preventDefault();
          this.toggleFeed();
          break;
        case "b":
          e.preventDefault();
          this.store.toggleBoard();
          break;
        case "g":
          e.preventDefault();
          this.store.toggleGantt();
          break;
        case "n":
          e.preventDefault();
          this.store.toggleVModel();
          break;
        case ",":
          e.preventDefault();
          this.openSettings();
          break;
        case "p":
          e.preventDefault();
          this.togglePerf();
          break;
        case "v":
          e.preventDefault();
          {
            const voice = this.store.sceneRef?.voice;
            if (voice?.active && voice.muted) voice.setMuted(false);
          }
          break;
      }
    });
    document.addEventListener("keyup", (e) => {
      if (e.key.toLowerCase() !== "v") return;
      const voice = this.store.sceneRef?.voice;
      if (voice?.active && !voice.muted) voice.setMuted(true);
    });
  }

  private bindMobileControls(): void {
    if (!isTouchDevice()) return;

    document.body.classList.add("is-touch");

    const backdrop = document.getElementById("mobile-backdrop")!;
    const roster = document.getElementById("roster")!;
    const feed = document.getElementById("feed")!;

    const closeMobilePanels = () => {
      roster.classList.remove("mobile-show");
      feed.classList.remove("mobile-show");
      backdrop.classList.remove("show");
      document.querySelectorAll(".mpt-btn").forEach((b) => b.classList.remove("active"));
    };

    backdrop.addEventListener("click", closeMobilePanels);

    const mptRoster = document.getElementById("mpt-roster")!;
    mptRoster.addEventListener("click", () => {
      const show = !roster.classList.contains("mobile-show");
      closeMobilePanels();
      if (show) {
        roster.classList.add("mobile-show");
        backdrop.classList.add("show");
        mptRoster.classList.add("active");
      }
    });

    const mptFeed = document.getElementById("mpt-feed")!;
    mptFeed.addEventListener("click", () => {
      const show = !feed.classList.contains("mobile-show");
      closeMobilePanels();
      if (show) {
        feed.classList.add("mobile-show");
        backdrop.classList.add("show");
        mptFeed.classList.add("active");
      }
    });

    const mptHire = document.getElementById("mpt-hire")!;
    mptHire.addEventListener("click", () => {
      closeMobilePanels();
      this.openHireModal();
    });

    const mptBoard = document.getElementById("mpt-board")!;
    mptBoard.addEventListener("click", () => {
      closeMobilePanels();
      this.store.toggleBoard();
    });

    const mptRecenter = document.getElementById("mpt-recenter")!;
    mptRecenter.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("recenter-camera"));
    });

    // ── Action buttons ──
    const interactBtn = document.getElementById("ma-interact")!;
    interactBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      touchInput.action = "interact";
    }, { passive: false });

    const teleportBtn = document.getElementById("ma-teleport")!;
    teleportBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      touchInput.action = "teleport";
    }, { passive: false });

    // ── Mobile voice button ──
    // Tap toggles voice on/off. When voice is active, press-and-hold unmutes (push-to-talk).
    const voiceBtn = document.getElementById("ma-voice")!;
    let voiceHoldActive = false;
    voiceBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const voice = this.store.sceneRef?.voice;
      if (!voice) return;
      if (!voice.active) {
        this.toggleVoice();
        return;
      }
      // Voice is active — press-and-hold to unmute
      if (voice.muted) {
        voice.setMuted(false);
        voiceHoldActive = true;
      }
    }, { passive: false });
    voiceBtn.addEventListener("touchend", (e) => {
      e.preventDefault();
      if (voiceHoldActive) {
        const voice = this.store.sceneRef?.voice;
        if (voice?.active && !voice.muted) voice.setMuted(true);
        voiceHoldActive = false;
      }
    }, { passive: false });
  }

  /** Tiny FPS readout for chasing frame pacing issues. Toggled with P. */
  private togglePerf(): void {
    this.perfVisible = !this.perfVisible;
    let el = document.getElementById("perf");
    if (!el) {
      el = document.createElement("div");
      el.id = "perf";
      el.className = "perf";
      document.getElementById("hud")!.appendChild(el);
    }
    el.hidden = !this.perfVisible;
    if (!this.perfVisible) return;
    const deltas: number[] = [];
    let last = performance.now();
    const tick = () => {
      if (!this.perfVisible) return;
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (deltas.length > 60) deltas.shift();
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      el!.textContent = `${Math.round(1000 / avg)} FPS · avg ${avg.toFixed(1)}ms · worst ${Math.round(
        Math.max(...deltas),
      )}ms`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------- onboarding

  private maybeOnboard(): void {
    const saved = localStorage.getItem(PLAYER_KEY);
    if (saved) {
      try {
        const player = JSON.parse(saved);
        if (player?.name && player?.workspace) {
          this.net.send({ type: "setup", player });
          return;
        }
      } catch {
        // fall through to the form
      }
    }
    const modal = document.getElementById("onboard-modal")!;
    modal.hidden = false;

    const builder = new CharBuilder("ob", DEFAULT_APPEARANCE, () => {});

    modal.innerHTML = `
      <div class="modal onboard">
        <h1>AGENT&nbsp;HEIGHTS</h1>
        <p class="sub">— FIRST DAY ON THE JOB —</p>
        <div class="onboard-layout">
          <div class="onboard-form">
            <label>YOUR NAME
              <input id="ob-name" maxlength="24" placeholder="e.g. Robert" autofocus />
            </label>
            <label>WORKSPACE NAME
              <input id="ob-workspace" maxlength="32" placeholder="e.g. My Office" />
            </label>
          </div>
          <div class="onboard-builder">
            <p class="builder-title">BUILD YOUR AVATAR</p>
            ${builder.html()}
          </div>
        </div>
        <button class="btn primary" id="ob-go">CLOCK IN ▶</button>
      </div>
    `;
    builder.mount();

    const go = () => {
      const nameEl = document.getElementById("ob-name") as HTMLInputElement;
      const wsEl = document.getElementById("ob-workspace") as HTMLInputElement;
      const name = nameEl.value.trim();
      const workspace = wsEl.value.trim();
      nameEl.classList.toggle("invalid", !name);
      wsEl.classList.toggle("invalid", !workspace);
      if (!name || !workspace) {
        (name ? wsEl : nameEl).focus();
        return;
      }
      const player = { name, workspace, appearance: builder.getAppearance() };
      localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
      this.net.send({ type: "setup", player });
      modal.hidden = true;
      if (!localStorage.getItem("agent-heights-onboard-seen")) {
        setTimeout(() => this.showOnboardingPrompt(), 600);
      } else if (!localStorage.getItem("agent-heights-intro-seen")) {
        setTimeout(() => this.showIntroGuide(), 800);
      }
    };
    document.getElementById("ob-go")!.addEventListener("click", go);
    modal.querySelectorAll("input").forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") go();
      }),
    );
  }

  // ----------------------------------------------------- onboarding prompt

  private showOnboardingPrompt(): void {
    localStorage.setItem("agent-heights-onboard-seen", "1");

    const modal = document.getElementById("onboard-modal")!;
    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal onboard" style="max-width: 520px;">
        <h1 style="font-size: 1.4rem;">WHAT DO YOU DO?</h1>
        <p class="sub" style="margin-bottom: 1rem;">Tell us about your work and the tools you use. We'll find the right agents for your stack.</p>
        <textarea id="ob-prompt-text" rows="4" placeholder="e.g. I'm a backend developer. We use GitHub, Sentry, Grafana, deploy on Vercel, and track issues in Linear." style="width: 100%; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #333; background: #111; color: #e0e0e0; font-size: 0.9rem; font-family: inherit; resize: vertical; box-sizing: border-box; outline: none;"></textarea>
        <div id="ob-prompt-status" style="min-height: 1.5rem; text-align: center; color: #888; font-size: 0.8rem; margin-top: 0.5rem;"></div>
        <div id="ob-prompt-results" style="margin-top: 0.5rem;"></div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <button class="btn" id="ob-prompt-skip" style="flex: 1;">SKIP</button>
          <button class="btn primary" id="ob-prompt-go" style="flex: 1;">FIND AGENTS ▶</button>
        </div>
      </div>
    `;

    const textarea = modal.querySelector("#ob-prompt-text") as HTMLTextAreaElement;
    const statusEl = modal.querySelector("#ob-prompt-status") as HTMLDivElement;
    const resultsEl = modal.querySelector("#ob-prompt-results") as HTMLDivElement;
    const skipBtn = modal.querySelector("#ob-prompt-skip") as HTMLButtonElement;
    const goBtn = modal.querySelector("#ob-prompt-go") as HTMLButtonElement;
    textarea.focus();

    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      modal.hidden = true;
      if (!localStorage.getItem("agent-heights-intro-seen")) {
        setTimeout(() => this.showIntroGuide(), 400);
      }
    };

    skipBtn.addEventListener("click", finish);

    const submit = () => {
      const text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }

      goBtn.disabled = true;
      goBtn.textContent = "FINDING…";
      statusEl.textContent = "Asking AI to match your stack…";
      resultsEl.innerHTML = "";

      this.net.send({ type: "recommend_agents", text });
    };

    goBtn.addEventListener("click", submit);
    textarea.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    // Listen for recommendation results
    const onRecs = (recommendations: { agentId: string; name: string; summary: string; reason: string; image_url: string | null }[]) => {
      if (resolved) return;

      goBtn.disabled = false;
      goBtn.textContent = "FIND AGENTS ▶";
      statusEl.textContent = "";

      if (recommendations.length === 0) {
        statusEl.textContent = "No matching agents found. You can browse the marketplace later.";
        resultsEl.innerHTML = "";
        // Add a finish button
        const doneBtn = document.createElement("button");
        doneBtn.className = "btn primary";
        doneBtn.style.cssText = "width: 100%; margin-top: 0.5rem;";
        doneBtn.textContent = "ENTER OFFICE ▶";
        doneBtn.addEventListener("click", finish);
        resultsEl.appendChild(doneBtn);
        return;
      }

      statusEl.textContent = `Found ${recommendations.length} agent${recommendations.length > 1 ? "s" : ""} for your stack:`;
      resultsEl.innerHTML = "";

      for (const rec of recommendations) {
        const card = document.createElement("div");
        card.style.cssText = `
          display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem;
          margin-bottom: 0.4rem; border: 1px solid #1a1a1a; border-radius: 0.5rem;
          background: #0d0d0d; transition: border-color 0.15s;
        `;
        card.addEventListener("mouseenter", () => { card.style.borderColor = "#333"; });
        card.addEventListener("mouseleave", () => { card.style.borderColor = "#1a1a1a"; });

        const avatar = rec.image_url
          ? `<img src="${rec.image_url}" style="width:36px;height:36px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'" />`
          : `<div style="width:36px;height:36px;border-radius:0.375rem;background:#1a2a1a;display:flex;align-items:center;justify-content:center;font-weight:700;color:#53b86b;flex-shrink:0;">${rec.name.charAt(0).toUpperCase()}</div>`;

        card.innerHTML = `
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.15rem;">${this.escape(rec.name)}</div>
            <div style="font-size:0.72rem; color:#888; margin-bottom:0.2rem;">${this.escape(rec.summary.slice(0, 80))}</div>
            <div style="font-size:0.7rem; color:#53b86b; line-height:1.3;">${this.escape(rec.reason)}</div>
          </div>
          ${avatar}
        `;

        const hireBtn = document.createElement("button");
        hireBtn.textContent = "HIRE";
        hireBtn.style.cssText = `
          flex-shrink: 0; padding: 0.35rem 0.75rem; border: none; border-radius: 0.375rem;
          background: #e0e0e0; color: #0d0d0d; font-size: 0.75rem; font-weight: 600; cursor: pointer;
          align-self: center;
        `;
        hireBtn.addEventListener("click", async () => {
          hireBtn.disabled = true;
          hireBtn.textContent = "Hiring…";
          try {
            const res = await fetch(`/api/marketplace/agent?id=${encodeURIComponent(rec.agentId)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const agent = await res.json() as MarketplaceAgent;
            this.hireFromMarketplace(agent);
            hireBtn.textContent = "Hired! 🚁";
            hireBtn.style.background = "#53b86b";
            hireBtn.style.color = "#fff";
          } catch {
            hireBtn.textContent = "Failed";
            hireBtn.style.background = "#e05d5d";
            hireBtn.style.color = "#fff";
            setTimeout(() => { hireBtn.disabled = false; hireBtn.textContent = "HIRE"; hireBtn.style.background = "#e0e0e0"; hireBtn.style.color = "#0d0d0d"; }, 2000);
          }
        });
        card.appendChild(hireBtn);
        resultsEl.appendChild(card);
      }

      // Add an "Enter Office" button after the results
      const enterBtn = document.createElement("button");
      enterBtn.className = "btn primary";
      enterBtn.style.cssText = "width: 100%; margin-top: 0.5rem;";
      enterBtn.textContent = "ENTER OFFICE ▶";
      enterBtn.addEventListener("click", finish);
      resultsEl.appendChild(enterBtn);
    };

    this.store.agentRecommendationListeners.add(onRecs);

    // Clean up listener when modal is dismissed
    const origFinish = finish;
    const cleanup = () => {
      this.store.agentRecommendationListeners.delete(onRecs);
      origFinish();
    };
    skipBtn.removeEventListener("click", finish);
    skipBtn.addEventListener("click", cleanup);
  }

  // --------------------------------------------------------------- intro guide

  private showIntroGuide(): void {
    const seen = localStorage.getItem("agent-heights-intro-seen");
    localStorage.setItem("agent-heights-intro-seen", "1");

    const svgIcon = (paths: string, color: string) =>
      `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

    const steps = [
      {
        icon: svgIcon('<path d="M3 21h18"/><path d="M5 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/>', "#58c866"),
        title: "Welcome to Agent Heights",
        body: "You're the boss of a virtual office full of <strong>real AI agents</strong>. Each employee at a desk is a live coding agent that reads, writes, and runs code in its own workspace. Your job: hire them, give them tasks, and watch them work.",
      },
      {
        icon: svgIcon('<path d="M3 21h18"/><path d="M5 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/>', "#58c866"),
        title: "Meet Hermes",
        body: "The agent at the front desk is <strong>Hermes</strong> — your office concierge. Hermes can relay messages to other agents, manage your calendar, and connect to external platforms like Slack, Discord, and Telegram. Click Hermes to start a conversation anytime.",
      },
      {
        icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', "#4f9dde"),
        title: "Platform Mailboxes",
        body: "The mailboxes along the wall connect Hermes to external messaging platforms. Walk up to a mailbox and click to set up integrations with <strong>Slack</strong>, <strong>Discord</strong>, <strong>Telegram</strong>, <strong>Gmail</strong>, and more. Each platform shows a security note about what data the integration accesses.",
      },
      {
        icon: svgIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', "#c9852c"),
        title: "Security & Access Control",
        body: "When you hire agents with API access (MCP servers), their detail panel shows a <strong>SECURITY & ACCESS</strong> section with risk levels and data access notes. Use <strong>ACCESS CONTROL</strong> to restrict who can chat with specific agents — useful when inviting collaborators to your room.",
      },
      {
        icon: svgIcon('<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>', "#8b7355"),
        title: "Hire Your First Agent",
        body: "Click <strong>+ HIRE AGENT</strong> (bottom-left) to create a custom agent from scratch — pick a name, role, and personality. Or browse the <strong>MARKET</strong> (top bar) for pre-built agents with specialized skills like trading, data analysis, or DevOps.",
      },
      {
        icon: svgIcon('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', "#53b86b"),
        title: "Assign Tasks & Watch Them Work",
        body: "Click any agent in the office to open their detail panel. Type a task, hit <strong>ASSIGN</strong>, and watch them walk to their desk and start working. Speech bubbles and the <strong>Office Feed</strong> (left panel) stream their real tool calls and output in real time.",
      },
      {
        icon: svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 1v6"/><path d="M12 17v6"/><path d="M4.22 4.22l4.24 4.24"/><path d="M15.54 15.54l4.24 4.24"/><path d="M1 12h6"/><path d="M17 12h6"/><path d="M4.22 19.78l4.24-4.24"/><path d="M15.54 8.46l4.24-4.24"/>', "#9b6dff"),
        title: "MCP Servers & Agent Tools",
        body: "MCP (Model Context Protocol) servers give your agents tools — file access, API integrations, databases, and more. Browse the <strong>Community MCPs</strong> tab in the marketplace to add capabilities. Each MCP server shows its risk level and data access scope so you know what you're granting.",
      },
      {
        icon: svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', "#e8a838"),
        title: "The Marketplace",
        body: "The <strong>MARKET</strong> button opens the agent marketplace. Browse the <strong>Agents</strong> tab for curated, ready-to-hire AI agents. The <strong>Community MCPs</strong> tab lets you search 22,000+ MCP servers — hire one and your agent gets those tools instantly. Click any agent card to see details, then hit <strong>Hire into HQ</strong>.",
      },
    ];

    let current = 0;
    const overlay = document.createElement("div");
    overlay.className = "intro-overlay";
    overlay.innerHTML = `<div class="intro-modal"></div>`;
    document.body.appendChild(overlay);

    const render = () => {
      const step = steps[current];
      const modal = overlay.querySelector(".intro-modal") as HTMLDivElement;
      modal.innerHTML = `
        <div class="intro-icon">${step.icon}</div>
        <h2 class="intro-title">${step.title}</h2>
        <p class="intro-body">${step.body}</p>
        <div class="intro-dots">
          ${steps.map((_, i) => `<span class="intro-dot${i === current ? " active" : ""}"></span>`).join("")}
        </div>
        <div class="intro-actions">
          ${current > 0 ? '<button class="btn" id="intro-back">◀ BACK</button>' : '<span></span>'}
          ${current < steps.length - 1
            ? '<button class="btn primary" id="intro-next">NEXT ▶</button>'
            : '<button class="btn primary" id="intro-done">LET\'S GO ▶</button>'}
        </div>
        <button class="intro-skip" id="intro-skip">Skip tour</button>
      `;

      const next = modal.querySelector("#intro-next");
      if (next) next.addEventListener("click", () => { current++; render(); });
      const back = modal.querySelector("#intro-back");
      if (back) back.addEventListener("click", () => { current--; render(); });
      const done = modal.querySelector("#intro-done");
      if (done) done.addEventListener("click", () => {
        overlay.remove();
        if (!seen) this.showFirstTimeTooltips();
      });
      const skip = modal.querySelector("#intro-skip");
      if (skip) skip.addEventListener("click", () => overlay.remove());
    };

    render();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  }

  private showFirstTimeTooltips(): void {
    const targets = [
      { id: "hire-btn", text: "Hire a custom AI agent", side: "top" },
      { id: "marketplace-btn", text: "Browse pre-built agents & MCP servers", side: "bottom" },
      { id: "feed", text: "Live activity from all your agents", side: "left" },
    ];

    const tips: HTMLDivElement[] = [];
    for (const t of targets) {
      const el = document.getElementById(t.id);
      if (!el) continue;
      const tip = document.createElement("div");
      tip.className = `intro-tooltip intro-tooltip-${t.side}`;
      tip.textContent = t.text;
      const rect = el.getBoundingClientRect();
      if (t.side === "top") {
        tip.style.left = `${rect.left + rect.width / 2}px`;
        tip.style.top = `${rect.bottom + 10}px`;
        tip.style.transform = "translateX(-50%)";
      } else if (t.side === "bottom") {
        tip.style.left = `${rect.left + rect.width / 2}px`;
        tip.style.bottom = `${window.innerHeight - rect.top + 10}px`;
        tip.style.transform = "translateX(-50%)";
      } else {
        tip.style.left = `${rect.right + 10}px`;
        tip.style.top = `${rect.top + rect.height / 2}px`;
        tip.style.transform = "translateY(-50%)";
      }
      document.body.appendChild(tip);
      tips.push(tip);
      el.classList.add("intro-pulse");
    }

    const dismiss = () => {
      tips.forEach((t) => t.remove());
      targets.forEach((t) => document.getElementById(t.id)?.classList.remove("intro-pulse"));
      document.removeEventListener("click", dismiss, true);
      document.removeEventListener("keydown", dismiss, true);
    };
    setTimeout(() => {
      document.addEventListener("click", dismiss, true);
      document.addEventListener("keydown", dismiss, true);
    }, 100);
  }

  // --------------------------------------------------------------- rooms

  /** Build a security summary for the invite panel showing agents with MCP tools and ACL restrictions. */
  private renderInviteSecuritySummary(): string {
    const agents = [...this.store.agents.values()];
    if (agents.length === 0) return "";

    const agentsWithMcp = agents.filter((a) => a.mcpServers && a.mcpServers.length > 0);
    const restrictedAgents = agents.filter((a) => {
      const acl = a.acl;
      return acl && (acl.allowedUserIds !== undefined || acl.allowedRoles !== undefined);
    });
    const unrestrictedCount = agents.length - restrictedAgents.length;

    if (agentsWithMcp.length === 0 && restrictedAgents.length === 0) return "";

    const mcpNames = agentsWithMcp.map((a) => a.name).slice(0, 5);
    const mcpSummary = mcpNames.length > 0
      ? `${mcpNames.join(", ")}${agentsWithMcp.length > 5 ? ` +${agentsWithMcp.length - 5} more` : ""}`
      : "";

    return `<div style="margin-top:0.6rem; padding:0.5rem; border:1px solid #333; border-radius:6px; background:#1a1a1a;">
      <div style="display:flex; align-items:center; gap:0.3rem; margin-bottom:0.3rem;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#c9852c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span style="font-size:0.65rem; font-weight:600; color:#c9852c;">ROOM SECURITY SUMMARY</span>
      </div>
      ${agentsWithMcp.length > 0 ? `<div style="font-size:0.62rem; color:#999; margin-bottom:0.2rem;">${agentsWithMcp.length} agent${agentsWithMcp.length !== 1 ? "s" : ""} with API access: ${esc(mcpSummary)}</div>` : ""}
      ${restrictedAgents.length > 0
        ? `<div style="font-size:0.62rem; color:#999;">${restrictedAgents.length} agent${restrictedAgents.length !== 1 ? "s" : ""} access-restricted (ACL). Visitor can chat with ${unrestrictedCount} agent${unrestrictedCount !== 1 ? "s" : ""}.</div>`
        : agentsWithMcp.length > 0
          ? `<div style="font-size:0.62rem; color:#888;">No agents are ACL-restricted. Consider restricting sensitive agents before inviting.</div>`
          : ""}
    </div>`;
  }

  private openRoomsPanel(): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;";
    overlay.id = "rooms-overlay";

    const players = Array.from(this.store.roomPlayers.values());
    const playerListHtml = players.length === 0
      ? '<p style="color:#888;font-size:0.85rem;">No players in room.</p>'
      : players.map(p => `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
          <span style="width:8px;height:8px;border-radius:50%;background:${p.role === 'owner' ? '#4f9dde' : p.role === 'guest' ? '#e8a838' : '#666'};"></span>
          <span style="font-size:0.85rem;">${p.name}</span>
          <span style="font-size:0.7rem;color:#888;">${p.role}</span>
        </div>
      `).join("");

    const isHq2 = this.store.roomId === "hq2";
    const isInOffice = this.store.privateOfficeId != null && this.store.roomId === this.store.privateOfficeId;

    // Separate org rooms from other rooms
    const orgRooms = this.store.roomsList.filter(r => r.roomType === "organization" && r.roomId !== "hq2");
    const otherRooms = this.store.roomsList.filter(r => r.roomId !== "hq2" && r.roomId !== this.store.privateOfficeId && r.roomType !== "organization");

    overlay.innerHTML = `
      <div style="background:#1a1d24;border-radius:12px;padding:1.5rem;width:480px;max-width:90vw;color:#e0e0e0;font-family:'M Plus Rounded 1c',sans-serif;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1.1rem;">🚪 Rooms</h2>
          <button class="x" id="rooms-close" style="background:none;border:none;color:#888;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.3rem;">CURRENT ROOM</div>
          <div style="font-size:0.9rem;font-weight:bold;margin-bottom:0.3rem;">${this.store.roomName || "—"}</div>
          ${!isHq2 ? `<div style="font-size:0.7rem;color:#666;margin-bottom:0.5rem;word-break:break-all;">Room ID: <span id="room-id-display" style="color:#4f9dde;cursor:pointer;text-decoration:underline;">${this.store.roomId ?? "—"}</span></div>` : ""}
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.3rem;">PLAYERS (${players.length})</div>
          <div>${playerListHtml}</div>
        </div>

        <div style="border-top:1px solid #333;padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">SWITCH ROOM</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn ${isHq2 ? 'primary' : ''}" id="room-hq2-btn" style="font-size:0.8rem;${isHq2 ? 'opacity:0.6;pointer-events:none;' : ''}">🌐 COMMAND CENTER</button>
            <button class="btn ${isInOffice ? 'primary' : ''}" id="room-office-btn" style="font-size:0.8rem;${isInOffice ? 'opacity:0.6;pointer-events:none;' : ''}">🏠 MY OFFICE</button>
          </div>
        </div>

        ${orgRooms.length > 0 ? `
        <div style="border-top:1px solid #333;padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">🏢 ORGANIZATION ROOMS</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${orgRooms.map(r => {
              const isCurrent = this.store.roomId === r.roomId;
              return `<button class="btn ${isCurrent ? 'primary' : ''}" data-room-id="${r.roomId}" style="font-size:0.8rem;${isCurrent ? 'opacity:0.6;pointer-events:none;' : ''}">🏢 ${r.name}</button>`;
            }).join("")}
          </div>
        </div>
        ` : ""}

        ${otherRooms.length > 0 ? `
        <div style="border-top:1px solid #333;padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">YOUR ROOMS</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${otherRooms.map(r => {
              const isCurrent = this.store.roomId === r.roomId;
              return `<button class="btn ${isCurrent ? 'primary' : ''}" data-room-id="${r.roomId}" style="font-size:0.8rem;${isCurrent ? 'opacity:0.6;pointer-events:none;' : ''}">${r.name}</button>`;
            }).join("")}
          </div>
        </div>
        ` : ""}

        <div style="border-top:1px solid #333;padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">CREATE NEW ROOM</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="room-name-input" placeholder="Room name…" style="flex:1;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;" />
            <button class="btn primary" id="room-create-btn" style="font-size:0.8rem;">CREATE</button>
          </div>
        </div>

        <div style="border-top:1px solid #333;padding-top:1rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div style="font-size:0.75rem;color:#888;">ORGANIZATIONS</div>
            <button class="btn" id="org-refresh-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;">↻</button>
          </div>
          <div id="orgs-container" style="display:flex;flex-direction:column;gap:0.4rem;">
            ${this.store.orgsList.length === 0 ? '<p style="color:#888;font-size:0.8rem;">No organizations yet.</p>' : this.store.orgsList.map(o => `
              <div style="background:#222;border-radius:6px;padding:0.5rem 0.7rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <span style="font-size:0.85rem;font-weight:bold;">${o.name}</span>
                    ${o.githubOrg ? `<span style="font-size:0.7rem;color:#666;margin-left:0.4rem;">github:${o.githubOrg}</span>` : ""}
                  </div>
                  <div style="display:flex;gap:0.3rem;align-items:center;">
                    <span style="font-size:0.7rem;color:#888;">${o.memberCount} member${o.memberCount !== 1 ? 's' : ''}</span>
                    ${o.isMember ? `<span style="font-size:0.65rem;color:#4f9dde;">${o.role}</span>` : ''}
                  </div>
                </div>
                <div style="display:flex;gap:0.3rem;margin-top:0.4rem;">
                  <button class="btn" data-org-join="${o.id}" data-org-name="${o.name}" style="font-size:0.7rem;padding:0.2rem 0.5rem;">${o.isMember ? 'Join Room' : 'Request Access'}</button>
                  ${o.role === 'admin' ? `<button class="btn" data-org-members="${o.id}" style="font-size:0.7rem;padding:0.2rem 0.5rem;">Members</button>` : ''}
                </div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top:0.5rem;">
            <button class="btn" id="org-create-btn" style="font-size:0.75rem;width:100%;">+ CREATE ORGANIZATION</button>
          </div>
        </div>

        <div style="border-top:1px solid #333;padding-top:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.5rem;">INVITE PLAYER TO CURRENT ROOM</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="room-invite-input" placeholder="User ID..." style="flex:1;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;" />
            <button class="btn" id="room-invite-btn" style="font-size:0.8rem;">INVITE</button>
          </div>
          <div style="margin-top:0.6rem;">
            <div style="font-size:0.7rem;color:#888;margin-bottom:0.3rem;">ACCESS LEVEL</div>
            <div style="display:flex;gap:0.4rem;">
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:#ccc;cursor:pointer;padding:0.3rem 0.5rem;border:1px solid #333;border-radius:6px;cursor:pointer;">
                <input type="radio" name="invite-access" value="tour" style="accent-color:#4f9dde;" />
                Tour
              </label>
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:#ccc;cursor:pointer;padding:0.3rem 0.5rem;border:1px solid #333;border-radius:6px;cursor:pointer;">
                <input type="radio" name="invite-access" value="talk" checked style="accent-color:#53b86b;" />
                Talk
              </label>
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:#ccc;cursor:pointer;padding:0.3rem 0.5rem;border:1px solid #333;border-radius:6px;cursor:pointer;">
                <input type="radio" name="invite-access" value="manage" style="accent-color:#e8a838;" />
                Manage
              </label>
            </div>
            <div id="invite-access-desc" style="font-size:0.65rem;color:#666;margin-top:0.3rem;">Can enter, see agents, and chat (subject to per-agent ACLs).</div>
          </div>
          ${this.renderInviteSecuritySummary()}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("rooms-close")!.addEventListener("click", close);

    // Click room ID to copy
    const roomIdEl = document.getElementById("room-id-display");
    if (roomIdEl && this.store.roomId) {
      roomIdEl.addEventListener("click", () => {
        navigator.clipboard.writeText(this.store.roomId!).then(() => {
          roomIdEl.textContent = "COPIED!";
          setTimeout(() => { roomIdEl.textContent = this.store.roomId ?? "—"; }, 1500);
        });
      });
    }

    // Switch to HQ2
    document.getElementById("room-hq2-btn")!.addEventListener("click", () => {
      this.net.send({ type: "switch_room", roomId: "hq2" });
      close();
    });

    // Switch to My Office
    document.getElementById("room-office-btn")!.addEventListener("click", () => {
      if (this.store.privateOfficeId) {
        this.net.send({ type: "switch_room", roomId: this.store.privateOfficeId });
      } else {
        this.toast("No private office found.");
      }
      close();
    });

    // Switch to a room from the rooms list
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-room-id]")) {
      btn.addEventListener("click", () => {
        const roomId = btn.dataset.roomId!;
        this.net.send({ type: "switch_room", roomId });
        close();
      });
    }

    // Create room
    document.getElementById("room-create-btn")!.addEventListener("click", () => {
      const input = document.getElementById("room-name-input") as HTMLInputElement;
      const name = input.value.trim();
      if (!name) return;
      this.net.send({ type: "create_room", name });
      close();
    });

    // Invite
    document.getElementById("room-invite-btn")!.addEventListener("click", () => {
      const input = document.getElementById("room-invite-input") as HTMLInputElement;
      const userId = input.value.trim();
      if (!userId || !this.store.roomId) return;
      const accessRadio = overlay.querySelector('input[name="invite-access"]:checked') as HTMLInputElement | null;
      const accessLevel = (accessRadio?.value as "tour" | "talk" | "manage") ?? "talk";
      this.net.send({ type: "invite_to_room", roomId: this.store.roomId, userId, role: "member", accessLevel });
      this.toast(`Invite sent to ${userId} (${accessLevel} access)`);
      close();
    });

    // Update access level description
    const accessDescs: Record<string, string> = {
      tour: "Can look around and see agents but cannot chat or manage. Good for showing off your office.",
      talk: "Can enter, see agents, and chat (subject to per-agent ACLs).",
      manage: "Full control — hire, fire, assign tasks, and configure agents. Only for trusted collaborators.",
    };
    const descEl = document.getElementById("invite-access-desc");
    if (descEl) {
      for (const radio of overlay.querySelectorAll<HTMLInputElement>('input[name="invite-access"]')) {
        radio.addEventListener("change", () => {
          descEl.textContent = accessDescs[radio.value] ?? "";
        });
      }
    }

    // Refresh orgs
    document.getElementById("org-refresh-btn")!.addEventListener("click", () => {
      this.net.send({ type: "list_orgs" });
    });

    // Create org
    document.getElementById("org-create-btn")!.addEventListener("click", () => {
      this.openCreateOrgModal(close);
    });

    // Org join / members
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-org-join]")) {
      btn.addEventListener("click", () => {
        const orgId = btn.dataset.orgJoin!;
        const orgName = btn.dataset.orgName!;
        this.net.send({ type: "join_org_room", orgId, roomName: orgName });
        close();
      });
    }
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-org-members]")) {
      btn.addEventListener("click", () => {
        const orgId = btn.dataset.orgMembers!;
        this.net.send({ type: "list_org_members", orgId });
        this.openOrgMembersModal(orgId);
      });
    }
  }

  private openCreateOrgModal(closeRooms: () => void): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;";
    overlay.id = "create-org-overlay";

    overlay.innerHTML = `
      <div style="background:#1a1d24;border-radius:12px;padding:1.5rem;width:400px;max-width:90vw;color:#e0e0e0;font-family:'M Plus Rounded 1c',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1rem;">🏢 Create Organization</h2>
          <button class="x" id="org-create-close" style="background:none;border:none;color:#888;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <div>
            <label style="font-size:0.75rem;color:#888;">Name</label>
            <input id="org-name-input" placeholder="My Organization" style="width:100%;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;margin-top:0.2rem;" />
          </div>
          <div>
            <label style="font-size:0.75rem;color:#888;">Slug (URL-safe)</label>
            <input id="org-slug-input" placeholder="my-org" style="width:100%;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;margin-top:0.2rem;" />
          </div>
          <div>
            <label style="font-size:0.75rem;color:#888;">GitHub Org (optional)</label>
            <input id="org-github-input" placeholder="my-github-org" style="width:100%;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;margin-top:0.2rem;" />
          </div>
          <button class="btn primary" id="org-create-submit" style="font-size:0.85rem;margin-top:0.3rem;">CREATE</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("org-create-close")!.addEventListener("click", close);

    document.getElementById("org-create-submit")!.addEventListener("click", () => {
      const name = (document.getElementById("org-name-input") as HTMLInputElement).value.trim();
      const slug = (document.getElementById("org-slug-input") as HTMLInputElement).value.trim();
      const githubOrg = (document.getElementById("org-github-input") as HTMLInputElement).value.trim() || undefined;
      if (!name || !slug) return;
      this.net.send({ type: "create_org", name, slug, githubOrg });
      this.net.send({ type: "list_orgs" });
      close();
      closeRooms();
    });
  }

  private openOrgMembersModal(orgId: string): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;";
    overlay.id = "org-members-overlay";

    const members = this.store.orgMembers?.orgId === orgId ? this.store.orgMembers.members : [];

    overlay.innerHTML = `
      <div style="background:#1a1d24;border-radius:12px;padding:1.5rem;width:420px;max-width:90vw;color:#e0e0e0;font-family:'M Plus Rounded 1c',sans-serif;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1rem;">👥 Organization Members</h2>
          <button class="x" id="org-members-close" style="background:none;border:none;color:#888;font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div id="org-members-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:1rem;">
          ${members.length === 0 ? '<p style="color:#888;font-size:0.8rem;">No members yet.</p>' : members.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:#222;border-radius:6px;padding:0.5rem 0.7rem;">
              <div>
                <span style="font-size:0.85rem;">${m.userEmail ?? m.userId}</span>
                <span style="font-size:0.65rem;color:${m.role === 'admin' ? '#4f9dde' : '#888'};margin-left:0.4rem;">${m.role}</span>
              </div>
              <button class="btn" data-remove-member="${m.userId}" style="font-size:0.7rem;padding:0.2rem 0.5rem;color:#c44a4a;">Remove</button>
            </div>
          `).join("")}
        </div>
        <div style="border-top:1px solid #333;padding-top:1rem;">
          <div style="font-size:0.75rem;color:#888;margin-bottom:0.3rem;">ADD MEMBER BY EMAIL</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="org-add-email" placeholder="user@example.com" style="flex:1;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;" />
            <select id="org-add-role" style="padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn primary" id="org-add-btn" style="font-size:0.8rem;">ADD</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("org-members-close")!.addEventListener("click", close);

    document.getElementById("org-add-btn")!.addEventListener("click", () => {
      const email = (document.getElementById("org-add-email") as HTMLInputElement).value.trim();
      const role = (document.getElementById("org-add-role") as HTMLSelectElement).value as "admin" | "member";
      if (!email) return;
      this.net.send({ type: "add_org_member", orgId, userEmail: email, role });
      // Refresh members after a short delay
      setTimeout(() => this.net.send({ type: "list_org_members", orgId }), 500);
    });

    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-remove-member]")) {
      btn.addEventListener("click", () => {
        const userId = btn.dataset.removeMember!;
        this.net.send({ type: "remove_org_member", orgId, userId });
        setTimeout(() => this.net.send({ type: "list_org_members", orgId }), 500);
      });
    }
  }

  private showInviteModal(invite: PendingInvite): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;";
    overlay.id = "invite-overlay";

    overlay.innerHTML = `
      <div style="background:#1a1d24;border-radius:12px;padding:1.5rem;width:380px;max-width:90vw;color:#e0e0e0;font-family:'M Plus Rounded 1c',sans-serif;text-align:center;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">📨</div>
        <h2 style="margin:0 0 0.5rem;font-size:1rem;">Room Invitation</h2>
        <p style="margin:0 0 1rem;font-size:0.9rem;color:#ccc;">
          <strong>${invite.fromName}</strong> invited you to join<br/>
          <strong>${invite.roomName}</strong>
        </p>
        <div style="display:flex;gap:0.5rem;justify-content:center;">
          <button class="btn" id="invite-decline" style="font-size:0.85rem;">DECLINE</button>
          <button class="btn primary" id="invite-accept" style="font-size:0.85rem;">ACCEPT</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("invite-accept")!.addEventListener("click", () => {
      this.net.send({ type: "respond_invite", roomId: invite.roomId, accept: true });
      overlay.remove();
    });
    document.getElementById("invite-decline")!.addEventListener("click", () => {
      this.net.send({ type: "respond_invite", roomId: invite.roomId, accept: false });
      overlay.remove();
    });
  }

  // --------------------------------------------------------------- settings

  private openSettings(): void {
    const modal = document.getElementById("settings-modal")!;
    const s = this.store.settings;
    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal settings">
        <h2>SETTINGS</h2>
        <div class="tabs">
          <button class="tab active" data-tab="agents">AGENTS</button>
          <button class="tab" data-tab="game">GAME</button>
          <button class="tab" data-tab="api">API KEY</button>
          <button class="tab" data-tab="spend">SPEND</button>
          <button class="tab" data-tab="billing">BILLING</button>
          <button class="tab" data-tab="controls">CONTROLS</button>
          <button class="tab" data-tab="data">DATA</button>
        </div>
        <div class="tabpanel" data-panel="agents">
          <div class="sec">AGENT ENGINE</div>
          <label>MAX ITERATIONS PER TASK
            <input id="s-turns" type="number" min="1" max="500" value="${s.cline.maxIterations}" />
          </label>
          <label class="chk">
            <input type="checkbox" id="s-auto-cmd" ${s.cline.autoApproveCommands ? "checked" : ""} />
            <span>AUTO-APPROVE SHELL COMMANDS (unattended execution)</span>
          </label>
          <label class="chk">
            <input type="checkbox" id="s-review-handoff" ${s.cline.reviewBeforeHandoff ? "checked" : ""} />
            <span>REQUIRE MANAGER REVIEW BEFORE TASK HANDOFFS (gates handoffs until approved)</span>
          </label>
          <div class="sec">RAILWAY</div>
          <label class="chk">
            <input type="checkbox" id="s-railway" ${s.railway?.enabled ? "checked" : ""} />
            <span>ENABLE RAILWAY MCP TOOLS (devops agents get deploy, logs, variables, domains)</span>
          </label>
        </div>
        <div class="tabpanel" data-panel="game" hidden>
          <label>OFFICE THEME
            <select id="s-theme">
              ${OFFICE_THEMES.map(
                (t) =>
                  `<option value="${t.id}" ${s.game.theme === t.id ? "selected" : ""}>${t.label}</option>`,
              ).join("")}
            </select>
          </label>
          <label class="chk">
            <input type="checkbox" id="s-wander" ${s.game.idleWander ? "checked" : ""} />
            <span>AGENTS WANDER WHEN IDLE</span>
          </label>
        </div>
        <div class="tabpanel" data-panel="api" hidden>
          <div class="sec">API KEY</div>
          <p style="font-size:0.8rem;color:#888;margin-bottom:0.5rem;">Bring your own key — your agents will use it instead of the server's shared key.</p>
          <div id="api-key-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.hasApiKey ? "#53b86b" : "#e05d5d"};">
            ${this.store.hasApiKey ? "✓ You have a personal API key set." : "⚠ No personal API key — using the server's shared key."}
          </div>
          <label>API KEY
            <input id="s-api-key" type="password" placeholder="sk-..." autocomplete="off"
              style="width:100%;padding:0.6rem 0.8rem;border-radius:0.5rem;border:1px solid #333;background:#1a1a1a;color:#e0e0e0;font-size:0.9rem;" />
          </label>
          <div class="row" style="margin-top:0.75rem;">
            <button class="btn primary" id="s-save-key">SAVE KEY</button>
            <button class="btn danger" id="s-clear-key" ${this.store.hasApiKey ? "" : "disabled"}>CLEAR KEY</button>
          </div>
        </div>
        <div class="tabpanel" data-panel="spend" hidden>
          <div class="sec">API SPEND (30 DAYS)</div>
          <div id="spend-loading" style="font-size:0.85rem;color:#888;">Loading…</div>
          <div id="spend-content" hidden></div>
          <div id="spend-cap-info" style="margin-top:1rem;font-size:0.78rem;color:#888;border-top:1px solid #333;padding-top:0.75rem;">
            Monthly cap: ${this.store.usageCap > 0 ? `$${(this.store.usageCap / 100).toFixed(2)}` : "—"} — upgrade your plan to increase.
          </div>
        </div>
        <div class="tabpanel" data-panel="billing" hidden>
          <div class="sec">SUBSCRIPTION</div>
          <div id="sub-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.subscriptionActive ? "#53b86b" : "#e05d5d"};">
            ${this.store.subscriptionActive
              ? `✓ ${this.store.subscriptionTier ? SUBSCRIPTION_TIER_LIST.find(t => t.id === this.store.subscriptionTier)?.name : "Active"} — ${this.store.agentLimit} agent${this.store.agentLimit === 1 ? "" : "s"} available.`
              : `Free plan — ${this.store.agentLimit} agent${this.store.agentLimit === 1 ? "" : "s"}, no task execution. Upgrade to run tasks.`}
          </div>
          ${this.store.subscriptionActive
            ? `<button class="btn" id="s-manage-sub">MANAGE SUBSCRIPTION</button>`
            : `<div style="display:flex;flex-direction:column;gap:0.4rem;">${SUBSCRIPTION_TIER_LIST.map(t => {
              const agentLabel = `${t.agentLimit} agent${t.agentLimit === 1 ? "" : "s"}`;
              return `<button class="btn primary s-subscribe-tier" data-tier="${t.id}" style="text-align:left;padding:0.6rem 0.8rem;font-size:0.85rem;">${t.name} — ${t.label} (${agentLabel})</button>`;
            }).join("")}</div>`}
        </div>
        <div class="tabpanel" data-panel="controls" hidden>
          <div class="sec">QUICK COMMANDS</div>
          <div class="row">
            <button class="btn" id="s-hire">+ HIRE AGENT…</button>
            <button class="btn" id="s-feed">${this.feedCollapsed ? "OPEN" : "CLOSE"} OFFICE FEED</button>
          </div>
          <div class="row">
            <button class="btn" id="s-board">📋 TASK BOARD</button>
            <button class="btn" id="s-gantt">📊 GANTT CHART</button>
            <button class="btn" id="s-vmodel">🔬 V-MODEL</button>
          </div>
          <div class="row">
            <button class="btn" id="s-quick-cline">⚡ INSTANT AGENT</button>
          </div>
          <div class="sec">KEYBOARD</div>
          <div class="controls">
            <div><kbd>W A S D</kbd> / <kbd>←↑↓→</kbd><span>move around the office</span></div>
            <div><kbd>E</kbd><span>talk to a nearby agent</span></div>
            <div><kbd>CLICK</kbd><span>select an agent (opens detail panel)</span></div>
            <div><kbd>H</kbd><span>hire an agent</span></div>
            <div><kbd>F</kbd><span>open / close the office feed</span></div>
            <div><kbd>B</kbd><span>open / close the task board</span></div>
            <div><kbd>G</kbd><span>open / close the Gantt chart</span></div>
            <div><kbd>N</kbd><span>open / close the V-model diagram</span></div>
            <div><kbd>,</kbd><span>open settings</span></div>
            <div><kbd>P</kbd><span>show FPS overlay</span></div>
            <div><kbd>ESC</kbd><span>close panels &amp; modals</span></div>
            <div><kbd>⌘/CTRL</kbd>+<kbd>ENTER</kbd><span>start a new task (fresh conversation)</span></div>
          </div>
        </div>
        <div class="tabpanel" data-panel="data" hidden>
          <div class="row">
            <button class="btn" id="s-export">⬇ EXPORT CHATS & LOGS</button>
          </div>
          <div class="row">
            <button class="btn danger" id="s-clear-all">🧹 CLEAR ALL CHATS & MEMORY</button>
          </div>
          <div class="row">
            <button class="btn danger" id="s-reset">RESET PROFILE</button>
          </div>
          <div id="s-deletion-warning" hidden style="margin-top:1rem;padding:0.75rem;border:1px solid #c44a4a;border-radius:0.5rem;background:rgba(196,74,74,0.1);">
            <div style="font-size:0.85rem;color:#e05d5d;margin-bottom:0.5rem;">⚠ Your account is scheduled for deletion on <span id="s-deletion-date"></span>.</div>
            <div style="font-size:0.78rem;color:#888;margin-bottom:0.75rem;">All agents are stopped. Your data will be permanently erased after this date. Sign in anytime before then to cancel.</div>
            <button class="btn" id="s-cancel-deletion">CANCEL DELETION</button>
          </div>
          <div id="s-delete-account-section" style="margin-top:1rem;border-top:1px solid #333;padding-top:1rem;">
            <div class="sec" style="color:#c44a4a;">DANGER ZONE</div>
            <p style="font-size:0.78rem;color:#888;margin-bottom:0.5rem;">Permanently delete your account and all associated data. A 30-day grace period applies — you can cancel by signing back in.</p>
            <button class="btn danger" id="s-delete-account">🗑 DELETE ACCOUNT</button>
          </div>
        </div>
        <div class="row footer">
          <button class="btn" id="s-cancel">CANCEL</button>
          <button class="btn primary" id="s-save">SAVE ▶</button>
        </div>
      </div>
    `;

    modal.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) =>
      tab.addEventListener("click", () => {
        modal.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        modal.querySelectorAll<HTMLElement>(".tabpanel").forEach((p) => {
          p.hidden = p.dataset.panel !== tab.dataset.tab;
        });
        if (tab.dataset.tab === "spend") void this.loadSpendData();
      }),
    );

    document.getElementById("s-hire")!.addEventListener("click", () => {
      modal.hidden = true;
      this.openHireModal();
    });
    document.getElementById("s-feed")!.addEventListener("click", () => {
      this.toggleFeed();
      modal.hidden = true;
    });
    document.getElementById("s-board")!.addEventListener("click", () => {
      this.store.toggleBoard();
      modal.hidden = true;
    });
    const sGantt = document.getElementById("s-gantt");
    if (sGantt) sGantt.addEventListener("click", () => {
      this.store.toggleGantt();
      modal.hidden = true;
    });
    const sVModel = document.getElementById("s-vmodel");
    if (sVModel) sVModel.addEventListener("click", () => {
      this.store.toggleVModel();
      modal.hidden = true;
    });
    document.getElementById("s-quick-cline")!.addEventListener("click", () => {
      this.quickHire("cline");
      modal.hidden = true;
    });
    document.getElementById("s-save-key")!.addEventListener("click", () => {
      const key = (document.getElementById("s-api-key") as HTMLInputElement).value.trim();
      if (!key) { this.toast("Enter an API key first."); return; }
      this.net.send({ type: "set_api_key", apiKey: key });
      (document.getElementById("s-api-key") as HTMLInputElement).value = "";
      modal.hidden = true;
    });
    document.getElementById("s-clear-key")!.addEventListener("click", () => {
      inlineConfirm(
        "Remove API key?",
        "Your agents will fall back to the server's shared key.",
        "Remove",
        () => { this.net.send({ type: "set_api_key", apiKey: "" }); modal.hidden = true; },
      );
    });
    const subscribeBtn = document.getElementById("s-subscribe");
    if (subscribeBtn) {
      subscribeBtn.addEventListener("click", () => void startSubscriptionCheckout("pro"));
    }
    document.querySelectorAll<HTMLButtonElement>(".s-subscribe-tier").forEach(btn => {
      btn.addEventListener("click", () => {
        const tier = btn.dataset.tier as SubscriptionTier;
        if (tier) void startSubscriptionCheckout(tier);
      });
    });
    const manageSubBtn = document.getElementById("s-manage-sub");
    if (manageSubBtn) {
      manageSubBtn.addEventListener("click", () => void openCustomerPortal());
    }
    document.getElementById("s-cancel")!.addEventListener("click", () => (modal.hidden = true));
    document.getElementById("s-save")!.addEventListener("click", () => {
      this.net.send({
        type: "set_settings",
        settings: {
          cline: {
            maxIterations: Number((document.getElementById("s-turns") as HTMLInputElement).value) || 60,
            autoApproveCommands: (document.getElementById("s-auto-cmd") as HTMLInputElement).checked,
            reviewBeforeHandoff: (document.getElementById("s-review-handoff") as HTMLInputElement).checked,
          },
          game: {
            idleWander: (document.getElementById("s-wander") as HTMLInputElement).checked,
            theme: (document.getElementById("s-theme") as HTMLSelectElement).value as OfficeTheme,
          },
          railway: {
            enabled: (document.getElementById("s-railway") as HTMLInputElement)?.checked ?? false,
          },
          mailboxPlatforms: this.store.settings.mailboxPlatforms,
        },
      });
      modal.hidden = true;
      this.toast("Settings saved.");
    });
    document.getElementById("s-export")!.addEventListener("click", () => this.exportAll());
    document.getElementById("s-clear-all")!.addEventListener("click", () => {
      inlineConfirm(
        "Clear all agents' chats?",
        "They'll all forget previous orders (busy agents are skipped). Workspace files stay.",
        "Clear all",
        () => { this.net.send({ type: "clear_all" }); modal.hidden = true; },
      );
    });
    document.getElementById("s-reset")!.addEventListener("click", () => {
      inlineConfirm(
        "Reset boss profile?",
        "You'll go through onboarding again. Agents and logs are kept.",
        "Reset",
        () => { localStorage.removeItem(PLAYER_KEY); location.reload(); },
      );
    });

    // Show deletion warning if account is scheduled for deletion
    const deletionWarning = document.getElementById("s-deletion-warning")!;
    const deleteAccountSection = document.getElementById("s-delete-account-section")!;
    if (this.store.scheduledDeletionAt) {
      deletionWarning.hidden = false;
      deleteAccountSection.hidden = true;
      const dateStr = new Date(this.store.scheduledDeletionAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      (document.getElementById("s-deletion-date") as HTMLSpanElement).textContent = dateStr;
    } else {
      deletionWarning.hidden = true;
      deleteAccountSection.hidden = false;
    }

    document.getElementById("s-delete-account")!.addEventListener("click", () => {
      inlineConfirm(
        "Delete your account?",
        "Your account will be scheduled for permanent deletion in 30 days. All agents will be stopped. You can cancel by signing back in anytime before the deletion date.",
        "Delete account",
        () => {
          this.net.send({ type: "delete_account" });
          modal.hidden = true;
        },
      );
    });
    document.getElementById("s-cancel-deletion")!.addEventListener("click", () => {
      inlineConfirm(
        "Cancel account deletion?",
        "Your account will be restored and your agents can resume working.",
        "Cancel deletion",
        () => {
          this.net.send({ type: "cancel_deletion" });
          modal.hidden = true;
        },
      );
    });
  }

  /** One-click hire: random name, default model, worker role. */
  private quickHire(provider: Provider): void {
    const name = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
    const model = AGENT_MODELS[0];
    this.net.send({
      type: "hire",
      name,
      provider,
      model: model.id,
      systemPrompt: "",
      role: "worker",
    });
    this.toast(`${name} is on the way!`);
  }

  /** Download everything the office knows as one JSON file. */
  private exportAll(): void {
    const data = {
      exportedAt: new Date().toISOString(),
      player: this.store.player,
      settings: this.store.settings,
      agents: [...this.store.agents.values()],
      logs: Object.fromEntries(this.store.logs),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = URL.createObjectURL(blob);
    a.download = `agent-heights-export-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast("Export downloaded.");
  }

  // ------------------------------------------------------------- hire modal

  private openHireModal(): void {
    if (this.store.accessLevel !== "manage") {
      this.toast(this.store.accessLevel === "tour" ? "Tour mode — ask an admin for manage access to hire agents." : "Go to your office to manage agents.");
      return;
    }
    const modal = document.getElementById("hire-modal")!;
    const suggested = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];

    const builder = new CharBuilder("h", randomAppearance(), () => {});
    const personality = randomPersonality();

    modal.hidden = false;
    const subNotice = this.store.subscriptionActive ? "" : `
      <div style="margin-bottom:0.8rem;padding:0.6rem 0.8rem;border-radius:8px;background:rgba(229,93,93,0.15);border:1px solid rgba(229,93,93,0.3);color:#e05d5d;font-size:0.82rem;line-height:1.3;">
        <strong>Subscription required.</strong> You need a subscription to hire agents. Plans start at $0.99/month.
        <button id="h-subscribe" style="margin-top:0.4rem;display:block;padding:0.4rem 0.8rem;border-radius:6px;border:none;background:#58c866;color:#0d0d0d;font-size:0.8rem;font-weight:700;cursor:pointer;">Subscribe now →</button>
      </div>`;

    const traitSliders = ([
      { key: "openness", label: "Openness", desc: "Creative vs conventional" },
      { key: "conscientiousness", label: "Conscientiousness", desc: "Organized vs spontaneous" },
      { key: "extraversion", label: "Extraversion", desc: "Outgoing vs reserved" },
      { key: "agreeableness", label: "Agreeableness", desc: "Warm vs blunt" },
      { key: "neuroticism", label: "Neuroticism", desc: "Sensitive vs calm" },
    ] as const).map(({ key, label, desc }) => `
      <div class="trait-row" style="margin-bottom:0.5rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#ccc;margin-bottom:0.2rem;">
          <span>${label} <span style="color:#666;font-size:0.7rem;">${desc}</span></span>
          <span id="h-${key}-val" style="color:#4f9dde;font-weight:600;">${Math.round(personality[key] * 100)}</span>
        </div>
        <input type="range" id="h-${key}" min="0" max="100" value="${Math.round(personality[key] * 100)}"
          style="width:100%;accent-color:#4f9dde;" />
      </div>
    `).join("");

    modal.innerHTML = `
      <div class="modal hire-modal">
        <h2>HIRE AGENT</h2>
        ${subNotice}
        <div class="hire-layout">
          <div class="hire-appearance">
            ${builder.html()}
            <div class="hire-outfit-actions">
              ${this.store.wardrobeEditable ? `<button class="btn" id="h-save-outfit" style="font-size:0.7rem;padding:0.3rem 0.5rem;">💾 SAVE OUTFIT</button>` : ""}
              <select class="outfit-select" id="h-load-outfit">
                <option value="">Load outfit…</option>
                ${this.store.outfits.map((o) => `<option value="${o.id}">${o.name}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="hire-form">
            <label>NAME <input id="h-name" maxlength="24" value="${suggested}" /></label>
            <label>ROLE
              <select id="h-role">
                <option value="worker">Worker — does the tasks</option>
                <option value="manager">Manager — splits big goals across the team</option>
                <option value="devops">DevOps — manages Railway deployments & infrastructure</option>
              </select>
            </label>
            <label>SKILLS <span class="opt">(what tasks this agent can pick up)</span>
              <div id="h-skills" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
                ${["frontend", "backend", "devops", "data", "writing", "research", "crypto"].map((s) =>
                  `<label class="chk" style="font-size:0.75rem;"><input type="checkbox" class="h-skill" value="${s}" /> ${s.toUpperCase()}</label>`
                ).join("")}
              </div>
            </label>
            <label>SYSTEM PROMPT <span class="opt">(optional)</span>
              <textarea id="h-prompt" rows="3"
                placeholder="Standing instructions for this agent, e.g. 'You are a senior TypeScript reviewer. Always write tests first.'"></textarea>
            </label>
            <div class="sec" style="margin-top:0.3rem;font-size:0.8rem;color:#888;">PERSONALITY</div>
            <div id="h-traits" style="padding:0.4rem 0;">
              ${traitSliders}
              <button class="btn" id="h-rand-personality" style="font-size:0.75rem;padding:0.3rem 0.6rem;margin-top:0.3rem;">🎲 RANDOMIZE</button>
            </div>
            <div class="sec" style="margin-top:0.3rem;font-size:0.8rem;color:#888;">ACCESS</div>
            <div style="padding:0.3rem 0;">
              <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:#ccc;cursor:pointer;margin-bottom:0.25rem;">
                <input type="radio" name="h-access" value="owner" checked style="accent-color:#4f9dde;" />
                Only you can chat
              </label>
              <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:#ccc;cursor:pointer;">
                <input type="radio" name="h-access" value="open" style="accent-color:#4f9dde;" />
                Everyone with talk access can chat
              </label>
            </div>
          </div>
        </div>
        <div class="row">
          <button class="btn" id="h-cancel">CANCEL</button>
          <button class="btn primary" id="h-ok">HIRE ▶</button>
        </div>
      </div>
    `;
    builder.mount();

document.getElementById("h-cancel")!.addEventListener("click", () => (modal.hidden = true));
    const subscribeBtn2 = document.getElementById("h-subscribe");
    if (subscribeBtn2) {
      subscribeBtn2.addEventListener("click", () => void startSubscriptionCheckout("starter"));
    }

    // Wire up trait slider value displays
    const traitKeys = ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const;
    for (const key of traitKeys) {
      const slider = document.getElementById(`h-${key}`) as HTMLInputElement;
      const valSpan = document.getElementById(`h-${key}-val`)!;
      slider.addEventListener("input", () => {
        valSpan.textContent = slider.value;
      });
    }

    // Randomize personality button
    // Save current appearance as a named outfit
    const hSaveOutfit = document.getElementById("h-save-outfit");
    if (hSaveOutfit) {
      const actionsDiv = hSaveOutfit.parentElement!;
      const restoreButton = () => {
        actionsDiv.innerHTML = `<button class="btn" id="h-save-outfit" style="font-size:0.7rem;padding:0.3rem 0.5rem;">💾 SAVE OUTFIT</button><select class="outfit-select" id="h-load-outfit"><option value="">Load outfit…</option>${this.store.outfits.map((o) => `<option value="${o.id}">${o.name}</option>`).join("")}</select>`;
        document.getElementById("h-save-outfit")!.addEventListener("click", outfitSaveClick);
        document.getElementById("h-load-outfit")!.addEventListener("change", (e) => {
          const id = (e.target as HTMLSelectElement).value;
          if (!id) return;
          const outfit = this.store.outfits.find((o) => o.id === id);
          if (outfit) builder.setAppearance(outfit.appearance);
          (e.target as HTMLSelectElement).value = "";
        });
      };
      const outfitSaveClick = () => {
        actionsDiv.innerHTML = `<input type="text" id="h-outfit-name" placeholder="Outfit name…" maxlength="24" style="font-size:0.7rem;padding:0.3rem 0.5rem;width:100px;" /><button class="btn" id="h-outfit-confirm" style="font-size:0.7rem;padding:0.3rem 0.5rem;">✓</button><button class="btn" id="h-outfit-cancel" style="font-size:0.7rem;padding:0.3rem 0.5rem;">✕</button>`;
        const input = document.getElementById("h-outfit-name") as HTMLInputElement;
        input.focus();
        const submit = () => {
          const name = input.value.trim();
          if (!name) return;
          this.net.send({ type: "save_outfit", name, appearance: builder.getAppearance() });
          this.toast("Outfit saved!");
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") restoreButton();
        });
        document.getElementById("h-outfit-confirm")!.addEventListener("click", submit);
        document.getElementById("h-outfit-cancel")!.addEventListener("click", restoreButton);
      };
      hSaveOutfit.addEventListener("click", outfitSaveClick);
    }

    // Load a saved outfit into the builder
    document.getElementById("h-load-outfit")!.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (!id) return;
      const outfit = this.store.outfits.find((o) => o.id === id);
      if (outfit) builder.setAppearance(outfit.appearance);
      (e.target as HTMLSelectElement).value = "";
    });

    document.getElementById("h-rand-personality")!.addEventListener("click", () => {
      const newP = randomPersonality();
      for (const key of traitKeys) {
        const slider = document.getElementById(`h-${key}`) as HTMLInputElement;
        const valSpan = document.getElementById(`h-${key}-val`)!;
        const val = Math.round(newP[key] * 100);
        slider.value = String(val);
        valSpan.textContent = String(val);
      }
    });

    document.getElementById("h-ok")!.addEventListener("click", () => {
      const name = (document.getElementById("h-name") as HTMLInputElement).value.trim();
      if (!name) return;
      const traits: PersonalityTraits = {
        openness: parseInt((document.getElementById("h-openness") as HTMLInputElement).value) / 100,
        conscientiousness: parseInt((document.getElementById("h-conscientiousness") as HTMLInputElement).value) / 100,
        extraversion: parseInt((document.getElementById("h-extraversion") as HTMLInputElement).value) / 100,
        agreeableness: parseInt((document.getElementById("h-agreeableness") as HTMLInputElement).value) / 100,
        neuroticism: parseInt((document.getElementById("h-neuroticism") as HTMLInputElement).value) / 100,
      };
      // Built-in MCP servers that every custom-hired agent gets for free.
      // These are local stdio tools — no auth required.
      const builtinMcp: MCPServerConfig[] = [
        { name: "playwright", command: "npx", args: ["-y", "@anthropic-ai/mcp-server-playwright"] },
        { name: "sequential-thinking", command: "npx", args: ["-y", "@anthropic-ai/mcp-server-sequential-thinking"] },
        { name: "memory", command: "npx", args: ["-y", "@anthropic-ai/mcp-server-memory"] },
      ];
      const skills = [...document.querySelectorAll<HTMLInputElement>(".h-skill:checked")].map((el) => el.value as any);
      const accessChoice = (document.querySelector('input[name="h-access"]:checked') as HTMLInputElement | null)?.value ?? "owner";
      const acl = accessChoice === "open" ? {} : { allowedUserIds: [] as string[] };
      this.net.send({
        type: "hire",
        name,
        provider: "cline",
        model: AGENT_MODELS[0].id,
        systemPrompt: (document.getElementById("h-prompt") as HTMLTextAreaElement).value,
        role: (document.getElementById("h-role") as HTMLSelectElement).value as AgentRole,
        appearance: builder.getAppearance(),
        personality: traits,
        mcpServers: builtinMcp,
        skills: skills.length ? skills : undefined,
        acl,
      });
      modal.hidden = true;
    });
  }

  // ------------------------------------------------------------- fuse modal

  private openFuseModal(agentAId: string): void {
    if (this.store.accessLevel !== "manage") {
      this.toast(this.store.accessLevel === "tour" ? "Tour mode — ask an admin for manage access." : "Go to your office to manage agents.");
      return;
    }
    const hireable = [...this.store.agents.values()].filter(
      (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
    );
    if (hireable.length < 2) {
      this.toast("You need at least 2 hireable agents to fuse.");
      return;
    }
    const agentA = this.store.agents.get(agentAId);
    if (!agentA || agentA.id === OFFICE_MANAGER_ID || agentA.id === HERMES_ID || agentA.id === WIZARD_ID) return;

    const modal = document.getElementById("fuse-modal")!;
    modal.hidden = false;

    const others = hireable.filter((a) => a.id !== agentAId);

    // Pre-build merged prompt
    const buildMergedPrompt = (a: AgentInfo, b: AgentInfo) => {
      const parts: string[] = [`You are a fused agent combining the expertise of two specialists.`];
      parts.push(`\n[Specialist A — ${a.name}]:\n${a.systemPrompt || "(no custom prompt)"}`);
      parts.push(`\n[Specialist B — ${b.name}]:\n${b.systemPrompt || "(no custom prompt)"}`);
      parts.push(`\nYou possess the full capabilities of both. Approach tasks with the combined perspective.`);
      return parts.join("\n");
    };

    const firstOther = others[0];
    const mergedPrompt = buildMergedPrompt(agentA, firstOther);

    // Merge MCP server names for display
    const mergeMcpDisplay = (a: AgentInfo, b: AgentInfo) => {
      const all = [...(a.mcpServers ?? []), ...(b.mcpServers ?? [])];
      const seen = new Set<string>();
      const unique = all.filter((s) => {
        const key = s.url ?? s.command ?? JSON.stringify(s);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (unique.length === 0) return "<span style='color:#666;'>None</span>";
      return unique.map((s) => `<span style='display:inline-block;background:#1a1a2e;border:1px solid #333;border-radius:4px;padding:0.15rem 0.5rem;margin:0.15rem;font-size:0.75rem;'>${esc(s.name ?? s.url ?? s.command ?? "MCP")}</span>`).join("");
    };

    // Average personality
    const avgPersonality = (a: AgentInfo, b: AgentInfo) => ({
      openness: ((a.personality?.openness ?? 0.5) + (b.personality?.openness ?? 0.5)) / 2,
      conscientiousness: ((a.personality?.conscientiousness ?? 0.5) + (b.personality?.conscientiousness ?? 0.5)) / 2,
      extraversion: ((a.personality?.extraversion ?? 0.5) + (b.personality?.extraversion ?? 0.5)) / 2,
      agreeableness: ((a.personality?.agreeableness ?? 0.5) + (b.personality?.agreeableness ?? 0.5)) / 2,
      neuroticism: ((a.personality?.neuroticism ?? 0.5) + (b.personality?.neuroticism ?? 0.5)) / 2,
    });

    const personality = avgPersonality(agentA, firstOther);

    const traitSliders = ([
      { key: "openness", label: "Openness" },
      { key: "conscientiousness", label: "Conscientiousness" },
      { key: "extraversion", label: "Extraversion" },
      { key: "agreeableness", label: "Agreeableness" },
      { key: "neuroticism", label: "Neuroticism" },
    ] as const).map(({ key, label }) => `
      <div class="trait-row" style="margin-bottom:0.5rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#ccc;margin-bottom:0.2rem;">
          <span>${label}</span>
          <span id="f-${key}-val" style="color:#4f9dde;font-weight:600;">${Math.round(personality[key] * 100)}</span>
        </div>
        <input type="range" id="f-${key}" min="0" max="100" value="${Math.round(personality[key] * 100)}"
          style="width:100%;accent-color:#4f9dde;" />
      </div>
    `).join("");

    const suggestedName = (agentA.name.slice(0, 8) + firstOther.name.slice(0, 8)).slice(0, 24);

    modal.innerHTML = `
      <div class="modal hire-modal" style="max-width:680px;">
        <h2>⚗️ FUSE AGENTS</h2>
        <p style="color:#888;font-size:0.82rem;margin-bottom:0.8rem;">
          Merge two agents into one. Their MCP servers, wallets, and personalities are combined.
          Both originals are fired. The fused agent starts with a clean slate.
        </p>
        <div class="hire-layout">
          <div class="hire-form" style="flex:1;">
            <label>AGENT A
              <select id="f-agent-a" style="margin-bottom:0.4rem;">
                ${hireable.map((a) => `<option value="${a.id}" ${a.id === agentAId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}
              </select>
            </label>
            <label>AGENT B
              <select id="f-agent-b">
                ${others.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("")}
              </select>
            </label>
            <label>FUSED NAME <input id="f-name" maxlength="24" value="${esc(suggestedName)}" /></label>
            <label>MERGED SYSTEM PROMPT <span class="opt">(editable)</span>
              <textarea id="f-prompt" rows="6" style="font-size:0.78rem;">${esc(mergedPrompt)}</textarea>
            </label>
          </div>
          <div class="hire-form" style="flex:1;">
            <div class="sec" style="font-size:0.8rem;color:#888;margin-top:0.3rem;">MERGED MCP SERVERS</div>
            <div id="f-mcp-display" style="padding:0.4rem 0;margin-bottom:0.4rem;">${mergeMcpDisplay(agentA, firstOther)}</div>
            <div class="sec" style="font-size:0.8rem;color:#888;">PERSONALITY (averaged)</div>
            <div id="f-traits" style="padding:0.4rem 0;">
              ${traitSliders}
            </div>
            <div class="sec" style="font-size:0.8rem;color:#888;margin-top:0.3rem;">WALLETS</div>
            <div id="f-wallets" style="padding:0.3rem 0;font-size:0.78rem;color:#ccc;">
              ${((agentA.cdpSolana || firstOther.cdpSolana) ? "🔵 Solana (CDP) " : "")}${((agentA.crossmintWallet || firstOther.crossmintWallet) ? "🟢 Crossmint " : "")}${(!agentA.cdpSolana && !firstOther.cdpSolana && !agentA.crossmintWallet && !firstOther.crossmintWallet) ? "<span style='color:#666;'>None</span>" : ""}
            </div>
          </div>
        </div>
        <div class="row">
          <button class="btn" id="f-cancel">CANCEL</button>
          <button class="btn primary" id="f-ok">⚗️ FUSE ▶</button>
        </div>
      </div>
    `;

    const updatePreview = () => {
      const aId = (document.getElementById("f-agent-a") as HTMLSelectElement).value;
      const bId = (document.getElementById("f-agent-b") as HTMLSelectElement).value;
      const a = this.store.agents.get(aId);
      const b = this.store.agents.get(bId);
      if (!a || !b) return;
      (document.getElementById("f-prompt") as HTMLTextAreaElement).value = buildMergedPrompt(a, b);
      document.getElementById("f-mcp-display")!.innerHTML = mergeMcpDisplay(a, b);
      const p = avgPersonality(a, b);
      for (const key of ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const) {
        const slider = document.getElementById(`f-${key}`) as HTMLInputElement;
        const valSpan = document.getElementById(`f-${key}-val`)!;
        slider.value = String(Math.round(p[key] * 100));
        valSpan.textContent = String(Math.round(p[key] * 100));
      }
      document.getElementById("f-wallets")!.innerHTML =
        ((a.cdpSolana || b.cdpSolana) ? "🔵 Solana (CDP) " : "") +
        ((a.crossmintWallet || b.crossmintWallet) ? "🟢 Crossmint " : "") ||
        "<span style='color:#666;'>None</span>";
    };

    document.getElementById("f-cancel")!.addEventListener("click", () => (modal.hidden = true));
    document.getElementById("f-agent-a")!.addEventListener("change", updatePreview);
    document.getElementById("f-agent-b")!.addEventListener("change", updatePreview);

    // Wire up trait slider value displays
    for (const key of ["openness", "conscientiousness", "extraversion", "agreeableness", "neuroticism"] as const) {
      const slider = document.getElementById(`f-${key}`) as HTMLInputElement;
      const valSpan = document.getElementById(`f-${key}-val`)!;
      slider.addEventListener("input", () => {
        valSpan.textContent = slider.value;
      });
    }

    document.getElementById("f-ok")!.addEventListener("click", () => {
      const aId = (document.getElementById("f-agent-a") as HTMLSelectElement).value;
      const bId = (document.getElementById("f-agent-b") as HTMLSelectElement).value;
      const name = (document.getElementById("f-name") as HTMLInputElement).value.trim();
      const systemPrompt = (document.getElementById("f-prompt") as HTMLTextAreaElement).value;
      if (!name) return;
      if (aId === bId) {
        this.toast("You can't fuse an agent with itself.");
        return;
      }
      const traits: PersonalityTraits = {
        openness: parseInt((document.getElementById("f-openness") as HTMLInputElement).value) / 100,
        conscientiousness: parseInt((document.getElementById("f-conscientiousness") as HTMLInputElement).value) / 100,
        extraversion: parseInt((document.getElementById("f-extraversion") as HTMLInputElement).value) / 100,
        agreeableness: parseInt((document.getElementById("f-agreeableness") as HTMLInputElement).value) / 100,
        neuroticism: parseInt((document.getElementById("f-neuroticism") as HTMLInputElement).value) / 100,
      };
      this.net.send({ type: "fuse", agentA: aId, agentB: bId, name, systemPrompt, personality: traits });
      modal.hidden = true;
    });
  }

  private hireFromMarketplace(agent: MarketplaceAgent): void {
    if (this.store.accessLevel !== "manage") {
      this.toast(this.store.accessLevel === "tour" ? "Tour mode — ask an admin for manage access to hire agents." : "Go to your office to manage agents.");
      return;
    }
    if (!this.canHireAgent()) return;
    // Parse the agent config JSON — may contain a custom appearance, model,
    // and systemPrompt for premium/curated marketplace agents.
    let config: { model?: string; systemPrompt?: string; appearance?: CharAppearance; mcpServers?: MCPServerConfig[]; cdpSolana?: boolean; crossmintWallet?: boolean; isPremium?: boolean; circleServices?: import("../../../shared/types").CircleServiceConfig[]; skills?: import("../../../shared/types").TaskCategory[] } = {};
    try {
      if (agent.agent) config = JSON.parse(agent.agent);
    } catch { /* not JSON or missing — fall back to defaults */ }

    const systemPrompt = [
      config.systemPrompt || (agent.description ? agent.description : ""),
      agent.use_cases.length > 0 ? `\nUse cases:\n${agent.use_cases.map((u) => `- ${u}`).join("\n")}` : "",
      agent.requirements.length > 0 ? `\nRequirements:\n${agent.requirements.map((r) => `- ${r}`).join("\n")}` : "",
      agent.language ? `\nLanguage: ${agent.language}` : "",
    ].filter(Boolean).join("\n").slice(0, 4000);

    const model = AGENT_MODELS.find((m) => m.id === config.model) ?? AGENT_MODELS[0];

    // Use custom appearance from the agent config if valid, otherwise random.
    let appearance: CharAppearance;
    if (config.appearance && isValidAppearance(config.appearance)) {
      appearance = config.appearance;
    } else {
      appearance = randomAppearance();
    }

    const delivery = {
      name: agent.name.slice(0, 24) || "Agent",
      systemPrompt,
      model: model.id,
      provider: "cline",
      appearance,
      mcpServers: config.mcpServers,
      cdpSolana: config.cdpSolana,
      crossmintWallet: config.crossmintWallet,
      isPremium: config.isPremium,
      circleServices: config.circleServices,
      skills: config.skills,
    };

    // Trigger the helicopter delivery animation. The hire WS message is
    // sent from the scene when the agent emerges from the elevator, so the
    // server creates the agent at the right moment and syncAgents() replaces
    // the cosmetic sprite with the real NPC.
    this.store.triggerHelicopter(delivery);
  }

  private hireCommunityMCP(name: string, mcpConfig: MCPServerConfig): void {
    if (this.store.accessLevel !== "manage") {
      this.toast(this.store.accessLevel === "tour" ? "Tour mode — ask an admin for manage access to hire agents." : "Go to your office to manage agents.");
      return;
    }
    if (!this.canHireAgent()) return;

    const hasInstall = !!(mcpConfig.url || mcpConfig.command);
    const needsSetup = !hasInstall && !!mcpConfig.sourceUrl;

    const systemPrompt = needsSetup
      ? `You are an AI agent powered by a community MCP server that needs self-setup.\n` +
        `Your MCP server source code: ${mcpConfig.sourceUrl}\n` +
        `Use the setup_mcp_server tool to clone, install, and start the MCP server.\n` +
        `After setup succeeds, use_mcp_tool to call individual tools on the server.\n` +
        `Always call setup_mcp_server first before trying to use any MCP tools.\n` +
        `If setup fails, report the error to the boss and suggest alternatives.`
      : `You are an AI agent powered by a community MCP server from PulseMCP.\n` +
        `Your MCP server: ${mcpConfig.name ?? name}\n` +
        `${mcpConfig.url ? `Remote URL: ${mcpConfig.url}` : mcpConfig.command ? `Command: ${mcpConfig.command} ${(mcpConfig.args ?? []).join(" ")}` : ""}\n` +
        `Use your MCP tools to help the boss with tasks related to your capabilities.`;

    const delivery = {
      name: name.slice(0, 24) || "Agent",
      systemPrompt,
      model: AGENT_MODELS[0].id,
      provider: "cline",
      appearance: randomAppearance(),
      mcpServers: [mcpConfig],
    };
    this.store.triggerHelicopter(delivery);
  }

  private canHireAgent(): boolean {
    if (this.store.agentLimit > 0) {
      const hireable = [...this.store.agents.values()].filter((a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID).length;
      if (hireable >= this.store.agentLimit) {
        this.toast(`You've reached your agent limit (${this.store.agentLimit}). Upgrade your plan to hire more agents.`);
        return false;
      }
    }
    return true;
  }

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    document.getElementById("workspace-name")!.textContent = this.store.player
      ? `${this.store.player.workspace} · boss: ${this.store.player.name}`
      : "";
    const connEl = document.getElementById("conn")!;
    connEl.classList.toggle("ok", this.store.connected);
    connEl.classList.toggle("updating", this.store.serverRestarting);

    // Show/hide the server restarting overlay
    const overlay = document.getElementById("server-restart-overlay");
    if (overlay) {
      overlay.style.display = this.store.serverRestarting ? "flex" : "none";
    }

    // Access-level-based UI
    const hireBtn = document.getElementById("hire-btn") as HTMLElement | null;
    if (hireBtn) {
      hireBtn.style.display = this.store.accessLevel === "manage" ? "" : "none";
    }
    this.renderTourBanner();
    this.renderWorldBanner();
    this.renderGateBanner();

    this.renderRoster();
    this.renderDetail();
    this.renderFeed();
    this.renderBoard();
    this.renderGantt();
    this.renderVModel();
    this.renderAchievements();
    this.renderHallOfFame();
    this.renderRailwayPanel();
    this.renderGitHubPanel();
    this.renderCodeEditor();
    this.renderWorldsPanel();
    if (this.store.wardrobeOpen !== this.lastWardrobeOpen) {
      this.lastWardrobeOpen = this.store.wardrobeOpen;
      this.renderWardrobe();
    }
    this.renderForgePanel();
  }

  private renderTourBanner(): void {
    let banner = document.getElementById("tour-banner") as HTMLElement | null;
    if (this.store.accessLevel === "tour") {
      if (this.tourBannerDismissed) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "tour-banner";
        banner.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:500;padding:0.8rem 1.2rem;border-radius:10px;background:var(--panel);border:1px solid var(--accent);color:var(--text);font-size:0.9rem;text-align:center;backdrop-filter:blur(4px);box-shadow:0 4px 16px rgba(0,0,0,0.12);display:flex;align-items:center;gap:10px;";
        const text = document.createElement("span");
        text.innerHTML = "🎬 <strong>Tour Mode</strong> — You can look around but not interact.<br>Ask an admin for talk access to chat with agents.";
        banner.appendChild(text);
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = "flex-shrink:0;width:24px;height:24px;border-radius:50%;border:1px solid var(--dim);background:var(--panel-soft);color:var(--dim);cursor:pointer;font-size:13px;line-height:1;padding:0;display:flex;align-items:center;justify-content:center;";
        closeBtn.title = "Dismiss";
        closeBtn.addEventListener("click", () => {
          this.tourBannerDismissed = true;
          banner!.remove();
        });
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);
      }
    } else {
      if (banner) banner.remove();
      this.tourBannerDismissed = false;
    }
  }

  private renderWorldBanner(): void {
    let banner = document.getElementById("world-banner") as HTMLElement | null;
    if (this.store.currentWorld) {
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "world-banner";
        banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:500;padding:6px 14px;border-radius:8px;background:rgba(20,20,40,0.92);border:1px solid rgba(74,106,138,0.6);color:#c0e0ff;font-size:13px;display:flex;align-items:center;gap:10px;backdrop-filter:blur(4px);";
        document.body.appendChild(banner);
      }
      const worldName = this.store.currentWorld.branchName;
      banner.innerHTML = `🌀 <strong>${esc(worldName)}</strong>`;
      const returnBtn = document.createElement("button");
      returnBtn.textContent = "← Return to HQ";
      returnBtn.style.cssText = "padding:3px 10px;border-radius:6px;border:1px solid #4a6a8a;background:#2a4a6a;color:#c0e0ff;cursor:pointer;font-size:12px;";
      returnBtn.addEventListener("click", () => {
        const scene = this.store.sceneRef as any;
        if (scene?.exitWorld) scene.exitWorld();
      });
      // Replace existing button if any
      const oldBtn = banner.querySelector("button");
      if (oldBtn) oldBtn.remove();
      banner.appendChild(returnBtn);
    } else if (banner) {
      banner.remove();
    }
  }

  private renderGateBanner(): void {
    let banner = document.getElementById("gate-banner") as HTMLElement | null;
    const gate = this.store.pendingGate;
    if (!gate) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "gate-banner";
      banner.style.cssText = "position:fixed;top:50px;left:50%;transform:translateX(-50%);z-index:600;padding:16px 20px;border-radius:12px;background:var(--panel);border:1.5px solid var(--accent);color:var(--text);font-size:14px;max-width:520px;box-shadow:var(--shadow-lg);backdrop-filter:blur(6px);font-family:var(--font-body);";
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="font-size:18px;">❓</span>
        <strong style="color:var(--accent-dark);">${esc(gate.agentName)} needs your decision</strong>
      </div>
      <div style="margin-bottom:14px;color:var(--text);line-height:1.4;">${esc(gate.question)}</div>
      <div id="gate-options" style="display:flex;flex-direction:column;gap:8px;"></div>
    `;
    const optsContainer = banner.querySelector("#gate-options")!;
    for (const opt of gate.options) {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.style.cssText = "padding:8px 14px;border-radius:8px;border:1px solid var(--panel-edge-soft);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:13px;text-align:left;transition:background 0.15s,border-color 0.15s;";
      btn.addEventListener("mouseenter", () => { btn.style.background = "var(--accent-light)"; btn.style.borderColor = "var(--accent)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "var(--panel-soft)"; btn.style.borderColor = "var(--panel-edge-soft)"; });
      btn.addEventListener("click", () => {
        this.store.resolveGate(opt);
      });
      optsContainer.appendChild(btn);
    }
  }

  private renderRoster(): void {
    // rebuilding the list (and re-binding clicks) is wasteful on every log line —
    // skip unless something the roster actually shows has changed
    const sig =
      `${this.rosterCollapsed}|${this.store.selectedId}|` +
      [...this.store.agents.values()]
        .map((a) => a.id + a.name + a.status + a.accent + a.role + (a.appearance ? JSON.stringify(a.appearance) : ''))
        .join(",") + "|" +
      [...this.store.vacationedAgents.values()]
        .map((a) => a.id + a.name + a.accent)
        .join(",");
    if (sig === this.lastRosterSig) return;
    this.lastRosterSig = sig;

    const roster = document.getElementById("roster")!;
    roster.classList.toggle("collapsed", this.rosterCollapsed);
    const rows = [...this.store.agents.values()]
      .sort((a, b) => {
        const perm = (id: string) => id === OFFICE_MANAGER_ID ? 0 : id === HERMES_ID ? 1 : id === WIZARD_ID ? 2 : 3;
        const pa = perm(a.id), pb = perm(b.id);
        return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
      })
      .map(
        (a) => {
          let avatarUrl: string;
          let avatarSize: string;
          if (a.appearance) {
            avatarUrl = generateCharPreviewDataURL(a.appearance, 2);
            avatarSize = 'background-size:20px 30px;';
          } else if (a.id === OFFICE_MANAGER_ID) {
            avatarUrl = 'assets/characters/char-office-manager.png';
            avatarSize = 'background-size:160px 120px;';
          } else if (a.id === HERMES_ID) {
            avatarUrl = 'assets/characters/char-hermes.png';
            avatarSize = 'background-size:160px 120px;';
          } else {
            avatarUrl = `assets/characters/char-${a.sprite ?? 0}.png`;
            avatarSize = 'background-size:160px 120px;';
          }
          return `
        <div class="agent-row ${a.id === this.store.selectedId ? "selected" : ""}" data-id="${a.id}">
          <div class="roster-avatar" style="background-image:url('${avatarUrl}');${avatarSize}"></div>
          <span class="dot ${a.status}"></span>
          <span class="name" style="color:${a.accent}">${esc(a.name)}${a.role === "manager" ? " 👔" : a.role === "devops" ? " 🚂" : ""}</span>
          <span class="status">${a.status}</span>
        </div>`;
        },
      )
      .join("");
    const vacRows = [...this.store.vacationedAgents.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (a) => `
        <div class="agent-row vac-row" data-vac-id="${a.id}">
          <span class="dot idle"></span>
          <span class="name" style="color:${a.accent};opacity:0.6">🏖️ ${esc(a.name)}</span>
          <span class="status" style="cursor:pointer;color:#5a9a5a">restore</span>
        </div>`,
      )
      .join("");
    const vacSection = vacRows
      ? `<div style="margin-top:0.4rem;padding-top:0.4rem;border-top:1px solid #333;font-size:0.7rem;color:#666;text-transform:uppercase;letter-spacing:0.05em;">On Vacation</div>${vacRows}`
      : "";
    const title = `<div class="panel-title">STAFF (${this.store.agents.size})
      <button class="icon-btn" id="roster-toggle" title="${this.rosterCollapsed ? "Open staff" : "Collapse"}">
        ${this.rosterCollapsed ? ICON.open : ICON.collapse}</button></div>`;
    roster.innerHTML = this.rosterCollapsed
      ? title
      : title + (rows || `<div class="empty">nobody here yet…</div>`) + vacSection;
    document.getElementById("roster-toggle")!.addEventListener("click", () => {
      this.rosterCollapsed = !this.rosterCollapsed;
      this.renderRoster();
    });
    roster.querySelectorAll<HTMLElement>(".agent-row:not(.vac-row)").forEach((el) =>
      el.addEventListener("click", () => this.store.select(el.dataset.id!)),
    );
    roster.querySelectorAll<HTMLElement>(".vac-row").forEach((el) =>
      el.addEventListener("click", () => {
        const vacId = el.dataset.vacId!;
        const va = this.store.vacationedAgents.get(vacId);
        if (!va) return;
        inlineConfirm(
          `Restore ${va.name}?`,
          "They'll return to their desk with all memory and session intact.",
          "Restore",
          () => this.net.send({ type: "restore", agentId: vacId }),
        );
      }),
    );
  }

  private renderDetail(): void {
    const panel = document.getElementById("detail")!;
    const agent = this.store.selected();
    if (!agent) {
      panel.hidden = true;
      this.lastSelected = null;
      this.lastSchedulesSig = "";
      this.cdpDetailAgentId = null;
      this.crossmintDetailAgentId = null;
      return;
    }
    panel.hidden = false;

    if (!this._renaming) {
      document.getElementById("d-title")!.innerHTML =
        `<span style="color:${agent.accent}">${esc(agent.name)}</span>` +
        `<button class="rename-btn" id="d-rename" title="Rename agent" style="background:none;border:none;color:${agent.accent};cursor:pointer;font-size:1.1rem;padding:0 0.25rem;opacity:0.7;">✎</button>`;
      document.getElementById("d-titlebar")!.style.borderColor = agent.accent;
    }

    const renameBtn = document.getElementById("d-rename") as HTMLButtonElement | null;
    if (renameBtn) {
      renameBtn.addEventListener("click", () => {
        this._renaming = true;
        const titleEl = document.getElementById("d-title")!;
        const input = document.createElement("input");
        input.type = "text";
        input.value = agent.name;
        input.maxLength = 24;
        input.style.cssText = `color:${agent.accent};background:#111;border:1px solid ${agent.accent};border-radius:0.25rem;padding:0.15rem 0.4rem;font-size:0.9rem;font-family:inherit;width:10rem;`;
        titleEl.innerHTML = "";
        titleEl.appendChild(input);
        input.focus();
        input.select();
        const commit = () => {
          if (!this._renaming) return;
          this._renaming = false;
          const newName = input.value.trim();
          if (newName && newName !== agent.name) {
            this.net.send({ type: "rename", agentId: agent.id, name: newName });
          }
          this.renderDetail();
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { this._renaming = false; this.renderDetail(); }
        });
        input.addEventListener("blur", commit);
      });
    }
    document.getElementById("d-meta")!.innerHTML = `
      <span class="dot ${agent.status}"></span> ${agent.status.toUpperCase()}
      ${agent.role === "manager" ? "· MANAGER " : ""}
      · ${agent.id === OFFICE_MANAGER_ID ? "own office" : agent.id === HERMES_ID ? "mail room" : agent.id === WIZARD_ID ? "world builder" : `desk ${agent.deskIndex + 1}`} · ${agent.tasksDone} done
      ${agent.skills && agent.skills.length ? `<div class="agent-skills">${agent.skills.map((s) => `<span class="skill-badge">${esc(s)}</span>`).join("")}</div>` : ""}
      ${agent.acl && this.store.accessLevel !== "manage" && (agent.acl.allowedUserIds !== undefined || agent.acl.allowedRoles !== undefined)
        ? `<div style="margin-top:0.3rem; display:flex; align-items:center; gap:0.3rem; font-size:0.62rem; color:#c9852c;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#c9852c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Access restricted — chat disabled</div>`
        : ""}`;

    // Office Manager and Hermes can't be fired, vacationed, or fused
    const isNpc = agent.id === OFFICE_MANAGER_ID || agent.id === HERMES_ID || agent.id === WIZARD_ID;
    const fireBtn = document.getElementById("d-fire") as HTMLButtonElement | null;
    if (fireBtn) fireBtn.hidden = isNpc;
    const vacBtn = document.getElementById("d-vacation") as HTMLButtonElement | null;
    if (vacBtn) vacBtn.hidden = isNpc;
    const fuseBtn = document.getElementById("d-fuse") as HTMLButtonElement | null;
    if (fuseBtn) fuseBtn.hidden = isNpc;

    const handoffSel = document.getElementById("d-handoff") as HTMLSelectElement;
    const others = [...this.store.agents.values()].filter((a) => a.id !== agent.id);
    const sig = agent.id + ":" + others.map((a) => a.id + a.name).join(",");
    if (sig !== this.lastHandoffSig) {
      this.lastHandoffSig = sig;
      const prev = handoffSel.value;
      handoffSel.innerHTML =
        `<option value="">— nobody —</option>` +
        others.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
      handoffSel.value = others.some((a) => a.id === prev) ? prev : "";
    }
    const taskEl = document.getElementById("d-task")!;
    taskEl.hidden = !agent.task;
    taskEl.textContent = agent.task ? `▸ ${agent.task}` : "";

    // MCP key management for agents with MCP servers
    const mcpSection = document.getElementById("d-mcp-section")!;
    // Remove previous detail MCP listener to prevent leaks
    if (this.detailMcpListener) {
      const idx = this.store.mcpKeysStatusListeners.indexOf(this.detailMcpListener);
      if (idx >= 0) this.store.mcpKeysStatusListeners.splice(idx, 1);
      this.detailMcpListener = null;
    }
    const mcpServers = agent.mcpServers;
    if (mcpServers && mcpServers.length > 0) {
      mcpSection.hidden = true;
      const serverUrls = mcpServers.map((s) => s.url).filter((u): u is string => !!u);
      mcpSection.innerHTML = `
        <div class="wallet-card">
          <div class="wallet-title mcp">MCP SERVER AUTH</div>
          ${mcpServers.map((s, i) => {
            const isOAuth = s.authType === "oauth";
            const kLabel = s.keyLabel ?? "API Key";
            const kPlaceholder = s.keyPlaceholder ?? "Paste new API key...";
            const kHelpHtml = s.keyHelpUrl
              ? `<a href="${s.keyHelpUrl}" target="_blank" class="wallet-link" style="margin-left:0.4rem;">Get key →</a>`
              : "";
            return `
            <div style="margin-bottom:0.4rem;">
              <div class="wallet-label" style="font-size:0.7rem; margin-bottom:0.2rem;">${esc(s.name ?? s.url ?? "MCP Server")} ${isOAuth ? '<span style="color:var(--accent);font-size:0.6rem;">OAuth</span>' : `<span style="font-size:0.6rem;">${esc(kLabel)}</span>${kHelpHtml}`}</div>
              <div style="display:flex; gap:0.25rem; align-items:center;">
                ${isOAuth
                  ? `<button id="d-mcp-connect-${i}" class="btn" style="flex:1; padding:0.35rem 0.5rem; font-size:0.7rem;">🔗 Reconnect via OAuth</button>
                     <button id="d-mcp-disconnect-${i}" class="btn" style="padding:0.35rem 0.5rem; font-size:0.7rem; color:var(--red);">Disconnect</button>`
                  : `<input id="d-mcp-key-${i}" type="password" placeholder="${esc(kPlaceholder)}" autocomplete="off"
                      style="flex:1; padding:0.35rem 0.5rem; font-size:0.75rem;" />
                    <button id="d-mcp-save-${i}" class="btn" style="padding:0.35rem 0.5rem; font-size:0.7rem;">Save</button>`
                }
                <span id="d-mcp-status-${i}" style="font-size:0.65rem; color:var(--dim); min-width:1.5rem;"></span>
              </div>
            </div>`;
          }).join("")}
        </div>
      `;
      // Check existing key status
      if (serverUrls.length > 0) {
        this.net.send({ type: "check_mcp_keys", serverUrls });
      }
      // Wire up save buttons (API key auth)
      mcpServers.forEach((s, i) => {
        const saveBtn = mcpSection.querySelector(`#d-mcp-save-${i}`) as HTMLButtonElement | null;
        if (saveBtn && s.url) {
          saveBtn.addEventListener("click", () => {
            const input = mcpSection.querySelector(`#d-mcp-key-${i}`) as HTMLInputElement | null;
            if (!input) return;
            const key = input.value.trim();
            if (!key) { input.focus(); return; }
            this.net.send({ type: "set_mcp_key", serverUrl: s.url!, apiKey: key });
            input.value = "";
            saveBtn.textContent = "✓ Saved";
            setTimeout(() => { saveBtn.textContent = "Save"; }, 2000);
            const statusEl = mcpSection.querySelector(`#d-mcp-status-${i}`) as HTMLSpanElement | null;
            if (statusEl) { statusEl.textContent = "✓"; statusEl.style.color = "#53b86b"; }
          });
        }
      });
      // Wire up OAuth connect buttons
      mcpServers.forEach((s, i) => {
        const connectBtn = mcpSection.querySelector(`#d-mcp-connect-${i}`) as HTMLButtonElement | null;
        if (connectBtn && s.url) {
          connectBtn.addEventListener("click", () => {
            this.net.send({ type: "start_mcp_oauth", serverUrl: s.url!, clientOrigin: window.location.origin });
            connectBtn.textContent = "Opening login...";
            connectBtn.disabled = true;
            setTimeout(() => { connectBtn.textContent = "🔗 Reconnect via OAuth"; connectBtn.disabled = false; }, 5000);
          });
        }
        const disconnectBtn = mcpSection.querySelector(`#d-mcp-disconnect-${i}`) as HTMLButtonElement | null;
        if (disconnectBtn && s.url) {
          disconnectBtn.addEventListener("click", () => {
            this.net.send({ type: "set_mcp_key", serverUrl: s.url!, apiKey: "" });
            disconnectBtn.textContent = "✓ Disconnected";
            setTimeout(() => { disconnectBtn.textContent = "Disconnect"; }, 2000);
            const statusEl = mcpSection.querySelector(`#d-mcp-status-${i}`) as HTMLSpanElement | null;
            if (statusEl) { statusEl.textContent = "✗"; statusEl.style.color = "var(--red)"; }
          });
        }
      });
      // Listen for key status response
      this.detailMcpListener = (results: { serverUrl: string; hasKey: boolean }[]) => {
        for (const r of results) {
          const idx = serverUrls.indexOf(r.serverUrl);
          if (idx >= 0) {
            const statusEl = mcpSection.querySelector(`#d-mcp-status-${idx}`) as HTMLSpanElement | null;
            if (statusEl) {
              statusEl.textContent = r.hasKey ? "✓" : "✗";
              statusEl.style.color = r.hasKey ? "var(--green)" : "var(--red)";
            }
          }
        }
        // Always show MCP section so users can disconnect/reconnect
        mcpSection.hidden = false;
      };
      this.store.mcpKeysStatusListeners.push(this.detailMcpListener);
    } else {
      mcpSection.hidden = true;
      mcpSection.innerHTML = "";
    }

    // Security & access info section — shows MCP server risk levels and data access
    const securitySection = document.getElementById("d-security-section")!;
    if (mcpServers && mcpServers.length > 0) {
      const securityEntries: { name: string; riskLevel: string; securityNote: string; dataAccess: string }[] = [];
      for (const s of mcpServers) {
        const serverName = s.name ?? s.url ?? "MCP Server";
        if (s.riskLevel && s.securityNote && s.dataAccess) {
          securityEntries.push({ name: serverName, riskLevel: s.riskLevel, securityNote: s.securityNote, dataAccess: s.dataAccess });
        } else {
          const fallback = SECURITY_NOTES[serverName];
          if (fallback) {
            securityEntries.push({ name: serverName, ...fallback });
          }
        }
      }
      if (securityEntries.length > 0) {
        securitySection.hidden = false;
        const hasHighRisk = securityEntries.some((e) => e.riskLevel === "high");
        const hasMediumRisk = securityEntries.some((e) => e.riskLevel === "medium");
        const borderColor = hasHighRisk ? "#5a2020" : hasMediumRisk ? "#3a3520" : "var(--panel-edge-soft)";
        const bgColor = hasHighRisk ? "rgba(90,32,32,0.08)" : hasMediumRisk ? "rgba(58,53,32,0.08)" : "var(--panel-soft)";
        const headerColor = hasHighRisk ? "var(--red)" : hasMediumRisk ? "#c9852c" : "var(--dim)";
        const highCount = securityEntries.filter((e) => e.riskLevel === "high").length;
        const medCount = securityEntries.filter((e) => e.riskLevel === "medium").length;
        let secSummary: string;
        if (highCount > 0) secSummary = `${highCount} high risk`;
        else if (medCount > 0) secSummary = `${medCount} medium risk`;
        else secSummary = `${securityEntries.length} low risk`;
        securitySection.innerHTML = `
          <div style="margin:0.4rem 0;">
            <div id="sec-toggle" style="display:flex; align-items:center; gap:0.35rem; padding:0.35rem 0.5rem; border:1px solid ${borderColor}; border-radius:0.375rem; background:${bgColor}; cursor:pointer; user-select:none;">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${headerColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style="font-size:0.65rem; color:var(--text); flex:1; text-align:left;">Security &amp; Access — ${esc(secSummary)}</span>
              <span id="sec-chevron" style="font-size:0.6rem; color:var(--dim);">▸</span>
            </div>
            <div id="sec-expanded" style="display:none; margin-top:0.3rem; padding:0.5rem; border:1px solid ${borderColor}; border-radius:0.375rem; background:${bgColor};">
              ${securityEntries.map((e) => {
                const rc = e.riskLevel === "high" ? "var(--red)" : e.riskLevel === "medium" ? "#c9852c" : "var(--dim)";
                const rl = e.riskLevel === "high" ? "HIGH RISK" : e.riskLevel === "medium" ? "MEDIUM RISK" : "LOW RISK";
                return `<div style="margin-bottom:0.4rem; padding-bottom:0.4rem; border-bottom:1px solid var(--panel-edge-soft);">
                  <div style="display:flex; align-items:center; gap:0.3rem; margin-bottom:0.15rem;">
                    <span style="font-size:0.7rem; font-weight:600; color:var(--text);">${esc(e.name)}</span>
                    <span style="font-size:0.55rem; font-weight:700; padding:0.08rem 0.3rem; border-radius:0.2rem; background:${rc}22; color:${rc};">${rl}</span>
                  </div>
                  <div style="font-size:0.65rem; color:var(--dim); margin-bottom:0.15rem;">${esc(e.dataAccess)}</div>
                  <div style="font-size:0.63rem; color:var(--dim); line-height:1.35;">${esc(e.securityNote)}</div>
                </div>`;
              }).join("")}
            </div>
          </div>
        `;
        // Wire up expand/collapse
        const secToggle = securitySection.querySelector("#sec-toggle") as HTMLElement | null;
        const secExpanded = securitySection.querySelector("#sec-expanded") as HTMLElement | null;
        const secChevron = securitySection.querySelector("#sec-chevron") as HTMLElement | null;
        if (secToggle && secExpanded) {
          secToggle.addEventListener("click", () => {
            const isExpanded = secExpanded.style.display !== "none";
            secExpanded.style.display = isExpanded ? "none" : "block";
            if (secChevron) secChevron.textContent = isExpanded ? "▸" : "▾";
          });
        }
      } else {
        securitySection.hidden = true;
        securitySection.innerHTML = "";
      }
    } else {
      securitySection.hidden = true;
      securitySection.innerHTML = "";
    }

    // ACL (Access Control List) section — collapsible, manage who can chat with this agent
    const aclSection = document.getElementById("d-acl-section")!;
    if (this.store.accessLevel === "manage" && !isNpc) {
      aclSection.hidden = false;
      const acl = agent.acl;
      const hasAcl = acl && (acl.allowedUserIds !== undefined || acl.allowedRoles !== undefined);
      const allowedIds = acl?.allowedUserIds ?? [];
      const allowedCount = allowedIds.length;

      // Build summary label
      let summaryLabel: string;
      if (!hasAcl) {
        summaryLabel = "Everyone with talk access";
      } else if (allowedCount === 0) {
        summaryLabel = "Only you (owner)";
      } else {
        summaryLabel = `${allowedCount} person${allowedCount !== 1 ? "s" : ""} allowed`;
      }

      // Collect people: room players + org members (deduped by userId)
      const currentUserId = getUserId();
      const roomPlayers = [...this.store.roomPlayers.values()].filter((p) => p.userId !== currentUserId);
      const orgMembers = this.store.orgMembers?.members.filter((m) => m.userId !== currentUserId) ?? [];
      const peopleMap = new Map<string, { userId: string; name: string }>();
      for (const p of roomPlayers) peopleMap.set(p.userId, { userId: p.userId, name: p.name });
      for (const m of orgMembers) {
        if (!peopleMap.has(m.userId)) {
          const name = m.userEmail ? m.userEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : m.userId.slice(0, 8);
          peopleMap.set(m.userId, { userId: m.userId, name });
        }
      }
      const people = [...peopleMap.values()];

      aclSection.innerHTML = `
        <div style="margin:0.3rem 0;">
          <div id="acl-toggle" style="display:flex; align-items:center; gap:0.35rem; padding:0.3rem 0.5rem; border:1px solid var(--panel-edge-soft); border-radius:0.375rem; background:var(--panel-soft); cursor:pointer; user-select:none;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${hasAcl ? "var(--accent)" : "var(--dim)"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span style="font-size:0.65rem; font-weight:700; color:var(--text); text-align:left;">Chat Access</span>
            <span style="font-size:0.6rem; color:var(--dim); flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(summaryLabel)}</span>
            <span id="acl-chevron" style="font-size:0.6rem; color:var(--dim);">▸</span>
          </div>
          <div id="acl-expanded" style="display:none; margin-top:0.2rem; padding:0.35rem; border:1px solid var(--panel-edge-soft); border-radius:0.375rem; background:var(--panel-soft);">
            <div style="font-size:0.58rem; color:var(--dim); margin-bottom:0.25rem; line-height:1.3;">
              Visitors with "talk" access will see the agent but can't interact unless they're on the allowed list.
            </div>
            <div style="font-size:0.62rem; font-weight:700; color:var(--text); margin-bottom:0.2rem;">Who can chat?</div>
            <div style="display:flex; flex-direction:column; gap:0.2rem; margin-bottom:0.25rem;">
              <label style="display:flex; align-items:center; gap:0.3rem; font-size:0.65rem; color:var(--text); cursor:pointer; text-align:left;">
                <input type="radio" name="acl-mode" value="open" ${!hasAcl ? "checked" : ""} style="accent-color:var(--accent); flex-shrink:0;" />
                Everyone with talk access can chat
              </label>
              <label style="display:flex; align-items:center; gap:0.3rem; font-size:0.65rem; color:var(--text); cursor:pointer; text-align:left;">
                <input type="radio" name="acl-mode" value="restricted" ${hasAcl ? "checked" : ""} style="accent-color:var(--accent); flex-shrink:0;" />
                Only specific people can chat
              </label>
            </div>
            <div id="acl-people" style="${hasAcl ? "" : "display:none;"}">
              <div style="font-size:0.58rem; color:var(--dim); margin-bottom:0.2rem;">Allowed people:</div>
              ${people.length > 0
                ? `<div style="max-height:6rem; overflow-y:auto; border:1px solid var(--panel-edge-soft); border-radius:0.25rem; padding:0.2rem;">
                  ${people.map((p) => `<label style="display:flex; align-items:center; gap:0.3rem; font-size:0.62rem; color:var(--text); cursor:pointer; padding:0.15rem 0.2rem; border-radius:0.2rem; text-align:left; margin-bottom:0.05rem; background:var(--panel);">
                    <input type="checkbox" class="acl-user-cb" data-uid="${p.userId}" ${allowedIds.includes(p.userId) ? "checked" : ""} style="accent-color:var(--accent); flex-shrink:0; width:0.7rem; height:0.7rem;" />
                    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(p.name)}</span>
                  </label>`).join("")}
                </div>`
                : `<div style="font-size:0.6rem; color:var(--dim); padding:0.25rem; border:1px solid var(--panel-edge-soft); border-radius:0.25rem;">No other people available. Invite people to your room or org first.</div>`
              }
            </div>
            <button id="d-acl-save" style="margin-top:0.25rem; padding:0.2rem 0.5rem; border:1px solid var(--accent); border-radius:0.25rem; background:var(--panel); color:var(--accent); font-size:0.6rem; cursor:pointer; width:100%;">Save</button>
          </div>
        </div>
      `;

      // Wire up expand/collapse toggle
      const toggleEl = aclSection.querySelector("#acl-toggle") as HTMLElement | null;
      const expandedEl = aclSection.querySelector("#acl-expanded") as HTMLElement | null;
      const chevron = aclSection.querySelector("#acl-chevron") as HTMLElement | null;
      if (toggleEl && expandedEl) {
        toggleEl.addEventListener("click", () => {
          const isExpanded = expandedEl.style.display !== "none";
          expandedEl.style.display = isExpanded ? "none" : "block";
          if (chevron) chevron.textContent = isExpanded ? "▸" : "▾";
        });
      }

      // Wire up radio toggle
      const radios = aclSection.querySelectorAll('input[name="acl-mode"]');
      const peopleDiv = aclSection.querySelector("#acl-people") as HTMLElement | null;
      radios.forEach((r) => {
        r.addEventListener("change", () => {
          const radio = r as HTMLInputElement;
          if (peopleDiv) {
            peopleDiv.style.display = radio.value === "restricted" ? "block" : "none";
          }
        });
      });

      // Wire up save button
      const saveBtn = aclSection.querySelector("#d-acl-save") as HTMLButtonElement | null;
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          const selected = aclSection.querySelector('input[name="acl-mode"]:checked') as HTMLInputElement | null;
          if (!selected) return;
          if (selected.value === "open") {
            this.net.send({ type: "set_agent_acl", agentId: agent.id, acl: {} });
            this.toast("Access opened — everyone with talk access can chat.");
          } else {
            const checked = aclSection.querySelectorAll(".acl-user-cb:checked") as NodeListOf<HTMLInputElement>;
            const userIds = [...checked].map((cb) => cb.dataset.uid).filter((u): u is string => !!u);
            this.net.send({ type: "set_agent_acl", agentId: agent.id, acl: { allowedUserIds: userIds } });
            this.toast(`Access restricted to ${userIds.length} person${userIds.length !== 1 ? "s" : ""}.`);
          }
          saveBtn.textContent = "Saved";
          setTimeout(() => { saveBtn.textContent = "Save"; }, 2000);
          // Collapse after save
          if (expandedEl) expandedEl.style.display = "none";
          if (chevron) chevron.textContent = "▸";
        });
      }
    } else {
      aclSection.hidden = true;
      aclSection.innerHTML = "";
    }

    // Premium services section — show paid API services and per-call costs
    const premiumSection = document.getElementById("d-premium-section")!;
    if (agent.isPremium && agent.circleServices && agent.circleServices.length > 0) {
      premiumSection.hidden = false;
      // Group services by name — CoinGecko has 14 separate entries each with 1 tool;
      // merge them into a single card with all tools.
      const serviceMap = new Map<string, { name: string; pricePerCall: number; description: string; tools: { name: string; description: string }[] }>();
      for (const s of agent.circleServices) {
        const existing = serviceMap.get(s.name);
        if (existing) {
          existing.tools.push(...s.tools);
        } else {
          serviceMap.set(s.name, { name: s.name, pricePerCall: s.pricePerCall, description: s.description, tools: [...s.tools] });
        }
      }
      const grouped = [...serviceMap.values()];
      const minPrice = Math.min(...grouped.map((s) => s.pricePerCall));
      const maxPrice = Math.max(...grouped.map((s) => s.pricePerCall));
      const priceLabel = minPrice === maxPrice
        ? `$${minPrice.toFixed(4)}/call`
        : `$${minPrice.toFixed(4)}–$${maxPrice.toFixed(4)}/call`;
      premiumSection.innerHTML = `
        <div style="margin:0.5rem 0; padding:0.6rem; border:1px solid #2a1a3a; border-radius:0.5rem; background:rgba(42,26,58,0.15);">
          <div style="font-size:0.75rem; font-weight:600; color:#b388ff; margin-bottom:0.3rem;">⚡ PREMIUM API SERVICES · ${priceLabel}</div>
          <div style="display:flex; flex-direction:column; gap:0.25rem;">
            ${grouped.map((s, si) => {
              const toolCount = s.tools.length;
              return `<div style="padding:0.25rem 0.4rem; border:1px solid #2a1a3a; border-radius:0.3rem; background:rgba(18,13,26,0.5);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.7rem; color:#ccc;">${esc(s.name)}</span>
                  <span style="font-size:0.65rem; color:#b388ff; font-weight:600;">$${s.pricePerCall.toFixed(4)}/call</span>
                </div>
                ${toolCount > 0 ? `<div id="hud-premium-toggle-${si}" style="font-size:0.6rem; color:#b388ff; margin-top:0.2rem; cursor:pointer; user-select:none;">▸ ${toolCount} endpoint${toolCount > 1 ? "s" : ""}</div>
                <div id="hud-premium-tools-${si}" style="display:none; max-height:100px; overflow-y:auto; margin-top:0.2rem; padding:0.25rem 0.4rem; border:1px solid #2a1a3a; border-radius:0.25rem; background:rgba(13,10,20,0.6);">
                  ${s.tools.map((t) => `<div style="font-size:0.58rem; color:#888; padding:0.08rem 0; border-bottom:1px solid #1a1525;">${esc(t.name)}</div>`).join("")}
                </div>` : ""}
              </div>`;
            }).join("")}
          </div>
          <div style="font-size:0.62rem; color:#666; margin-top:0.4rem; line-height:1.3;">
            Billed to your premium allowance (Starter $0.50 · Pro $3.00 · Business $12.00/mo). Separate from AI inference budget.
          </div>
        </div>
      `;
      // Wire up endpoint toggles
      grouped.forEach((_, si) => {
        const toggle = premiumSection.querySelector(`#hud-premium-toggle-${si}`) as HTMLDivElement | null;
        const toolsDiv = premiumSection.querySelector(`#hud-premium-tools-${si}`) as HTMLDivElement | null;
        if (toggle && toolsDiv) {
          toggle.addEventListener("click", () => {
            const expanded = toolsDiv.style.display !== "none";
            toolsDiv.style.display = expanded ? "none" : "block";
            const label = toggle.textContent?.replace(/^[▾▸] /, "").trim() ?? "";
            toggle.textContent = expanded ? `▸ ${label}` : `▾ ${label}`;
          });
        }
      });
    } else {
      premiumSection.hidden = true;
      premiumSection.innerHTML = "";
    }

    // CDP Solana wallet section — only rebuild when selected agent changes
    const cdpSection = document.getElementById("d-cdp-section")!;
    const cdpNeedsInit = this.cdpDetailAgentId !== agent.id ||
      (agent.cdpSolana && cdpSection.hidden) ||
      (!agent.cdpSolana && !cdpSection.hidden);
    if (cdpNeedsInit) {
      // Clean up old listeners from previous agent
      if (this.detailCdpListener) {
        const idx = this.store.cdpWalletListeners.indexOf(this.detailCdpListener);
        if (idx >= 0) this.store.cdpWalletListeners.splice(idx, 1);
        this.detailCdpListener = null;
      }
      if (this.detailCdpPolicyListener) {
        const pidx = this.store.cdpPolicyListeners.indexOf(this.detailCdpPolicyListener);
        if (pidx >= 0) this.store.cdpPolicyListeners.splice(pidx, 1);
        this.detailCdpPolicyListener = null;
      }
      if (this.detailCdpTxHistoryListener) {
        const tidx = this.store.cdpTxHistoryListeners.indexOf(this.detailCdpTxHistoryListener);
        if (tidx >= 0) this.store.cdpTxHistoryListeners.splice(tidx, 1);
        this.detailCdpTxHistoryListener = null;
      }
      if (this.detailCdpOnrampListener) {
        const oidx = this.store.cdpOnrampListeners.indexOf(this.detailCdpOnrampListener);
        if (oidx >= 0) this.store.cdpOnrampListeners.splice(oidx, 1);
        this.detailCdpOnrampListener = null;
      }
      this.cdpDetailAgentId = agent.id;
    if (agent.cdpSolana) {
      cdpSection.hidden = false;
      cdpSection.innerHTML = `
        <div style="margin:0.5rem 0; padding:0.6rem; border:1px solid var(--panel-edge-soft); border-radius:0.5rem; background:var(--panel-soft);">
          <div style="font-size:0.75rem; font-weight:600; color:var(--accent); margin-bottom:0.4rem;">◎ SOLANA WALLET (CDP)</div>
          <div id="d-cdp-content" style="font-size:0.7rem; color:var(--dim);">Loading wallet...</div>
          <button id="d-cdp-refresh" style="margin-top:0.4rem; padding:0.3rem 0.5rem; border:1px solid var(--panel-edge-soft); border-radius:0.3rem; background:var(--panel); color:var(--dim); font-size:0.65rem; cursor:pointer;">↻ Refresh</button>
          <button id="d-cdp-buy" style="margin-top:0.4rem; margin-left:0.3rem; padding:0.3rem 0.5rem; border:1px solid var(--accent); border-radius:0.3rem; background:var(--panel); color:var(--accent); font-size:0.65rem; cursor:pointer;">Buy SOL</button>
        </div>
        <div id="d-cdp-policy" style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid var(--panel-edge-soft);">
          <div style="font-size:0.65rem; font-weight:600; color:var(--accent); margin-bottom:0.3rem;">⚙ SPENDING POLICY</div>
          <div id="d-cdp-policy-content" style="font-size:0.7rem; color:var(--dim);">Loading policy...</div>
        </div>
        <div id="d-cdp-txhistory" style="margin-top:0.5rem; padding-top:0.4rem; border-top:1px solid var(--panel-edge-soft);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
            <div style="font-size:0.65rem; font-weight:600; color:var(--accent);">📜 TRANSACTION HISTORY</div>
            <button id="d-cdp-tx-refresh" style="padding:0.2rem 0.4rem; border:1px solid var(--panel-edge-soft); border-radius:0.3rem; background:var(--panel); color:var(--dim); font-size:0.6rem; cursor:pointer;">↻</button>
          </div>
          <div id="d-cdp-tx-content" style="font-size:0.7rem; color:var(--dim);">Loading transactions...</div>
        </div>
      `;
      const refreshBtn = cdpSection.querySelector("#d-cdp-refresh") as HTMLButtonElement | null;
      if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
          this.net.send({ type: "get_cdp_wallet", agentId: agent.id });
          refreshBtn.textContent = "Loading...";
          setTimeout(() => { refreshBtn.textContent = "↻ Refresh"; }, 2000);
        });
      }
      const buyBtn = cdpSection.querySelector("#d-cdp-buy") as HTMLButtonElement | null;
      if (buyBtn) {
        buyBtn.addEventListener("click", () => {
          this.net.send({ type: "create_cdp_onramp", agentId: agent.id });
          buyBtn.textContent = "Loading...";
          buyBtn.disabled = true;
        });
      }
      const onrampListener = (msg: { agentId: string; url: string | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        if (buyBtn) {
          buyBtn.textContent = "Buy SOL";
          buyBtn.disabled = false;
        }
        if (msg.error) {
          this.store.toast(`Onramp error: ${msg.error}`);
          return;
        }
        if (msg.url) {
          window.open(msg.url, "_blank", "noopener,noreferrer");
        }
      };
      this.detailCdpOnrampListener = onrampListener;
      this.store.cdpOnrampListeners.push(onrampListener);
      this.net.send({ type: "get_cdp_wallet", agentId: agent.id });
      this.detailCdpListener = (msg: { agentId: string; address: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const content = cdpSection.querySelector("#d-cdp-content") as HTMLElement | null;
        if (!content) return;
        if (msg.error) {
          content.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        if (!msg.address) {
          content.innerHTML = `<span class="wallet-error">⚠ Wallet not available</span>`;
          return;
        }
        const balancesHtml = msg.balances && msg.balances.length > 0
          ? msg.balances.map((b: { symbol: string; amount: string; usdValue?: string }) => {
              const usd = b.usdValue ? ` <span style="color:var(--dim);">($${esc(b.usdValue)})</span>` : "";
              return `<div style="margin-top:0.2rem;">${esc(b.symbol)}: ${esc(b.amount)}${usd}</div>`;
            }).join("")
          : `<div style="color:var(--dim); margin-top:0.2rem;">No balances — wallet may need funding</div>`;
        content.innerHTML = `
          <div style="color:var(--text); font-family:monospace; font-size:0.65rem; word-break:break-all; display:flex; align-items:flex-start; gap:0.3rem;">
            <span>${esc(msg.address)}</span>
            <button id="d-cdp-copy" title="Copy address" style="border:none; background:none; color:var(--accent); cursor:pointer; font-size:0.7rem; padding:0; flex-shrink:0;">⧉</button>
            <button id="d-cdp-qr" title="Show QR code" style="border:none; background:none; color:var(--accent); cursor:pointer; font-size:0.7rem; padding:0; flex-shrink:0;">⊞</button>
          </div>
          <div id="d-cdp-qr-box" style="display:none; margin-top:0.4rem; padding:0.5rem; background:#fff; border-radius:0.3rem; width:fit-content;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(msg.address)}" alt="Wallet QR" style="display:block; width:120px; height:120px;" />
          </div>
          <div style="margin-top:0.3rem;">
            <a href="https://explorer.solana.com/address/${esc(msg.address)}" target="_blank" style="font-size:0.6rem; color:var(--accent); text-decoration:none;">View on Solana Explorer →</a>
          </div>
          <div style="margin-top:0.4rem; border-top:1px solid var(--panel-edge-soft); padding-top:0.3rem;">
            <div style="font-size:0.65rem; color:var(--dim); margin-bottom:0.2rem;">Balances:</div>
            ${balancesHtml}
          </div>
        `;
        const copyBtn = content.querySelector("#d-cdp-copy") as HTMLButtonElement | null;
        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(msg.address!);
            copyBtn.textContent = "✓";
            setTimeout(() => { copyBtn.textContent = "⧉"; }, 1500);
          });
        }
        const qrBtn = content.querySelector("#d-cdp-qr") as HTMLButtonElement | null;
        const qrBox = content.querySelector("#d-cdp-qr-box") as HTMLElement | null;
        if (qrBtn && qrBox) {
          qrBtn.addEventListener("click", () => {
            const visible = qrBox.style.display !== "none";
            qrBox.style.display = visible ? "none" : "block";
            qrBtn.textContent = visible ? "⊞" : "⊟";
          });
        }
      };
      this.store.cdpWalletListeners.push(this.detailCdpListener);

      this.net.send({ type: "get_cdp_policy", agentId: agent.id });
      this.detailCdpPolicyListener = (msg: { agentId: string; policyId: string | null; maxSolPerTransfer: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; allowedTokenMints: string[] | null; blockedTokenMints: string[] | null; network: string; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const pcontent = cdpSection.querySelector("#d-cdp-policy-content") as HTMLElement | null;
        if (!pcontent) return;
        if (msg.error) {
          pcontent.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        const maxSol = msg.maxSolPerTransfer ?? "";
        const allowed = msg.allowedRecipients?.join(", ") ?? "";
        const blocked = msg.blockedRecipients?.join(", ") ?? "";
        const allowedMints = msg.allowedTokenMints?.join(", ") ?? "";
        const blockedMints = msg.blockedTokenMints?.join(", ") ?? "";
        pcontent.innerHTML = `
          <div style="margin-bottom:0.3rem;">
            <label style="color:var(--dim); font-size:0.65rem;">Max SOL per transfer:</label>
            <input id="d-cdp-max-sol" type="number" step="0.01" min="0" value="${esc(String(maxSol))}" placeholder="unlimited" style="font-size:0.7rem;" />
          </div>
          <div style="margin-bottom:0.3rem;">
            <label style="color:var(--dim); font-size:0.65rem;">Allowed recipients (comma-sep, leave empty for any):</label>
            <input id="d-cdp-allowed" type="text" value="${esc(allowed)}" placeholder="any address" style="font-size:0.7rem; font-family:monospace;" />
          </div>
          <div style="margin-bottom:0.3rem;">
            <label style="color:var(--dim); font-size:0.65rem;">Blocked recipients (comma-sep):</label>
            <input id="d-cdp-blocked" type="text" value="${esc(blocked)}" placeholder="none" style="font-size:0.7rem; font-family:monospace;" />
          </div>
          <div style="margin-bottom:0.3rem;">
            <label style="color:var(--dim); font-size:0.65rem;">Allowed token mints (comma-sep, leave empty for any):</label>
            <input id="d-cdp-allowed-mints" type="text" value="${esc(allowedMints)}" placeholder="any token" style="font-size:0.7rem; font-family:monospace;" />
          </div>
          <div style="margin-bottom:0.3rem;">
            <label style="color:var(--dim); font-size:0.65rem;">Blocked token mints (comma-sep):</label>
            <input id="d-cdp-blocked-mints" type="text" value="${esc(blockedMints)}" placeholder="none" style="font-size:0.7rem; font-family:monospace;" />
          </div>
          <button id="d-cdp-save-policy" class="btn" style="padding:0.3rem 0.5rem; font-size:0.65rem;">Save Policy</button>
        `;
        const saveBtn = pcontent.querySelector("#d-cdp-save-policy") as HTMLButtonElement | null;
        if (saveBtn) {
          saveBtn.addEventListener("click", () => {
            const maxSolInput = pcontent.querySelector("#d-cdp-max-sol") as HTMLInputElement | null;
            const allowedInput = pcontent.querySelector("#d-cdp-allowed") as HTMLInputElement | null;
            const blockedInput = pcontent.querySelector("#d-cdp-blocked") as HTMLInputElement | null;
            const allowedMintsInput = pcontent.querySelector("#d-cdp-allowed-mints") as HTMLInputElement | null;
            const blockedMintsInput = pcontent.querySelector("#d-cdp-blocked-mints") as HTMLInputElement | null;
            const maxSolVal = maxSolInput?.value.trim();
            const allowedVal = allowedInput?.value.trim();
            const blockedVal = blockedInput?.value.trim();
            const allowedMintsVal = allowedMintsInput?.value.trim();
            const blockedMintsVal = blockedMintsInput?.value.trim();
            this.net.send({
              type: "set_cdp_policy",
              agentId: agent.id,
              maxSolPerTransfer: maxSolVal ? parseFloat(maxSolVal) : undefined,
              allowedRecipients: allowedVal ? allowedVal.split(",").map(s => s.trim()).filter(Boolean) : undefined,
              blockedRecipients: blockedVal ? blockedVal.split(",").map(s => s.trim()).filter(Boolean) : undefined,
              allowedTokenMints: allowedMintsVal ? allowedMintsVal.split(",").map(s => s.trim()).filter(Boolean) : undefined,
              blockedTokenMints: blockedMintsVal ? blockedMintsVal.split(",").map(s => s.trim()).filter(Boolean) : undefined,
            });
            saveBtn.textContent = "Saving...";
            setTimeout(() => { saveBtn.textContent = "Save Policy"; }, 2000);
          });
        }
      };
      this.store.cdpPolicyListeners.push(this.detailCdpPolicyListener);

      this.net.send({ type: "get_cdp_tx_history", agentId: agent.id });
      const txRefreshBtn = cdpSection.querySelector("#d-cdp-tx-refresh") as HTMLButtonElement | null;
      if (txRefreshBtn) {
        txRefreshBtn.addEventListener("click", () => {
          this.net.send({ type: "get_cdp_tx_history", agentId: agent.id });
          txRefreshBtn.textContent = "...";
          setTimeout(() => { txRefreshBtn.textContent = "↻"; }, 2000);
        });
      }
      this.detailCdpTxHistoryListener = (msg: { agentId: string; transactions: { signature: string; slot: number; blockTime: number | null; err: boolean | null; memo: string | null }[] | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const txContent = cdpSection.querySelector("#d-cdp-tx-content") as HTMLElement | null;
        if (!txContent) return;
        if (msg.error) {
          txContent.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        if (!msg.transactions || msg.transactions.length === 0) {
          txContent.innerHTML = `<span style="color:var(--dim);">No transactions yet — this wallet may be new</span>`;
          return;
        }
        const isDevnet = agent.cdpSolana;
        const clusterParam = isDevnet ? "?cluster=devnet" : "";
        txContent.innerHTML = msg.transactions.map((tx) => {
          const time = tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "unknown";
          const statusColor = tx.err ? "var(--red)" : "var(--green)";
          const statusText = tx.err ? "FAIL" : "OK";
          const shortSig = tx.signature.slice(0, 8) + "..." + tx.signature.slice(-4);
          const memo = tx.memo ? ` <span style="color:var(--dim);">${esc(tx.memo)}</span>` : "";
          return `<div style="margin-top:0.2rem; display:flex; gap:0.3rem; align-items:center;">` +
            `<span style="color:var(--dim); font-size:0.6rem;">${time}</span>` +
            `<span style="color:${statusColor}; font-size:0.6rem; font-weight:600;">${statusText}</span>` +
            `<a href="https://explorer.solana.com/tx/${esc(tx.signature)}${clusterParam}" target="_blank" style="color:var(--accent); font-size:0.6rem; text-decoration:none; font-family:monospace;">${shortSig}</a>` +
            memo +
            `</div>`;
        }).join("");
      };
      this.store.cdpTxHistoryListeners.push(this.detailCdpTxHistoryListener);
    } else {
      cdpSection.hidden = true;
      cdpSection.innerHTML = "";
    }
    } // end cdpNeedsInit

    // Crossmint multi-chain wallet section — only rebuild when selected agent changes
    const crossmintSection = document.getElementById("d-crossmint-section")!;
    const crossmintNeedsInit = this.crossmintDetailAgentId !== agent.id ||
      (agent.crossmintWallet && crossmintSection.hidden) ||
      (!agent.crossmintWallet && !crossmintSection.hidden);
    if (crossmintNeedsInit) {
      // Clean up old listeners from previous agent
      if (this.detailCrossmintListener) {
        const idx = this.store.crossmintWalletListeners.indexOf(this.detailCrossmintListener);
        if (idx >= 0) this.store.crossmintWalletListeners.splice(idx, 1);
        this.detailCrossmintListener = null;
      }
      if (this.detailCrossmintPolicyListener) {
        const pidx = this.store.crossmintPolicyListeners.indexOf(this.detailCrossmintPolicyListener);
        if (pidx >= 0) this.store.crossmintPolicyListeners.splice(pidx, 1);
        this.detailCrossmintPolicyListener = null;
      }
      if (this.detailCrossmintTxHistoryListener) {
        const tidx = this.store.crossmintTxHistoryListeners.indexOf(this.detailCrossmintTxHistoryListener);
        if (tidx >= 0) this.store.crossmintTxHistoryListeners.splice(tidx, 1);
        this.detailCrossmintTxHistoryListener = null;
      }
      if (this.detailCrossmintFundListener) {
        const fidx = this.store.crossmintFundListeners.indexOf(this.detailCrossmintFundListener);
        if (fidx >= 0) this.store.crossmintFundListeners.splice(fidx, 1);
        this.detailCrossmintFundListener = null;
      }
      if (this.detailCrossmintOnrampListener) {
        const oidx = this.store.crossmintOnrampListeners.indexOf(this.detailCrossmintOnrampListener);
        if (oidx >= 0) this.store.crossmintOnrampListeners.splice(oidx, 1);
        this.detailCrossmintOnrampListener = null;
      }
      this.crossmintDetailAgentId = agent.id;
    if (agent.crossmintWallet) {
      crossmintSection.hidden = false;
      crossmintSection.innerHTML = `
        <div class="wallet-card">
          <div class="wallet-title crossmint">⚡ MULTICHAIN WALLET (CROSSMINT)</div>
          <div id="d-crossmint-content" class="wallet-content">Loading wallet...</div>
          <button id="d-crossmint-refresh" class="wallet-btn-sm">↻ Refresh</button>
          <button id="d-crossmint-fund" class="wallet-btn-sm" style="margin-left:0.3rem; border-color:var(--green); color:var(--green);">⛽ Fund (USDXM)</button>
          <button id="d-crossmint-buy" class="wallet-btn-sm" style="margin-left:0.3rem; border-color:var(--amber); color:var(--amber);">Buy Crypto</button>
        </div>
        <div id="d-crossmint-policy" class="wallet-subsection">
          <div class="wallet-subsection-title">⚙ WALLET POLICY</div>
          <div id="d-crossmint-policy-content" class="wallet-content">Loading policy...</div>
        </div>
        <div id="d-crossmint-txhistory" class="wallet-subsection">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
            <div class="wallet-subsection-title" style="margin-bottom:0;">📜 TRANSACTION HISTORY</div>
            <button id="d-crossmint-tx-refresh" class="wallet-btn-sm" style="margin-top:0; padding:0.2rem 0.4rem; font-size:0.6rem;">↻</button>
          </div>
          <div id="d-crossmint-tx-content" class="wallet-content">Loading transactions...</div>
        </div>
      `;
      const xmRefreshBtn = crossmintSection.querySelector("#d-crossmint-refresh") as HTMLButtonElement | null;
      if (xmRefreshBtn) {
        xmRefreshBtn.addEventListener("click", () => {
          this.net.send({ type: "get_crossmint_wallet", agentId: agent.id });
          xmRefreshBtn.textContent = "Loading...";
          setTimeout(() => { xmRefreshBtn.textContent = "↻ Refresh"; }, 2000);
        });
      }
      this.net.send({ type: "get_crossmint_wallet", agentId: agent.id });
      this.detailCrossmintListener = (msg: { agentId: string; address: string | null; chain: string | null; balances: { symbol: string; amount: string; usdValue?: string }[] | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const content = crossmintSection.querySelector("#d-crossmint-content") as HTMLElement | null;
        if (!content) return;
        if (msg.error) {
          content.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        if (!msg.address) {
          content.innerHTML = `<span class="wallet-error">⚠ Wallet not available</span>`;
          return;
        }
        const balancesHtml = msg.balances && msg.balances.length > 0
          ? msg.balances.map((b: { symbol: string; amount: string; usdValue?: string }) => {
              const usd = b.usdValue ? ` <span class="wallet-label">($${esc(b.usdValue)})</span>` : "";
              return `<div style="margin-top:0.2rem;">${esc(b.symbol)}: ${esc(b.amount)}${usd}</div>`;
            }).join("")
          : `<div class="wallet-label" style="margin-top:0.2rem;">No balances — wallet may need funding</div>`;
        const chain = msg.chain ?? "unknown";
        const explorerBase = chain.includes("solana")
          ? `https://explorer.solana.com/address/${esc(msg.address)}`
          : `https://sepolia.basescan.org/address/${esc(msg.address)}`;
        content.innerHTML = `
          <div class="wallet-addr">
            ${esc(msg.address)}
            <button id="d-crossmint-copy" class="wallet-copy-btn" style="margin-left:0.3rem; font-size:0.6rem;">copy</button>
            <button id="d-crossmint-qr" class="wallet-copy-btn" style="margin-left:0.2rem; font-size:0.6rem;" title="Show QR code">⊞</button>
          </div>
          <div id="d-crossmint-qr-box" style="display:none; margin-top:0.4rem; padding:0.5rem; background:#fff; border-radius:0.3rem; width:fit-content;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(msg.address)}" alt="Wallet QR" style="display:block; width:120px; height:120px;" />
          </div>
          <div class="wallet-label" style="margin-top:0.2rem;">Chain: ${esc(chain)} · Gas sponsored</div>
          <div style="margin-top:0.3rem;">
            <a href="${explorerBase}" target="_blank" class="wallet-link">View on Explorer →</a>
          </div>
          <div class="wallet-divider">
            <div class="wallet-label" style="margin-bottom:0.2rem;">Balances:</div>
            ${balancesHtml}
          </div>
        `;
        const copyBtn = content.querySelector("#d-crossmint-copy") as HTMLButtonElement | null;
        if (copyBtn) {
          copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(msg.address!);
            copyBtn.textContent = "✓";
            setTimeout(() => { copyBtn.textContent = "copy"; }, 1500);
          });
        }
        const qrBtn = content.querySelector("#d-crossmint-qr") as HTMLButtonElement | null;
        const qrBox = content.querySelector("#d-crossmint-qr-box") as HTMLElement | null;
        if (qrBtn && qrBox) {
          qrBtn.addEventListener("click", () => {
            const visible = qrBox.style.display !== "none";
            qrBox.style.display = visible ? "none" : "block";
            qrBtn.textContent = visible ? "⊞" : "⊟";
          });
        }
      };
      this.store.crossmintWalletListeners.push(this.detailCrossmintListener);

      this.net.send({ type: "get_crossmint_policy", agentId: agent.id });
      this.detailCrossmintPolicyListener = (msg: { agentId: string; chain: string | null; spendingLimitUsd: number | null; allowedRecipients: string[] | null; blockedRecipients: string[] | null; description: string | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const pcontent = crossmintSection.querySelector("#d-crossmint-policy-content") as HTMLElement | null;
        if (!pcontent) return;
        if (msg.error) {
          pcontent.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        const chain = msg.chain ?? "unknown";
        const limit = msg.spendingLimitUsd ? `$${msg.spendingLimitUsd}` : "none (unlimited)";
        const allowed = msg.allowedRecipients?.length ? msg.allowedRecipients.join(", ") : "any";
        const blocked = msg.blockedRecipients?.length ? msg.blockedRecipients.join(", ") : "none";
        const desc = msg.description ?? "";
        pcontent.innerHTML = `
          <div class="wallet-label" style="margin-bottom:0.2rem;">${esc(desc)}</div>
          <div style="margin-bottom:0.2rem;"><span class="wallet-label">Chain:</span> <span class="wallet-value">${esc(chain)}</span></div>
          <div style="margin-bottom:0.2rem;"><span class="wallet-label">Spending limit:</span> <span class="wallet-value">${esc(limit)}</span></div>
          <div style="margin-bottom:0.2rem;"><span class="wallet-label">Allowed recipients:</span> <span class="wallet-value">${esc(allowed)}</span></div>
          <div style="margin-bottom:0.2rem;"><span class="wallet-label">Blocked recipients:</span> <span class="wallet-value">${esc(blocked)}</span></div>
          <div class="wallet-success" style="margin-top:0.3rem; font-size:0.6rem;">⛽ Gas sponsored by Crossmint paymaster</div>
        `;
      };
      this.store.crossmintPolicyListeners.push(this.detailCrossmintPolicyListener);

      this.net.send({ type: "get_crossmint_tx_history", agentId: agent.id });
      const xmTxRefreshBtn = crossmintSection.querySelector("#d-crossmint-tx-refresh") as HTMLButtonElement | null;
      if (xmTxRefreshBtn) {
        xmTxRefreshBtn.addEventListener("click", () => {
          this.net.send({ type: "get_crossmint_tx_history", agentId: agent.id });
          xmTxRefreshBtn.textContent = "...";
          setTimeout(() => { xmTxRefreshBtn.textContent = "↻"; }, 2000);
        });
      }
      this.detailCrossmintTxHistoryListener = (msg: { agentId: string; transactions: any[] | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        const txContent = crossmintSection.querySelector("#d-crossmint-tx-content") as HTMLElement | null;
        if (!txContent) return;
        if (msg.error) {
          txContent.innerHTML = `<span class="wallet-error">⚠ ${esc(msg.error)}</span>`;
          return;
        }
        if (!msg.transactions || msg.transactions.length === 0) {
          txContent.innerHTML = `<span class="wallet-label">No transactions yet — this wallet may be new</span>`;
          return;
        }
        txContent.innerHTML = msg.transactions.slice(0, 10).map((tx: any) => {
          const id = tx.id ?? tx.txId ?? "unknown";
          const status = tx.status ?? "unknown";
          const statusColor = status === "confirmed" || status === "success" ? "var(--green)" : status === "failed" ? "var(--red)" : "var(--dim)";
          const shortId = id.length > 16 ? id.slice(0, 12) + "..." + id.slice(-4) : id;
          const hash = tx.transactionHash ?? tx.hash ?? "";
          const amount = tx.amount ?? "";
          const token = tx.token ?? tx.symbol ?? "";
          return `<div style="margin-top:0.2rem; display:flex; gap:0.3rem; align-items:center;">` +
            `<span style="color:${statusColor}; font-size:0.6rem; font-weight:600;">${esc(status)}</span>` +
            `<span class="wallet-value" style="font-family:var(--font-mono); font-size:0.6rem;">${esc(shortId)}</span>` +
            (amount ? `<span class="wallet-label" style="font-size:0.6rem;">${esc(amount)} ${esc(token)}</span>` : "") +
            (hash ? `<a href="https://explorer.solana.com/tx/${esc(hash)}" target="_blank" class="wallet-link">↗</a>` : "") +
            `</div>`;
        }).join("");
      };
      this.store.crossmintTxHistoryListeners.push(this.detailCrossmintTxHistoryListener);

      // Fund (staging faucet) button
      const xmFundBtn = crossmintSection.querySelector("#d-crossmint-fund") as HTMLButtonElement | null;
      if (xmFundBtn) {
        xmFundBtn.addEventListener("click", () => {
          this.net.send({ type: "fund_crossmint_wallet", agentId: agent.id, amount: 10 });
          xmFundBtn.textContent = "Funding...";
          xmFundBtn.disabled = true;
        });
      }
      this.detailCrossmintFundListener = (msg: { agentId: string; success: boolean; message: string }) => {
        if (msg.agentId !== agent.id) return;
        if (xmFundBtn) {
          xmFundBtn.textContent = "⛽ Fund (USDXM)";
          xmFundBtn.disabled = false;
        }
        this.store.toast(msg.success ? `✓ ${msg.message}` : `⚠ ${msg.message}`);
      };
      this.store.crossmintFundListeners.push(this.detailCrossmintFundListener);

      // Onramp (card purchase) button
      const xmBuyBtn = crossmintSection.querySelector("#d-crossmint-buy") as HTMLButtonElement | null;
      if (xmBuyBtn) {
        xmBuyBtn.addEventListener("click", () => {
          this.net.send({ type: "create_crossmint_onramp", agentId: agent.id });
          xmBuyBtn.textContent = "Loading...";
          xmBuyBtn.disabled = true;
        });
      }
      this.detailCrossmintOnrampListener = (msg: { agentId: string; url: string | null; error?: string }) => {
        if (msg.agentId !== agent.id) return;
        if (xmBuyBtn) {
          xmBuyBtn.textContent = "Buy Crypto";
          xmBuyBtn.disabled = false;
        }
        if (msg.error || !msg.url) {
          this.store.toast(`Onramp error: ${msg.error ?? "Could not create order"}`);
          return;
        }
        window.open(msg.url, "_blank", "noopener,noreferrer");
      };
      this.store.crossmintOnrampListeners.push(this.detailCrossmintOnrampListener);
    } else {
      crossmintSection.hidden = true;
      crossmintSection.innerHTML = "";
    }
    } // end crossmintNeedsInit

    const logs = this.store.logs.get(agent.id) ?? [];
    const logsEl = document.getElementById("logs")!;
    const logHtml = (l: LogEntry) => {
      const html = renderEntry(l);
      const isLong = l.text.length > 200;
      return `<div class="log ${l.kind}${isLong ? " collapsible" : ""}">${html}</div>`;
    };
    // append-only fast path; rebuild when switching agents, after a clear, or
    // when the 500-entry cap shifted the window (tail no longer matches)
    const shifted =
      this.lastLogCount > 0 && logs[this.lastLogCount - 1] !== this.lastLogTail;
    if (this.lastSelected !== agent.id || logs.length < this.lastLogCount || shifted) {
      logsEl.innerHTML = logs.map(logHtml).join("");
      logsEl.scrollTop = logsEl.scrollHeight;
    } else if (logs.length > this.lastLogCount) {
      const stick = logsEl.scrollHeight - logsEl.scrollTop - logsEl.clientHeight < 30;
      logsEl.insertAdjacentHTML("beforeend", logs.slice(this.lastLogCount).map(logHtml).join(""));
      if (stick) logsEl.scrollTop = logsEl.scrollHeight;
    }
    const agentChanged = this.lastSelected !== agent.id;
    this.lastSelected = agent.id;
    this.lastLogCount = logs.length;
    this.lastLogTail = logs.length ? logs[logs.length - 1] : null;

    // Disable chat input when agent is busy or user lacks talk access
    const chatInput = document.getElementById("d-chat") as HTMLInputElement | null;
    const sayBtn = document.getElementById("d-say") as HTMLButtonElement | null;
    const isBusy = agent.status === "thinking" || agent.status === "working";
    const canTalk = this.store.accessLevel === "talk" || this.store.accessLevel === "manage";
    // Check ACL restrictions for non-manage users
    const acl = agent.acl;
    const aclRestricted = acl && this.store.accessLevel !== "manage" &&
      (acl.allowedUserIds !== undefined || acl.allowedRoles !== undefined);
    if (chatInput) {
      chatInput.disabled = isBusy || !canTalk || !!aclRestricted;
      chatInput.placeholder = !canTalk ? "Tour mode — no chat access" : aclRestricted ? "Access restricted — ask manager for permission" : isBusy ? `${agent.name} is busy…` : "Say something… (chat, not a task)";
    }
    if (sayBtn) sayBtn.disabled = isBusy || !canTalk || !!aclRestricted;

    if (!this._scheduleEditingId && !this._scheduleCreateOpen) {
      const sig = [...this.store.schedules.values()]
        .filter((s) => s.agentId === agent.id)
        .map((s) => `${s.id}:${s.enabled}:${s.nextRunAt}:${s.lastRunAt}:${s.runCount}:${s.name}:${s.task}:${s.cronExpression}:${s.handoffTo}`)
        .join("|");
      if (agentChanged || sig !== this.lastSchedulesSig) {
        this.lastSchedulesSig = sig;
        this.renderSchedules(agent.id);
      }
    }
  }

  private openConversationModal(agentId: string, agentName: string, accent: string): void {
    const existing = document.getElementById("conv-history-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "conv-history-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;";

    overlay.innerHTML = `
      <div class="conv-modal">
        <div class="conv-header">
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span class="conv-name" style="color:${accent};">${esc(agentName)}</span>
            <span class="conv-subtitle">Conversation History</span>
          </div>
          <button id="conv-close" class="conv-close">✕</button>
        </div>
        <div class="conv-tabs">
          <button class="conv-tab active" data-tab="activity" style="border-bottom-color:${accent};color:${accent};display:flex;align-items:center;gap:0.35rem;">${ICON.history} Activity Log</button>
          <button class="conv-tab" data-tab="memory" style="display:flex;align-items:center;gap:0.35rem;">${ICON.brain} LLM Memory</button>
        </div>
        <div id="conv-content" class="conv-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const cleanups: (() => void)[] = [];
    const closeWithCleanup = () => { cleanups.forEach(fn => fn()); close(); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeWithCleanup(); });
    document.getElementById("conv-close")!.addEventListener("click", closeWithCleanup);

    const contentEl = document.getElementById("conv-content")!;
    const tabBtns = overlay.querySelectorAll<HTMLButtonElement>(".conv-tab");

    // ── Activity Log tab ──
    const renderActivityLog = () => {
      const logs = this.store.logs.get(agentId) ?? [];
      if (logs.length === 0) {
        contentEl.innerHTML = `<div class="conv-empty">No activity logged yet.</div>`;
        return;
      }
      const kindColors: Record<string, string> = {
        status: "var(--dim)",
        text: "var(--green)",
        tool: "var(--amber)",
        result: "var(--accent)",
        error: "var(--red)",
        boss: "var(--accent)",
      };
      const kindLabels: Record<string, string> = {
        status: "STATUS",
        text: "TEXT",
        tool: "TOOL",
        result: "RESULT",
        error: "ERROR",
        boss: "BOSS",
      };
      contentEl.innerHTML = logs.map(l => {
        const color = kindColors[l.kind] ?? "var(--dim)";
        const label = kindLabels[l.kind] ?? l.kind.toUpperCase();
        const time = new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const html = renderEntry(l);
        return `<div class="conv-entry" style="display:flex;gap:0.6rem;padding:0.4rem 0;border-bottom:1px solid var(--panel-edge-soft);">
          <span class="conv-entry-time" style="min-width:3.5rem;flex-shrink:0;padding-top:0.1rem;">${time}</span>
          <span class="conv-entry-label" style="color:${color};min-width:3rem;flex-shrink:0;padding-top:0.15rem;">${label}</span>
          <span style="font-size:0.78rem;line-height:1.4;word-break:break-word;flex:1;">${html}</span>
        </div>`;
      }).join("");
      contentEl.scrollTop = contentEl.scrollHeight;
    };

    // ── LLM Memory tab ──
    const renderMemoryTab = () => {
      contentEl.innerHTML = `
        <div class="conv-empty" style="text-align:left;">
          <div id="conv-mem-loading">Loading conversation memory…</div>
          <div id="conv-mem-list"></div>
        </div>
      `;
      this.net.send({ type: "agent_memory_request", agentId });

      const onMemory = (respAgentId: string, messages: { role: string; content: string }[]) => {
        if (respAgentId !== agentId) return;
        const loadingEl = document.getElementById("conv-mem-loading");
        if (loadingEl) loadingEl.style.display = "none";
        const listEl = document.getElementById("conv-mem-list");
        if (!listEl) return;

        if (messages.length === 0) {
          listEl.innerHTML = `<div class="conv-empty" style="padding:1rem;">No conversation history. The agent hasn't been given any tasks yet.</div>`;
          return;
        }

        const roleColors: Record<string, string> = {
          system: "var(--dim)",
          user: "var(--accent)",
          assistant: "var(--green)",
          tool: "var(--amber)",
          unknown: "var(--dim)",
        };
        const roleLabels: Record<string, string> = {
          system: "SYSTEM",
          user: "USER",
          assistant: "ASSISTANT",
          tool: "TOOL",
          unknown: "???",
        };

        listEl.innerHTML = `<div class="wallet-label" style="font-size:0.7rem;margin-bottom:0.5rem;">${messages.length} messages</div>` + messages.map(m => {
          const color = roleColors[m.role] ?? "var(--dim)";
          const label = roleLabels[m.role] ?? m.role.toUpperCase();
          const isLong = m.content.length > 800;
          const displayContent = isLong ? m.content.slice(0, 800) + "…" : m.content;
          return `<div style="background:var(--panel-soft);border-left:3px solid ${color};padding:0.5rem 0.75rem;border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin-bottom:0.4rem;">
            <div style="color:${color};font-size:0.6rem;font-weight:700;margin-bottom:0.25rem;">${label}</div>
            <div style="color:var(--text);font-size:0.75rem;line-height:1.4;white-space:pre-wrap;word-break:break-word;">${esc(displayContent)}</div>
          </div>`;
        }).join("");
      };

      this.store.onAgentMemory(onMemory);
      cleanups.push(() => this.store.offAgentMemory(onMemory));
    };

    // ── Tab switching ──
    tabBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        tabBtns.forEach(b => {
          const isActive = b === btn;
          b.classList.toggle("active", isActive);
          if (isActive) {
            b.style.borderBottomColor = accent;
            b.style.color = accent;
          } else {
            b.style.borderBottomColor = "transparent";
            b.style.color = "var(--dim)";
          }
        });
        const tab = btn.dataset.tab;
        if (tab === "activity") renderActivityLog();
        else if (tab === "memory") renderMemoryTab();
      });
    });

    // Render initial tab
    renderActivityLog();
  }

  private renderSchedules(agentId: string): void {
    const container = document.getElementById("d-schedules")!;

    const agentSchedules = [...this.store.schedules.values()].filter((s) => s.agentId === agentId);

    container.hidden = false;

    const fmtRel = (ts: number | null): string => {
      if (!ts) return "never";
      const diff = Date.now() - ts;
      if (diff < 60_000) return "just now";
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return `${Math.floor(diff / 86_400_000)}d ago`;
    };

    const fmtNext = (ts: number): string => {
      const diff = ts - Date.now();
      if (diff < 0) return "now";
      if (diff < 60_000) return "in <1m";
      if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
      if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;
      return `in ${Math.floor(diff / 86_400_000)}d`;
    };

    const others = [...this.store.agents.values()].filter((a) => a.id !== agentId);
    const handoffOpts = (sel?: string | null) =>
      `<option value="">— nobody —</option>` +
      others.map((a) => `<option value="${a.id}"${a.id === sel ? " selected" : ""}>${esc(a.name)}</option>`).join("");

    const presetOpts = (sel?: string) =>
      SCHEDULE_PRESETS.map((p) => `<option value="${p.cron}"${p.cron === sel ? " selected" : ""}>${esc(p.label)}</option>`).join("");

    const cronToLabel = (cron: string): string => {
      const preset = SCHEDULE_PRESETS.find((p) => p.cron === cron);
      if (preset) return preset.label;
      return cron;
    };

    let html = `<div class="sched-header">⏰ SCHEDULED TASKS</div>`;

    for (const s of agentSchedules) {
      html += `
        <div class="sched-item${s.enabled ? "" : " disabled"}" data-id="${s.id}">
          <div class="sched-item-top">
            <label class="sched-toggle">
              <input type="checkbox" data-sched-toggle="${s.id}" ${s.enabled ? "checked" : ""} />
              <span class="sched-name">${esc(s.name)}</span>
              <span class="sched-enabled-label">${s.enabled ? "ON" : "OFF"}</span>
            </label>
            <div class="sched-item-actions">
              <button class="btn sched-edit" data-sched-edit="${s.id}" title="Edit">✎</button>
              <button class="btn danger sched-del" data-sched-del="${s.id}" title="Delete">✕</button>
            </div>
          </div>
          <div class="sched-task">${esc(s.task.slice(0, 120))}${s.task.length > 120 ? "…" : ""}</div>
          <div class="sched-meta">
            <span class="sched-cron">${esc(cronToLabel(s.cronExpression))}</span>
            · run #${s.runCount} · last: ${fmtRel(s.lastRunAt)}
            · ${s.enabled ? `next: <span data-next-run="${s.nextRunAt}">${fmtNext(s.nextRunAt)}</span>` : `<span class="sched-paused">paused</span>`}
            ${s.handoffTo ? ` · → ${esc(this.store.agents.get(s.handoffTo)?.name ?? "?")}` : ""}
          </div>
        </div>`;
    }

    if (this._scheduleCreateOpen) {
      html += `
        <div class="sched-form">
          <input class="sched-input" id="sched-name" placeholder="Schedule name (e.g. Daily Standup)" maxlength="100" />
          <textarea class="sched-input" id="sched-task" rows="2" placeholder="Task prompt…" maxlength="4000"></textarea>
          <div class="sched-form-row">
            <select id="sched-preset"><option value="">Select frequency…</option>${presetOpts()}</select>
            <select id="sched-handoff">${handoffOpts()}</select>
          </div>
          <input class="sched-input" id="sched-cron" placeholder="Custom cron expression" value="0 9 * * *" style="display:none" />
          <div class="sched-form-row">
            <button class="btn primary" id="sched-create">CREATE</button>
            <button class="btn" id="sched-cancel">CANCEL</button>
          </div>
        </div>`;
    } else {
      html += `<button class="btn sched-add" id="sched-add">+ NEW SCHEDULE</button>`;
    }

    container.innerHTML = html;
    this.updateScheduleCountdowns();

    // Wire up controls
    const addBtn = container.querySelector("#sched-add") as HTMLButtonElement | null;
    if (addBtn) addBtn.addEventListener("click", () => {
      this._scheduleCreateOpen = true;
      this._scheduleEditingId = null;
      this.renderSchedules(agentId);
    });

    const cancelBtn = container.querySelector("#sched-cancel") as HTMLButtonElement | null;
    if (cancelBtn) cancelBtn.addEventListener("click", () => {
      this._scheduleCreateOpen = false;
      this.renderSchedules(agentId);
    });


    const createBtn = container.querySelector("#sched-create") as HTMLButtonElement | null;
    if (createBtn) createBtn.addEventListener("click", () => {
      const name = (container.querySelector("#sched-name") as HTMLInputElement).value;
      const task = (container.querySelector("#sched-task") as HTMLTextAreaElement).value;
      const presetSel = container.querySelector("#sched-preset") as HTMLSelectElement;
      const cronInput = container.querySelector("#sched-cron") as HTMLInputElement;
      const cron = presetSel.value === "__custom__" ? cronInput.value : presetSel.value;
      const handoff = (container.querySelector("#sched-handoff") as HTMLSelectElement).value;
      if (!name.trim() || !task.trim() || !cron.trim()) return;
      this.net.send({ type: "create_schedule", agentId, name, task, cronExpression: cron, handoffTo: handoff || undefined });
      this._scheduleCreateOpen = false;
      this._scheduleEditingId = null;
      this.renderSchedules(agentId);
    });

    // Preset -> show/hide custom cron input
    const presetSel = container.querySelector("#sched-preset") as HTMLSelectElement | null;
    const cronInput = container.querySelector("#sched-cron") as HTMLInputElement | null;
    if (presetSel && cronInput) {
      presetSel.addEventListener("change", () => {
        if (presetSel.value === "__custom__") {
          cronInput.style.display = "block";
          cronInput.focus();
        } else {
          cronInput.style.display = "none";
        }
      });
    }

    // Toggle handlers
    container.querySelectorAll<HTMLInputElement>("[data-sched-toggle]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.schedToggle!;
        this.net.send({ type: "update_schedule", scheduleId: id, enabled: cb.checked });
      });
    });

    // Delete handlers
    container.querySelectorAll<HTMLButtonElement>("[data-sched-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.schedDel!;
        this.net.send({ type: "delete_schedule", scheduleId: id });
      });
    });

    // Edit handlers (inline toggle of name/task/cron)
    container.querySelectorAll<HTMLButtonElement>("[data-sched-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.schedEdit!;
        const sched = this.store.schedules.get(id);
        if (!sched) return;
        const item = container.querySelector(`.sched-item[data-id="${id}"]`) as HTMLElement | null;
        if (!item) return;
        item.innerHTML = `
          <div class="sched-form">
            <input class="sched-input" id="sched-edit-name" value="${esc(sched.name)}" maxlength="100" />
            <textarea class="sched-input" id="sched-edit-task" rows="2" maxlength="4000">${esc(sched.task)}</textarea>
            <div class="sched-form-row">
              <select id="sched-edit-preset"><option value="">Select frequency…</option>${presetOpts(SCHEDULE_PRESETS.some((p) => p.cron === sched.cronExpression) ? sched.cronExpression : "__custom__")}</select>
              <button class="btn primary" id="sched-edit-save" data-id="${id}">SAVE</button>
              <button class="btn" id="sched-edit-cancel">CANCEL</button>
            </div>
            <input class="sched-input" id="sched-edit-cron" value="${esc(sched.cronExpression)}" placeholder="Custom cron expression" style="display:${SCHEDULE_PRESETS.some((p) => p.cron === sched.cronExpression) ? "none" : "block"}" />
          </div>`;
        this._scheduleEditingId = id;
        const nameInput = item.querySelector("#sched-edit-name") as HTMLInputElement | null;
        if (nameInput) nameInput.focus();
        const editPresetSel = item.querySelector("#sched-edit-preset") as HTMLSelectElement;
        const editCronInput = item.querySelector("#sched-edit-cron") as HTMLInputElement;
        if (editPresetSel && editCronInput) {
          editPresetSel.addEventListener("change", () => {
            if (editPresetSel.value === "__custom__") {
              editCronInput.style.display = "block";
              editCronInput.focus();
            } else {
              editCronInput.style.display = "none";
            }
          });
        }
        const saveBtn = item.querySelector("#sched-edit-save") as HTMLButtonElement;
        saveBtn.addEventListener("click", () => {
          const name = (item.querySelector("#sched-edit-name") as HTMLInputElement).value;
          const task = (item.querySelector("#sched-edit-task") as HTMLTextAreaElement).value;
          const cron = editPresetSel.value === "__custom__" ? editCronInput.value : editPresetSel.value;
          this.net.send({ type: "update_schedule", scheduleId: id, name, task, cronExpression: cron });
          this._scheduleEditingId = null;
          this.renderSchedules(agentId);
        });
        const cancelBtn = item.querySelector("#sched-edit-cancel") as HTMLButtonElement;
        cancelBtn.addEventListener("click", () => {
          this._scheduleEditingId = null;
          this.renderSchedules(agentId);
        });
      });
    });
  }

  private renderFeed(): void {
    const feed = this.store.feed;
    const el = document.getElementById("feed-logs")!;
    const itemHtml = (f: FeedItem) =>
      `<div class="log ${f.entry.kind}"><b style="color:${f.accent}">${esc(f.name)}</b> ${renderEntry(
        f.entry,
      )}</div>`;
    const stick = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    if (this.lastFeedVersion !== this.store.feedVersion) {
      // snapshot or chat-clear restructured the list — start over
      this.lastFeedVersion = this.store.feedVersion;
      el.innerHTML = feed.map(itemHtml).join("");
    } else {
      const fresh: FeedItem[] = [];
      for (let i = feed.length - 1; i >= 0 && feed[i].seq > this.lastFeedSeq; i--) {
        fresh.unshift(feed[i]);
      }
      if (fresh.length === 0) return;
      el.insertAdjacentHTML("beforeend", fresh.map(itemHtml).join(""));
      // the store caps the feed; drop the same overflow from the front of the DOM
      while (el.childElementCount > feed.length) el.firstElementChild!.remove();
    }
    this.lastFeedSeq = feed.length ? feed[feed.length - 1].seq : -1;
    if (stick) el.scrollTop = el.scrollHeight;
  }

  private renderBoard(): void {
    const panel = document.getElementById("board-panel")!;
    panel.hidden = !this.store.boardOpen;
    if (!this.store.boardOpen) return;

    const cards = [...this.store.board.values()].sort((a, b) => a.createdAt - b.createdAt);
    const agents = [...this.store.agents.values()];

    // signature: board open state + card data + agent roster (for dropdowns)
    const sig =
      this.store.boardOpen + "|" +
      cards.map((c) => c.id + c.status + c.assignedAgentId + c.title + (c.type ?? "") + (c.progress ?? 0)).join(",") + "|" +
      agents.map((a) => a.id + a.name + a.status).join(",");
    if (sig === this.lastBoardSig) return;
    this.lastBoardSig = sig;

    const cols: Record<CardStatus, TaskCard[]> = { backlog: [], in_progress: [], review_pending: [], done: [], paused: [] };
    for (const c of cards) cols[c.status].push(c);

    const colLabels: Record<CardStatus, string> = {
      backlog: "BACKLOG",
      in_progress: "IN PROGRESS",
      review_pending: "REVIEW",
      done: "DONE",
      paused: "PAUSED",
    };

    const agentName = (id: string | null) => {
      if (!id) return null;
      const a = this.store.agents.get(id);
      return a ? a.name : null;
    };

    const cardHtml = (c: TaskCard): string => {
      const assigned = agentName(c.assignedAgentId);
      const agent = c.assignedAgentId ? this.store.agents.get(c.assignedAgentId) : null;
      const statusDot = agent ? ` <span class="dot ${agent.status}"></span>` : "";
      const assignee = assigned
        ? `<span class="card-assignee" style="color:${agent?.accent ?? "#9aa0b0"}">${esc(assigned)}${statusDot}</span>`
        : `<span class="card-unassigned">unassigned</span>`;

      const agentOptions =
        `<option value="">— assign —</option>` +
        agents
          .filter((a) => a.role !== "manager")
          .map((a) => `<option value="${a.id}" ${c.assignedAgentId === a.id ? "selected" : ""}>${esc(a.name)}</option>`)
          .join("");

      const moveBtns = c.status === "done"
        ? `<button class="btn mini" data-move="${c.id}" data-status="backlog">↩ BACKLOG</button>`
        : c.status === "in_progress"
          ? `<button class="btn mini" data-move="${c.id}" data-status="review_pending">🔍 REVIEW</button>`
          : c.status === "review_pending"
            ? `<button class="btn mini" data-move="${c.id}" data-status="done">✓ DONE</button><button class="btn mini" data-move="${c.id}" data-status="in_progress">↩ REWORK</button>`
        : c.status === "paused"
          ? `<button class="btn mini" data-move="${c.id}" data-status="backlog">▶ RESUME</button>`
          : "";

      const typeIcon: Record<string, string> = { task: "📋", chat: "💬", review: "🔍", goal: "🎯" };
      const typeBadge = c.type ? `<span class="card-type-badge">${typeIcon[c.type] ?? "📋"}</span>` : "";
      const catColors: Record<string, string> = { frontend: "#61dafb", backend: "#68a063", devops: "#326ce5", data: "#ff6b6b", writing: "#f9ca24", research: "#a78bfa", crypto: "#f7931a", general: "#9aa0b0" };
      const catBadge = c.category ? `<span class="card-cat-badge" style="color:${catColors[c.category] ?? "#9aa0b0"}">${esc(c.category)}</span>` : "";
      const progressBar = (c.type === "goal" && c.progress != null && c.progress > 0)
        ? `<div class="card-progress-bar"><div class="card-progress-fill" style="width:${c.progress}%"></div></div>`
        : "";

      return `
        <div class="board-card" data-card-id="${c.id}">
          <div class="card-title">${typeBadge} ${esc(c.title)} ${catBadge}</div>
          ${c.description ? `<div class="card-desc">${esc(c.description)}</div>` : ""}
          ${progressBar}
          <div class="card-footer">
            ${assignee}
            <select class="card-assign-select" data-assign="${c.id}">${agentOptions}</select>
          </div>
          <div class="card-actions">
            ${moveBtns}
            <button class="btn mini danger" data-delete="${c.id}">🗑</button>
          </div>
        </div>`;
    };

    const colHtml = (status: CardStatus) => `
      <div class="board-col col-${status}">
        <div class="board-col-header">${colLabels[status]} <span class="board-col-count">${cols[status].length}</span></div>
        <div class="board-col-cards">
          ${cols[status].map(cardHtml).join("") || `<div class="board-empty">no cards</div>`}
        </div>
      </div>`;

    document.getElementById("board-columns")!.innerHTML =
      (["backlog", "in_progress", "review_pending", "done", "paused"] as CardStatus[]).map(colHtml).join("");

    // wire up card interactions
    document.querySelectorAll<HTMLElement>("[data-assign]").forEach((el) => {
      el.addEventListener("change", () => {
        const cardId = el.dataset.assign!;
        const agentId = (el as HTMLSelectElement).value;
        if (agentId) this.net.send({ type: "assign_card", cardId, agentId });
      });
    });
    document.querySelectorAll<HTMLElement>("[data-move]").forEach((el) => {
      el.addEventListener("click", () => {
        this.net.send({ type: "move_card", cardId: el.dataset.move!, status: el.dataset.status as CardStatus });
      });
    });
    document.querySelectorAll<HTMLElement>("[data-delete]").forEach((el) => {
      el.addEventListener("click", () => {
        this.net.send({ type: "delete_card", cardId: el.dataset.delete! });
      });
    });
  }

  private bindGantt(): void {
    document.getElementById("gantt-close")!.addEventListener("click", () => this.store.toggleGantt(false));
  }

  private lastGanttSig = "";

  private renderGantt(): void {
    const panel = document.getElementById("gantt-panel")!;
    panel.hidden = !this.store.ganttOpen;
    if (!this.store.ganttOpen) return;

    const cards = [...this.store.board.values()].sort((a, b) => a.createdAt - b.createdAt);
    const agents = [...this.store.agents.values()].filter(
      (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
    );
    const deps = this.store.cardDependencies;

    // signature for change detection
    const sig =
      this.store.ganttOpen + "|" +
      cards.map((c) => c.id + c.status + c.phase + c.assignedAgentId + c.startedAt + c.dueDate + c.estimatedMinutes + c.parentGoalId).join(",") + "|" +
      agents.map((a) => a.id + a.name + a.status).join(",") + "|" +
      deps.map((d) => d.from + d.to + d.type).join(",");
    if (sig === this.lastGanttSig) return;
    this.lastGanttSig = sig;

    const now = Date.now();
    // Time range: from earliest startedAt (or now) to latest dueDate (or now + 24h)
    let minTime = now;
    let maxTime = now + 24 * 60 * 60 * 1000; // default 24h ahead
    for (const c of cards) {
      if (c.startedAt) minTime = Math.min(minTime, c.startedAt);
      if (c.dueDate) maxTime = Math.max(maxTime, c.dueDate);
      if (c.startedAt && c.estimatedMinutes) {
        maxTime = Math.max(maxTime, c.startedAt + c.estimatedMinutes * 60 * 1000);
      }
    }
    const span = Math.max(maxTime - minTime, 60 * 60 * 1000); // min 1h span
    const PX_PER_MS = 0.08; // ~288px per hour
    const timelineWidth = Math.max(span * PX_PER_MS, 600);

    // Time axis labels (hourly)
    const hourStep = span < 6 * 60 * 60 * 1000 ? 1 : span < 24 * 60 * 60 * 1000 ? 2 : 6;
    const timeMarks: string[] = [];
    for (let t = Math.floor(minTime / (hourStep * 60 * 60 * 1000)) * (hourStep * 60 * 60 * 1000); t <= maxTime; t += hourStep * 60 * 60 * 1000) {
      const d = new Date(t);
      const label = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
      const x = ((t - minTime) / span) * timelineWidth;
      timeMarks.push(`<div class="gantt-time-mark" style="left:${x}px">${label}</div>`);
    }

    // Build a set of card IDs on the critical path (from office state graph, approximated by longest dependency chain)
    const criticalPath = new Set<string>();
    const visited = new Set<string>();
    const findLongestChain = (cardId: string, chain: string[]): void => {
      if (visited.has(cardId)) return;
      visited.add(cardId);
      const currentChain = [...chain, cardId];
      // Check if any card depends on this one
      const dependents = deps.filter((d) => d.from === cardId && d.type === "depends_on");
      if (dependents.length === 0) {
        if (currentChain.length > criticalPath.size) {
          criticalPath.clear();
          currentChain.forEach((id) => criticalPath.add(id));
        }
      } else {
        for (const dep of dependents) {
          findLongestChain(dep.to, currentChain);
        }
      }
    };
    // Find roots (cards that nothing depends on... actually find cards with no dependencies)
    const hasDependency = new Set(deps.filter((d) => d.type === "depends_on").map((d) => d.to));
    for (const c of cards) {
      if (!hasDependency.has(c.id)) {
        visited.clear();
        findLongestChain(c.id, []);
      }
    }

    // Goal cards as milestones
    const goalCards = cards.filter((c) => c.type === "goal");

    // Agent rows
    const agentRows = agents.map((agent) => {
      const agentCards = cards.filter((c) => c.assignedAgentId === agent.id && c.type !== "goal" && c.type !== "chat");
      const bars = agentCards.map((c) => {
        const start = c.startedAt ?? now;
        const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
        const end = c.dueDate ?? start + duration;
        const x = ((start - minTime) / span) * timelineWidth;
        const w = Math.max(((end - start) / span) * timelineWidth, 20);
        const phase = c.phase ?? "implementation";
        const isCritical = criticalPath.has(c.id);
        const phaseClass = `phase-${phase}`;
        const criticalClass = isCritical ? " gantt-critical" : "";
        const title = esc(c.title.slice(0, 40));
        return `<div class="gantt-bar ${phaseClass}${criticalClass}" style="left:${x}px;width:${w}px" title="${esc(c.title)}">${title}</div>`;
      }).join("");
      return `<div class="gantt-row"><div class="gantt-row-label">${esc(agent.name)}</div><div class="gantt-row-track" style="width:${timelineWidth}px">${bars}</div></div>`;
    }).join("");

    // Unassigned cards row
    const unassignedCards = cards.filter((c) => !c.assignedAgentId && c.type !== "goal" && c.type !== "chat" && c.status !== "done");
    const unassignedBars = unassignedCards.map((c) => {
      const start = c.startedAt ?? c.createdAt;
      const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
      const end = c.dueDate ?? start + duration;
      const x = ((start - minTime) / span) * timelineWidth;
      const w = Math.max(((end - start) / span) * timelineWidth, 20);
      const phase = c.phase ?? "implementation";
      const title = esc(c.title.slice(0, 40));
      return `<div class="gantt-bar phase-${phase} gantt-unassigned" style="left:${x}px;width:${w}px" title="${esc(c.title)}">${title}</div>`;
    }).join("");
    const unassignedRow = unassignedCards.length > 0
      ? `<div class="gantt-row"><div class="gantt-row-label">Unassigned</div><div class="gantt-row-track" style="width:${timelineWidth}px">${unassignedBars}</div></div>`
      : "";

    // Milestones (goal cards)
    const milestones = goalCards.map((c) => {
      const x = c.dueDate ? ((c.dueDate - minTime) / span) * timelineWidth : ((c.createdAt - minTime) / span) * timelineWidth;
      return `<div class="gantt-milestone" style="left:${x}px" title="${esc(c.title)}">◆</div>`;
    }).join("");
    const milestoneRow = goalCards.length > 0
      ? `<div class="gantt-row gantt-milestone-row"><div class="gantt-row-label">Milestones</div><div class="gantt-row-track" style="width:${timelineWidth}px">${milestones}</div></div>`
      : "";

    // Now line
    const nowX = ((now - minTime) / span) * timelineWidth;

    // Dependency arrows (SVG overlay)
    const cardPositions = new Map<string, { x: number; y: number; w: number }>();
    let rowIdx = 0;
    for (const agent of agents) {
      for (const c of cards.filter((c) => c.assignedAgentId === agent.id && c.type !== "goal" && c.type !== "chat")) {
        const start = c.startedAt ?? now;
        const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
        const end = c.dueDate ?? start + duration;
        const x = ((start - minTime) / span) * timelineWidth;
        const w = Math.max(((end - start) / span) * timelineWidth, 20);
        cardPositions.set(c.id, { x: x + w, y: rowIdx * 36 + 18, w });
      }
      rowIdx++;
    }
    if (unassignedCards.length > 0) {
      for (const c of unassignedCards) {
        const start = c.startedAt ?? c.createdAt;
        const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
        const end = c.dueDate ?? start + duration;
        const x = ((start - minTime) / span) * timelineWidth;
        const w = Math.max(((end - start) / span) * timelineWidth, 20);
        cardPositions.set(c.id, { x: x + w, y: rowIdx * 36 + 18, w });
      }
      rowIdx++;
    }

    const arrows = deps.filter((d) => d.type === "depends_on").map((d) => {
      const from = cardPositions.get(d.from);
      const to = cardPositions.get(d.to);
      if (!from || !to) return "";
      const x1 = from.x;
      const y1 = from.y;
      const x2 = to.x - to.w;
      const y2 = to.y;
      const midX = (x1 + x2) / 2;
      return `<path d="M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}" class="gantt-dep-arrow" />`;
    }).join("");
    const arrowOverlay = arrows ? `<svg class="gantt-dep-overlay" style="width:${timelineWidth}px;height:${rowIdx * 36 + 40}px">${arrows}</svg>` : "";

    const html = `
      <div class="gantt-axis" style="width:${timelineWidth}px">
        ${timeMarks.join("")}
        <div class="gantt-now-line" style="left:${nowX}px">NOW</div>
      </div>
      <div class="gantt-rows-container">
        <div class="gantt-rows">
          ${agentRows}
          ${unassignedRow}
          ${milestoneRow}
        </div>
        ${arrowOverlay}
      </div>`;

    document.getElementById("gantt-timeline")!.innerHTML = html;
  }

  private bindVModel(): void {
    document.getElementById("vmodel-close")!.addEventListener("click", () => this.store.toggleVModel(false));
  }

  private lastVModelSig = "";

  private renderVModel(): void {
    const panel = document.getElementById("vmodel-panel")!;
    panel.hidden = !this.store.vmodelOpen;
    if (!this.store.vmodelOpen) return;

    const cards = [...this.store.board.values()].sort((a, b) => a.createdAt - b.createdAt);
    const sig =
      this.store.vmodelOpen + "|" +
      cards.map((c) => c.id + c.status + c.phase + c.assignedAgentId + c.parentGoalId + (c.completionCriteria?.length ?? 0)).join(",");
    if (sig === this.lastVModelSig) return;
    this.lastVModelSig = sig;

    const agents = [...this.store.agents.values()];
    const agentName = (id: string | null) => id ? agents.find((a) => a.id === id)?.name ?? "?" : "—";

    // Group cards by phase
    const phases: TaskPhase[] = ["requirements", "design", "implementation", "verification", "done"];
    const cardsByPhase = new Map<TaskPhase, TaskCard[]>();
    for (const p of phases) cardsByPhase.set(p, []);
    for (const c of cards) {
      const phase = c.phase ?? "implementation";
      if (cardsByPhase.has(phase)) cardsByPhase.get(phase)!.push(c);
      else cardsByPhase.get("implementation")!.push(c);
    }

    // V-model layout: left side descends (requirements → design → implementation),
    // right side ascends (verification → done), connected at the bottom by implementation
    const cardList = (phase: TaskPhase): string => {
      const items = cardsByPhase.get(phase) ?? [];
      if (items.length === 0) return `<div class="vmodel-empty">No tasks</div>`;
      return items.map((c) => {
        const agent = agentName(c.assignedAgentId);
        const isGoal = c.type === "goal";
        const criteriaHtml = c.completionCriteria && c.completionCriteria.length > 0
          ? `<div class="vmodel-criteria">${c.completionCriteria.map((cr) =>
              `<div class="vmodel-criterion ${cr.checked ? "met" : "unmet"}">${cr.checked ? "✓" : "○"} ${esc(cr.text)}</div>`
            ).join("")}</div>`
          : "";
        const gateIcon = c.status === "done" ? "✓" : c.status === "review_pending" ? "⊘" : "→";
        const gateClass = c.status === "done" ? "vmodel-gate-passed" : c.status === "review_pending" ? "vmodel-gate-blocked" : "";
        return `<div class="vmodel-card phase-${phase} ${isGoal ? "vmodel-goal" : ""}" title="${esc(c.description ?? c.title)}">
          <div class="vmodel-card-header">
            <span class="vmodel-card-title">${isGoal ? "◆ " : ""}${esc(c.title.slice(0, 50))}</span>
            <span class="vmodel-gate ${gateClass}">${gateIcon}</span>
          </div>
          <div class="vmodel-card-meta">${agent}</div>
          ${criteriaHtml}
        </div>`;
      }).join("");
    };

    // Count tasks per phase for badge
    const count = (p: TaskPhase) => cardsByPhase.get(p)?.length ?? 0;

    const html = `
      <div class="vmodel-v-container">
        <div class="vmodel-side vmodel-left">
          <div class="vmodel-phase phase-requirements ${count("requirements") > 0 ? "active" : ""}">
            <div class="vmodel-phase-label">Requirements <span class="vmodel-count">${count("requirements")}</span></div>
            <div class="vmodel-cards">${cardList("requirements")}</div>
          </div>
          <div class="vmodel-connector vmodel-connector-down"></div>
          <div class="vmodel-phase phase-design ${count("design") > 0 ? "active" : ""}">
            <div class="vmodel-phase-label">Design <span class="vmodel-count">${count("design")}</span></div>
            <div class="vmodel-cards">${cardList("design")}</div>
          </div>
          <div class="vmodel-connector vmodel-connector-down"></div>
          <div class="vmodel-phase phase-implementation ${count("implementation") > 0 ? "active" : ""}">
            <div class="vmodel-phase-label">Implementation <span class="vmodel-count">${count("implementation")}</span></div>
            <div class="vmodel-cards">${cardList("implementation")}</div>
          </div>
        </div>
        <div class="vmodel-bottom-connector"></div>
        <div class="vmodel-side vmodel-right">
          <div class="vmodel-phase phase-done ${count("done") > 0 ? "active" : ""}">
            <div class="vmodel-phase-label">Done <span class="vmodel-count">${count("done")}</span></div>
            <div class="vmodel-cards">${cardList("done")}</div>
          </div>
          <div class="vmodel-connector vmodel-connector-up"></div>
          <div class="vmodel-phase phase-verification ${count("verification") > 0 ? "active" : ""}">
            <div class="vmodel-phase-label">Verification <span class="vmodel-count">${count("verification")}</span></div>
            <div class="vmodel-cards">${cardList("verification")}</div>
          </div>
          <div class="vmodel-connector vmodel-connector-up"></div>
          <div class="vmodel-phase phase-implementation-mirror">
            <div class="vmodel-phase-label vmodel-mirror-label">↕ Implementation</div>
          </div>
        </div>
      </div>`;

    document.getElementById("vmodel-diagram")!.innerHTML = html;
  }

  private renderAchievements(): void {
    const modal = document.getElementById("achievements-modal")!;
    if (!this.store.achievementsOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }
    const unlocked = achievements.getUnlockedIds();
    const tiers: Record<string, typeof ACHIEVEMENTS> = {};
    for (const a of ACHIEVEMENTS) {
      if (!tiers[a.tier]) tiers[a.tier] = [];
      tiers[a.tier].push(a);
    }
    const total = achievements.getTotalCount();
    const count = achievements.getUnlockedCount();
    let html = `<div class="ach-modal-content">`;
    html += `<div class="ach-modal-sticky">`;
    html += `<div class="ach-modal-header">`;
    html += `<span class="ach-modal-title">🏆 ACHIEVEMENTS</span>`;
    html += `<span class="ach-modal-progress">${count} / ${total}</span>`;
    html += `<button class="x" id="ach-close">✕</button>`;
    html += `</div>`;
    html += `<div class="ach-modal-progress-bar"><div class="ach-modal-progress-fill" style="width:${(count / total) * 100}%"></div></div>`;
    html += `</div>`;
    for (const [tier, items] of Object.entries(tiers)) {
      html += `<div class="ach-tier-name">${tier}</div>`;
      html += `<div class="ach-tier-grid">`;
      for (const a of items) {
        const isUnlocked = unlocked.has(a.id);
        const comingClass = a.comingSoon ? " coming-soon" : "";
        html += `<div class="ach-card${isUnlocked ? " unlocked" : " locked"}${comingClass}">`;
        html += `<span class="ach-icon">${a.comingSoon ? "🔒" : isUnlocked ? a.icon : "❓"}</span>`;
        html += `<div class="ach-info">`;
        html += `<span class="ach-name">${a.name}</span>`;
        html += `<span class="ach-desc">${a.desc}</span>`;
        if (a.comingSoon) html += `<span class="ach-soon">Coming Soon</span>`;
        html += `</div></div>`;
      }
      html += `</div>`;
    }
    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;
    document.getElementById("ach-close")!.addEventListener("click", () => {
      this.store.toggleAchievements(false);
    });
  }

  private bindHallOfFame(): void {
    const modal = document.getElementById("hall-of-fame-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleHallOfFame(false);
    });
  }

  private renderHallOfFame(): void {
    const modal = document.getElementById("hall-of-fame-modal")!;
    if (!this.store.hallOfFameOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }

    const agents = [...this.store.agents.values()].filter((a) => a.id !== OFFICE_MANAGER_ID && a.id !== WIZARD_ID);
    const fired = [...this.store.firedAgents.values()];

    const allAgents = [
      ...agents.map((a) => ({
        id: a.id,
        name: a.name,
        accent: a.accent,
        sprite: a.sprite,
        tasksDone: a.tasksDone,
        provider: a.provider,
        model: a.model,
        status: a.status,
        fired: false,
      })),
      ...fired.map((a) => ({
        id: a.id,
        name: a.name,
        accent: a.accent,
        sprite: a.sprite,
        tasksDone: a.tasksDone,
        provider: a.provider,
        model: a.model,
        status: "fired" as const,
        fired: true,
      })),
    ];

    const sorted = allAgents.sort((a, b) => b.tasksDone - a.tasksDone);
    const topAgent = sorted[0];

    const medals = ["🥇", "🥈", "🥉"];

    let html = `<div class="hof-modal-content">`;
    html += `<div class="hof-modal-header">`;
    html += `<span class="hof-modal-title">⭐ HALL OF FAME</span>`;
    html += `<button class="x" id="hof-close">✕</button>`;
    html += `</div>`;
    html += `<div class="hof-subtitle">Employee of the Month — Break Room Bulletin Board</div>`;

    if (topAgent && topAgent.tasksDone > 0) {
      html += `<div class="hof-spotlight">`;
      html += `<div class="hof-spotlight-avatar" style="background-image:url('assets/characters/char-${topAgent.sprite}.png')"></div>`;
      html += `<div class="hof-spotlight-info">`;
      html += `<span class="hof-spotlight-name" style="color:${topAgent.accent}">${esc(topAgent.name)}</span>`;
      html += `<span class="hof-spotlight-tasks">${topAgent.tasksDone} task${topAgent.tasksDone !== 1 ? "s" : ""} completed${topAgent.fired ? " · (fired)" : ""}</span>`;
      html += `</div>`;
      html += `<span class="hof-spotlight-medal">🏆</span>`;
      html += `</div>`;
    }

    if (sorted.length === 0) {
      html += `<div class="hof-empty">No agents yet. Hire someone and put them to work!</div>`;
    } else {
      html += `<div class="hof-list">`;
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const medal = i < 3 ? medals[i] : `${i + 1}.`;
        html += `<div class="hof-row${i < 3 ? " top3" : ""}">`;
        html += `<span class="hof-medal">${medal}</span>`;
        html += `<div class="hof-avatar" style="background-image:url('assets/characters/char-${a.sprite}.png')"></div>`;
        html += `<span class="hof-name" style="color:${a.accent}">${esc(a.name)}</span>`;
        html += `<span class="hof-tasks">${a.tasksDone} done${a.fired ? " · 🔥" : ""}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;
    document.getElementById("hof-close")!.addEventListener("click", () => {
      this.store.toggleHallOfFame(false);
    });
  }

  private bindRailwayPanel(): void {
    const modal = document.getElementById("railway-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleRailwayPanel(false);
    });
  }

  private renderRailwayPanel(): void {
    const modal = document.getElementById("railway-modal")!;
    if (!this.store.railwayPanelOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }

    let html = `<div class="railway-modal-content">`;
    html += `<div class="railway-modal-header">`;
    html += `<span class="railway-modal-title">🖥️ RAILWAY STATUS</span>`;
    html += `<button class="x" id="railway-close">✕</button>`;
    html += `</div>`;

    if (this.store.railwayError) {
      html += `<div class="railway-error">`;
      html += `<div class="railway-error-icon">⚠️</div>`;
      html += `<div class="railway-error-text">${esc(this.store.railwayError)}</div>`;
      html += `<div class="railway-error-hint">Make sure Railway CLI is installed and authenticated:<br><code>npm i -g @railway/cli</code> · <code>railway login</code></div>`;
      html += `</div>`;
    } else if (!this.store.railwayData) {
      html += `<div class="railway-loading">Querying Railway infrastructure…</div>`;
    } else {
      const data = this.store.railwayData;
      if (data.projects.length === 0) {
        html += `<div class="railway-empty">No Railway projects found.</div>`;
      } else {
        html += `<div class="railway-projects">`;
        for (const proj of data.projects) {
          html += `<div class="railway-project">`;
          html += `<div class="railway-project-header">`;
          html += `<span class="railway-project-name">${esc(proj.name)}</span>`;
          html += `<span class="railway-project-env">${esc(proj.environment)}</span>`;
          html += `</div>`;
          if (proj.services.length === 0) {
            html += `<div class="railway-no-services">No services</div>`;
          } else {
            html += `<div class="railway-services">`;
            for (const svc of proj.services) {
              const statusColor = svc.status.toLowerCase().includes("deploy") || svc.status.toLowerCase().includes("active") || svc.status.toLowerCase().includes("running") ? "#3d9152" : "#888";
              html += `<div class="railway-service">`;
              html += `<span class="railway-service-dot" style="background:${statusColor}"></span>`;
              html += `<span class="railway-service-name">${esc(svc.name)}</span>`;
              html += `<span class="railway-service-status">${esc(svc.status)}</span>`;
              if (svc.url) {
                html += `<a class="railway-service-url" href="${esc(svc.url)}" target="_blank">${esc(svc.url)}</a>`;
              }
              if (svc.deployments && svc.deployments.length > 0) {
                const latest = svc.deployments[0];
                html += `<span class="railway-service-deploy">latest: ${esc(latest.status)}</span>`;
              }
              html += `</div>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;
    document.getElementById("railway-close")!.addEventListener("click", () => {
      this.store.toggleRailwayPanel(false);
    });
  }

  private bindGitHubPanel(): void {
    const modal = document.getElementById("github-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleGitHubPanel(false);
    });
  }

  private bindForgePanel(): void {
    const modal = document.getElementById("forge-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleForgePanel(false);
    });
  }

  private renderForgePanel(): void {
    const modal = document.getElementById("forge-modal")!;
    if (!this.store.forgePanelOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }
    modal.hidden = false;

    const servers = this.store.forgeServers;
    let html = `<div class="railway-modal-content" style="max-width:600px;">`;
    html += `<div class="railway-modal-header">`;
    html += `<span class="railway-modal-title">🔨 MCP FORGE</span>`;
    html += `<button class="x" id="forge-close">✕</button>`;
    html += `</div>`;
    html += `<div style="padding:1rem;max-height:70vh;overflow-y:auto;">`;

    if (servers.length === 0) {
      html += `<p style="color:#888;font-size:0.85rem;text-align:center;padding:2rem 0;">No MCP servers forged yet. Agents can build and register MCP servers using the <code>register_mcp_server</code> tool.</p>`;
    } else {
      for (const s of servers) {
        const statusColor = s.status === "running" ? "#4caf50" : s.status === "error" ? "#f44336" : "#888";
        html += `<div style="background:#1a1a2e;border:1px solid #333;border-radius:0.5rem;padding:0.8rem;margin-bottom:0.6rem;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:start;">`;
        html += `<div><strong style="color:#e0e0e0;">${s.name}</strong> <span style="color:${statusColor};font-size:0.75rem;">● ${s.status}</span></div>`;
        html += `<button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;" data-forge-unregister="${s.id}">Remove</button>`;
        html += `</div>`;
        if (s.description) {
          html += `<p style="color:#888;font-size:0.78rem;margin:0.3rem 0;">${s.description}</p>`;
        }
        html += `<p style="color:#666;font-size:0.72rem;margin:0.2rem 0;">Built by ${s.builtByName} · ${s.runtime} · ${s.entryFile}</p>`;
        if (s.error) {
          html += `<p style="color:#f44336;font-size:0.72rem;margin:0.2rem 0;">${s.error}</p>`;
        }
        if (s.tools.length > 0) {
          html += `<div style="margin-top:0.4rem;">`;
          for (const t of s.tools) {
            html += `<span style="display:inline-block;background:#2a2a4a;border:1px solid #444;border-radius:0.3rem;padding:0.15rem 0.5rem;margin:0.15rem 0.15rem 0 0;font-size:0.72rem;color:#8fc9f0;">${t.name}</span>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div></div>`;
    modal.innerHTML = html;

    const closeBtn = document.getElementById("forge-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => { this.store.toggleForgePanel(false); });
    }
    for (const btn of modal.querySelectorAll("[data-forge-unregister]")) {
      const el = btn as HTMLElement;
      el.addEventListener("click", () => {
        const id = el.getAttribute("data-forge-unregister")!;
        this.store.unregisterForgeServer(id);
      });
    }
  }

  private renderGitHubPanel(): void {
    const modal = document.getElementById("github-modal")!;
    if (!this.store.githubPanelOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }

    let html = `<div class="railway-modal-content">`;
    html += `<div class="railway-modal-header">`;
    html += `<span class="railway-modal-title">🐙 GITHUB WORLDS</span>`;
    html += `<button class="x" id="github-close">✕</button>`;
    html += `</div>`;

    const status = this.store.githubStatus;
    if (!status) {
      html += `<div class="railway-loading">Querying GitHub…</div>`;
    } else if (!status.connected) {
      html += `<div class="railway-error">`;
      html += `<div class="railway-error-icon">⚠️</div>`;
      html += `<div class="railway-error-text">${esc(status.error ?? "Not connected")}</div>`;
      html += `<div class="railway-error-hint">Add a GitHub Personal Access Token via Settings → MCP Keys (GitHub server).</div>`;
      html += `</div>`;
    } else {
      html += `<div style="padding:8px 12px;color:#8fc9f0;font-size:13px;">Connected as <b>${esc(status.login ?? "unknown")}</b></div>`;

      const data = this.store.githubData;
      if (data?.error) {
        html += `<div class="railway-error"><div class="railway-error-text">${esc(data.error)}</div></div>`;
      }

      // Create new world fork
      html += `<div style="padding:8px 12px;border-bottom:1px solid #2a3a4a;">`;
      html += `<div style="font-size:12px;color:#aaa;margin-bottom:6px;">Create new world fork:</div>`;
      html += `<div style="display:flex;gap:6px;">`;
      html += `<input id="github-branch-name" placeholder="world-name" maxlength="40" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid #3a4a5a;background:#1a2a3a;color:#e0e0e0;font-size:13px;" />`;
      html += `<button id="github-fork-btn" style="padding:6px 12px;border-radius:6px;border:1px solid #3a6a5a;background:#2a5a4a;color:#e0e0e0;cursor:pointer;font-size:13px;">Fork & Create Branch</button>`;
      html += `</div>`;
      html += `</div>`;

      // List existing branches with deploy controls
      if (data && data.branches.length > 0) {
        html += `<div class="railway-projects">`;
        html += `<div style="padding:8px 12px;font-size:12px;color:#aaa;">World branches (${data.branches.length}):</div>`;
        for (const branch of data.branches) {
          const isDeploying = this.store.deployingBranch === branch.name;
          const existingDeploy = this.store.deployments.find(d => d.branchName === branch.name);
          html += `<div class="railway-project">`;
          html += `<div class="railway-project-header">`;
          html += `<span class="railway-project-name">${esc(branch.name)}</span>`;
          if (data.fork) {
            html += `<a class="railway-service-url" href="https://github.com/${esc(data.fork.fullName)}/tree/${esc(branch.name)}" target="_blank" style="font-size:11px;">view →</a>`;
          }
          html += `</div>`;
          // Deploy button
          if (branch.name !== "main" && branch.name !== "master") {
            html += `<button class="btn" id="github-edit-${esc(branch.name)}" style="font-size:11px;padding:3px 8px;margin:4px 0;">📝 Edit Code</button>`;
            if (isDeploying) {
              html += `<span style="font-size:11px;color:#e8a040;padding:3px 8px;">⏳ deploying...</span>`;
            } else if (existingDeploy) {
              const statusColor = existingDeploy.status.toLowerCase().includes("deploy") || existingDeploy.status.toLowerCase().includes("active") || existingDeploy.status.toLowerCase().includes("running") ? "#3d9152" : "#888";
              html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">`;
              html += `<span style="font-size:11px;color:${statusColor};">● ${esc(existingDeploy.status)}</span>`;
              if (existingDeploy.railwayServiceUrl) {
                html += `<a href="${esc(existingDeploy.railwayServiceUrl)}" target="_blank" style="font-size:11px;color:#5a9ad6;">open ↗</a>`;
                html += `<button class="btn" id="github-enter-${esc(branch.name)}" style="font-size:10px;padding:2px 6px;margin-left:auto;border:1px solid #4a6a8a;background:#2a4a6a;color:#c0e0ff;">🌀 Open Portal</button>`;
              }
              html += `<button class="btn" id="github-stop-${esc(branch.name)}" style="font-size:10px;padding:2px 6px;${existingDeploy.railwayServiceUrl ? "" : "margin-left:auto;"}">Stop</button>`;
              html += `<button class="btn danger" id="github-deldep-${esc(branch.name)}" style="font-size:10px;padding:2px 6px;">Delete</button>`;
              html += `</div>`;
            } else {
              html += `<button class="btn" id="github-deploy-${esc(branch.name)}" style="font-size:11px;padding:3px 8px;margin:4px 0;">🚀 Deploy to Railway</button>`;
            }
            html += `<button class="btn danger" id="github-del-${esc(branch.name)}" style="font-size:11px;padding:3px 8px;margin:4px 4px;">Delete Branch</button>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      } else if (data && !data.fork) {
        html += `<div class="railway-empty">No fork yet. Create one above to get started.</div>`;
      } else if (data && data.branches.length === 0) {
        html += `<div class="railway-empty">No branches found.</div>`;
      }

      // Deployments section
      if (this.store.deployments.length > 0) {
        html += `<div style="padding:8px 12px;border-top:1px solid #2a3a4a;">`;
        html += `<div style="font-size:12px;color:#aaa;margin-bottom:6px;">Active deployments (${this.store.deployments.length}):</div>`;
        for (const dep of this.store.deployments) {
          const statusColor = dep.status.toLowerCase().includes("deploy") || dep.status.toLowerCase().includes("active") || dep.status.toLowerCase().includes("running") ? "#3d9152" : "#888";
          html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #1a2a3a;">`;
          html += `<span style="font-size:12px;color:#e0e0e0;">${esc(dep.branchName)}</span>`;
          html += `<span style="font-size:11px;color:${statusColor};">● ${esc(dep.status)}</span>`;
          if (dep.railwayServiceUrl) {
            html += `<a href="${esc(dep.railwayServiceUrl)}" target="_blank" style="font-size:11px;color:#5a9ad6;">${esc(dep.railwayServiceUrl)}</a>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;

    document.getElementById("github-close")!.addEventListener("click", () => {
      this.store.toggleGitHubPanel(false);
    });

    const forkBtn = document.getElementById("github-fork-btn");
    if (forkBtn) {
      forkBtn.addEventListener("click", () => {
        const input = document.getElementById("github-branch-name") as HTMLInputElement | null;
        const name = input?.value.trim();
        if (!name) return;
        this.store.sendFn?.({ type: "github_fork", branchName: name });
        input!.value = "";
      });
    }

    // Wire deploy, stop, delete-deployment, and delete-branch buttons
    if (this.store.githubData) {
      const forkFullName = this.store.githubData.fork?.fullName ?? "";
      for (const branch of this.store.githubData.branches) {
        if (branch.name === "main" || branch.name === "master") continue;

        const editBtn = document.getElementById(`github-edit-${branch.name}`);
        if (editBtn) {
          editBtn.addEventListener("click", () => {
            this.store.toggleCodeEditor(true);
            this.store.codeEditorBranch = branch.name;
            this.store.codeEditorFile = null;
            this.store.codeEditorPath = "";
            this.store.codeEditorDir = [];
            this.store.toggleGitHubPanel(false);
            this.store.sendFn?.({ type: "github_list_dir", branchName: branch.name, path: "" });
          });
        }

        const enterBtn = document.getElementById(`github-enter-${branch.name}`);
        if (enterBtn) {
          enterBtn.addEventListener("click", () => {
            const dep = this.store.deployments.find(d => d.branchName === branch.name);
            if (!dep?.railwayServiceUrl) return;
            const scene = this.store.sceneRef as any;
            if (scene?.openPortal) {
              scene.openPortal(branch.name, dep.railwayServiceUrl);
            }
          });
        }

        const deployBtn = document.getElementById(`github-deploy-${branch.name}`);
        if (deployBtn) {
          deployBtn.addEventListener("click", () => {
            this.store.sendFn?.({ type: "railway_deploy", branchName: branch.name, repoFullName: forkFullName });
          });
        }

        const stopBtn = document.getElementById(`github-stop-${branch.name}`);
        if (stopBtn) {
          stopBtn.addEventListener("click", () => {
            this.store.sendFn?.({ type: "railway_stop_deployment", branchName: branch.name });
          });
        }

        const delDepBtn = document.getElementById(`github-deldep-${branch.name}`);
        if (delDepBtn) {
          delDepBtn.addEventListener("click", () => {
            if (!confirm(`Delete Railway deployment for "${branch.name}"?`)) return;
            this.store.sendFn?.({ type: "railway_delete_deployment", branchName: branch.name });
          });
        }

        const delBtn = document.getElementById(`github-del-${branch.name}`);
        if (delBtn) {
          delBtn.addEventListener("click", () => {
            if (!confirm(`Delete branch "${branch.name}"?`)) return;
            this.store.sendFn?.({ type: "github_delete_branch", branchName: branch.name });
          });
        }
      }
    }
  }

  private bindCodeEditorPanel(): void {
    const modal = document.getElementById("code-editor-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleCodeEditor(false);
    });
  }

  private renderCodeEditor(): void {
    const modal = document.getElementById("code-editor-modal")!;
    if (!this.store.codeEditorOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      this.codeEditorSig = "";
      if (this.monacoEditor) {
        this.monacoEditor.dispose();
        this.monacoEditor = null;
        this.monacoFilePath = null;
      }
      return;
    }

    const branch = this.store.codeEditorBranch ?? "";
    const dir = this.store.codeEditorDir;
    const file = this.store.codeEditorFile;

    // Signature tracks structural state — if it hasn't changed, skip the full
    // HTML rebuild (which would destroy the Monaco editor DOM). Only update
    // Monaco's model if the file path changed.
    const sig = `${branch}|${this.store.codeEditorPath}|${file ? file.path : ""}|${dir.map(e => e.path).join(",")}|${this.store.currentWorld ? "world" : ""}`;
    if (sig === this.codeEditorSig) {
      // Just ensure Monaco layout is correct
      if (this.monacoEditor) this.monacoEditor.layout();
      return;
    }
    this.codeEditorSig = sig;

    let html = `<div style="width:90vw;max-width:1100px;height:85vh;background:#1a1a2e;border:1px solid #3a4a5a;border-radius:10px;display:flex;flex-direction:column;overflow:hidden;">`;

    // Header
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #2a3a4a;background:#16213e;">`;
    html += `<span style="color:#8fc9f0;font-size:14px;font-weight:bold;">📝 ${esc(branch)} — ${esc(file ? file.path : this.store.codeEditorPath || "/")}</span>`;
    html += `<div style="display:flex;gap:6px;">`;
    if (file) {
      html += `<button id="ce-save" style="padding:4px 10px;border-radius:6px;border:1px solid #3a6a5a;background:#2a5a4a;color:#e0e0e0;cursor:pointer;font-size:12px;">💾 Save</button>`;
      html += `<button id="ce-delete" style="padding:4px 10px;border-radius:6px;border:1px solid #6a3a3a;background:#5a2a2a;color:#e0e0e0;cursor:pointer;font-size:12px;">🗑 Delete</button>`;
    }
    html += `<button id="ce-new-file" style="padding:4px 10px;border-radius:6px;border:1px solid #3a4a6a;background:#2a3a5a;color:#e0e0e0;cursor:pointer;font-size:12px;">+ New File</button>`;
    if (this.store.currentWorld) {
      html += `<button id="ce-redeploy" style="padding:4px 10px;border-radius:6px;border:1px solid #6a4a2a;background:#5a3a1a;color:#ffd0a0;cursor:pointer;font-size:12px;">🚀 Redeploy World</button>`;
    }
    html += `<button class="x" id="ce-close" style="margin-left:4px;">✕</button>`;
    html += `</div></div>`;

    // Body: file tree (left) + editor (right)
    html += `<div style="display:flex;flex:1;overflow:hidden;">`;

    // File tree sidebar
    html += `<div style="width:240px;border-right:1px solid #2a3a4a;overflow-y:auto;padding:4px 0;">`;
    // Breadcrumb / back button
    if (this.store.codeEditorPath) {
      html += `<div id="ce-up" style="padding:4px 12px;cursor:pointer;color:#aaa;font-size:12px;hover:color:#fff;">📁 ../</div>`;
    }
    for (const entry of dir) {
      const icon = entry.type === "dir" ? "📁" : "📄";
      const name = entry.path.split("/").pop() ?? entry.path;
      html += `<div class="ce-entry" data-path="${esc(entry.path)}" data-type="${entry.type}" style="padding:3px 12px;cursor:pointer;color:#ccc;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon} ${esc(name)}</div>`;
    }
    if (dir.length === 0) {
      html += `<div style="padding:8px 12px;color:#666;font-size:12px;">Loading...</div>`;
    }
    html += `</div>`;

    // Editor area
    html += `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">`;
    if (file) {
      html += `<div id="ce-monaco" style="flex:1;overflow:hidden;"></div>`;
      // Commit message + save bar
      html += `<div style="padding:6px 8px;border-top:1px solid #2a3a4a;display:flex;gap:6px;align-items:center;background:#161b22;">`;
      html += `<input id="ce-commit-msg" placeholder="Commit message..." maxlength="100" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid #3a4a5a;background:#0d1117;color:#c9d1d9;font-size:12px;" value="Update ${esc(file.path.split("/").pop() ?? file.path)}" />`;
      html += `</div>`;
    } else {
      html += `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#555;font-size:14px;">Select a file to edit</div>`;
    }
    html += `</div>`;

    html += `</div>`; // end body
    html += `</div>`; // end container

    modal.innerHTML = html;
    modal.hidden = false;

    // Wire close
    document.getElementById("ce-close")!.addEventListener("click", () => {
      this.store.toggleCodeEditor(false);
    });

    // Wire up button
    const upBtn = document.getElementById("ce-up");
    if (upBtn) {
      upBtn.addEventListener("click", () => {
        const parts = this.store.codeEditorPath.split("/");
        parts.pop();
        const parent = parts.join("/");
        this.store.sendFn?.({ type: "github_list_dir", branchName: branch, path: parent });
      });
      upBtn.addEventListener("mouseenter", () => { upBtn.style.color = "#fff"; });
      upBtn.addEventListener("mouseleave", () => { upBtn.style.color = "#aaa"; });
    }

    // Wire file/dir entries
    for (const entryEl of modal.querySelectorAll(".ce-entry")) {
      const el = entryEl as HTMLDivElement;
      const path = el.dataset.path!;
      const type = el.dataset.type as "file" | "dir";
      el.addEventListener("click", () => {
        if (type === "dir") {
          this.store.sendFn?.({ type: "github_list_dir", branchName: branch, path });
        } else {
          this.store.sendFn?.({ type: "github_read_file", branchName: branch, path });
        }
      });
      el.addEventListener("mouseenter", () => { el.style.background = "#1a2a3a"; });
      el.addEventListener("mouseleave", () => { el.style.background = ""; });
    }

    // Wire save
    const saveBtn = document.getElementById("ce-save");
    if (saveBtn && file) {
      saveBtn.addEventListener("click", () => {
        const commitInput = document.getElementById("ce-commit-msg") as HTMLInputElement | null;
        const content = this.monacoEditor?.getValue() ?? file.content;
        const commitMsg = commitInput?.value.trim() || `Update ${file.path}`;
        this.store.sendFn?.({
          type: "github_write_file",
          branchName: branch,
          path: file.path,
          content,
          sha: file.sha,
          commitMessage: commitMsg,
        });
      });
    }

    // Wire delete
    const delBtn = document.getElementById("ce-delete");
    if (delBtn && file) {
      delBtn.addEventListener("click", () => {
        if (!confirm(`Delete "${file.path}"?`)) return;
        this.store.sendFn?.({
          type: "github_delete_file",
          branchName: branch,
          path: file.path,
          sha: file.sha,
          commitMessage: `Delete ${file.path}`,
        });
      });
    }

    // Wire new file
    const newFileBtn = document.getElementById("ce-new-file");
    if (newFileBtn) {
      newFileBtn.addEventListener("click", () => {
        const name = prompt("New file path (e.g. src/new-file.ts):");
        if (!name?.trim()) return;
        const path = this.store.codeEditorPath ? `${this.store.codeEditorPath}/${name.trim()}` : name.trim();
        this.store.sendFn?.({
          type: "github_create_file",
          branchName: branch,
          path,
          content: "",
          commitMessage: `Create ${path}`,
        });
      });
    }

    // Wire redeploy (only shown when inside a deployed world)
    const redeployBtn = document.getElementById("ce-redeploy");
    if (redeployBtn && this.store.currentWorld) {
      redeployBtn.addEventListener("click", () => {
        const world = this.store.currentWorld!;
        if (!confirm(`Redeploy "${world.branchName}"? This will rebuild the world on Railway with your latest changes.`)) return;
        this.store.sendFn?.({ type: "railway_deploy", branchName: world.branchName, repoFullName: "" });
        this.store.toast("Redeploying world... this may take a minute.");
        // Close editor so user can watch the world reload
        this.store.toggleCodeEditor(false);
      });
    }

    // Create or update Monaco editor
    const monacoContainer = document.getElementById("ce-monaco");
    if (monacoContainer && file) {
      if (this.monacoEditor && this.monacoFilePath === file.path) {
        // Same file — just resize in case layout changed
        this.monacoEditor.layout();
      } else if (this.monacoEditor && this.monacoFilePath !== file.path) {
        // Different file — swap the model
        this.monacoFilePath = file.path;
        const lang = this.detectLanguage(file.path);
        const oldModel = this.monacoEditor.getModel();
        const newModel = monacoModule!.editor.createModel(file.content, lang);
        this.monacoEditor.setModel(newModel);
        oldModel?.dispose();
      } else {
        // First time — create the editor (lazy-load monaco if needed)
        if (!monacoModule) {
          import("monaco-editor").then((m) => {
            monacoModule = m;
            this.renderCodeEditor();
          });
          return;
        }
        this.monacoFilePath = file.path;
        const lang = this.detectLanguage(file.path);
        this.monacoEditor = monacoModule.editor.create(monacoContainer, {
          value: file.content,
          language: lang,
          theme: "vs-dark",
          automaticLayout: true,
          fontSize: 13,
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          fontLigatures: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          lineNumbers: "on",
          folding: true,
          wordWrap: "off",
          renderWhitespace: "selection",
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        });
        // Ctrl/Cmd+S to save
        this.monacoEditor.addCommand(monacoModule.KeyMod.CtrlCmd | monacoModule.KeyCode.KeyS, () => {
          saveBtn?.click();
        });
      }
    } else if (!file && this.monacoEditor) {
      // No file selected — dispose editor
      this.monacoEditor.dispose();
      this.monacoEditor = null;
      this.monacoFilePath = null;
    }
  }

  /** Detect Monaco language ID from file extension. */
  private detectLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      ts: "typescript", tsx: "typescript",
      js: "javascript", jsx: "javascript", mjs: "javascript",
      json: "json",
      css: "css", scss: "scss",
      html: "html",
      md: "markdown",
      sql: "sql",
      yaml: "yaml", yml: "yaml",
      xml: "xml",
      sh: "shell", bash: "shell",
      py: "python",
      go: "go",
      rs: "rust",
      toml: "ini",
      env: "ini",
    };
    return map[ext] ?? "plaintext";
  }

  private bindWorldsPanel(): void {
    const modal = document.getElementById("worlds-modal")!;
    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.store.toggleWorldsPanel(false);
    });
  }

  private renderWorldsPanel(): void {
    const modal = document.getElementById("worlds-modal")!;
    if (!this.store.worldsPanelOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }

    const deployments = this.store.deployments;

    let html = `<div class="railway-modal-content">`;
    html += `<div class="railway-modal-header">`;
    html += `<span class="railway-modal-title">🌀 WORLDS</span>`;
    html += `<button class="x" id="worlds-close">✕</button>`;
    html += `</div>`;

    // ── World Templates ──
    if (this.store.worldTemplates.length > 0) {
      html += `<div style="padding:8px 12px 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">World Templates</div>`;
      for (const tpl of this.store.worldTemplates) {
        html += `<div class="railway-project" style="border:1px solid #333;background:#1a1a24;">`;
        html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px;">`;
        html += `<span style="font-size:28px;line-height:1;">${esc(tpl.icon)}</span>`;
        html += `<div style="flex:1;min-width:0;">`;
        html += `<div style="font-size:14px;font-weight:600;color:#e0e0e0;">${esc(tpl.name)}</div>`;
        html += `<div style="font-size:11px;color:#888;margin-top:2px;">${esc(tpl.description)}</div>`;
        html += `</div>`;
        if (this.store.worldGenerating) {
          html += `<span style="font-size:11px;color:#e8a838;white-space:nowrap;">⏳ ${esc(this.store.worldGenerating.message)}</span>`;
        } else {
          html += `<button class="btn" id="worlds-gen-${esc(tpl.id)}" style="font-size:11px;padding:4px 12px;border:1px solid #4a8a4a;background:#2a4a2a;color:#a0e0a0;white-space:nowrap;cursor:pointer;font-weight:600;">Generate World</button>`;
        }
        html += `</div>`;
        html += `</div>`;
      }
      html += `<div style="height:1px;background:#222;margin:8px 0;"></div>`;
    }

    // ── Your Worlds (deployments) ──
    html += `<div style="padding:0 12px 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Your Worlds</div>`;
    if (deployments.length === 0) {
      html += `<div style="padding:20px;text-align:center;color:#888;font-size:14px;">No worlds deployed yet.<br><span style="font-size:12px;">Generate a world from a template above.</span></div>`;
    } else {
      for (const dep of deployments) {
        const statusColor = dep.status.toLowerCase().includes("deploy") || dep.status.toLowerCase().includes("active") || dep.status.toLowerCase().includes("running") ? "#3d9152" : "#888";
        const isCurrent = this.store.currentWorld?.branchName === dep.branchName;
        const isUpgraded = dep.assetUpgradeStatus === "ready";
        const isGenerating = dep.assetUpgradeStatus === "generating" || (this.store.assetUpgradeStatus === "generating" && this.store.assetUpgradeDeploymentId === dep.branchName);
        html += `<div class="railway-project">`;
        html += `<div class="railway-project-header">`;
        html += `<span class="railway-project-name">${esc(dep.branchName)}${isCurrent ? " <span style=\"color:#5ad6a0;font-size:11px;\">● you are here</span>" : ""}${isUpgraded ? " <span style=\"color:#b388ff;font-size:11px;\">✨ AI</span>" : ""}</span>`;
        if (dep.railwayServiceUrl) {
          html += `<a class="railway-service-url" href="${esc(dep.railwayServiceUrl)}" target="_blank">open ↗</a>`;
        }
        html += `</div>`;
        html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">`;
        html += `<span style="font-size:11px;color:${statusColor};">● ${esc(dep.status)}</span>`;
        if (dep.railwayServiceUrl && !isCurrent) {
          html += `<button class="btn" id="worlds-enter-${esc(dep.branchName)}" style="font-size:11px;padding:3px 10px;margin-left:auto;border:1px solid #4a6a8a;background:#2a4a6a;color:#c0e0ff;">🌀 Open Portal</button>`;
        } else if (isCurrent) {
          html += `<span style="margin-left:auto;font-size:11px;color:#5ad6a0;">Walk into the green portal to return</span>`;
        }
        html += `</div>`;

        // Asset upgrade row
        if (!isUpgraded && !isGenerating && dep.railwayServiceUrl) {
          html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-top:1px solid #222;margin-top:4px;">`;
          html += `<span style="font-size:11px;color:#888;">Procedural graphics</span>`;
          html += `<button class="btn" id="worlds-upgrade-${esc(dep.branchName)}" style="font-size:11px;padding:3px 12px;margin-left:auto;border:1px solid #b388ff;background:#3a2a4a;color:#d0b0ff;font-weight:600;cursor:pointer;">✨ Upgrade — $19.99</button>`;
          html += `</div>`;
        } else if (isGenerating) {
          const prog = this.store.assetUpgradeProgress;
          const pct = prog?.percent ?? 0;
          const label = prog?.label ?? "Generating…";
          html += `<div style="padding:6px 0;border-top:1px solid #222;margin-top:4px;">`;
          html += `<div style="font-size:11px;color:#b388ff;margin-bottom:4px;">✨ ${esc(label)} ${pct}%</div>`;
          html += `<div style="width:100%;height:4px;background:#222;border-radius:2px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#b388ff,#7c4dff);transition:width 0.3s;"></div></div>`;
          html += `</div>`;
        } else if (isUpgraded) {
          html += `<div style="padding:4px 0;border-top:1px solid #222;margin-top:4px;">`;
          html += `<span style="font-size:11px;color:#b388ff;">✨ AI graphics upgraded</span>`;
          html += `</div>`;
        }

        html += `</div>`;
      }
    }

    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;

    // Wire close
    document.getElementById("worlds-close")!.addEventListener("click", () => {
      this.store.toggleWorldsPanel(false);
    });

    // Wire Generate World buttons (templates)
    for (const tpl of this.store.worldTemplates) {
      const btn = document.getElementById(`worlds-gen-${tpl.id}`);
      if (btn) {
        btn.addEventListener("click", () => {
          if (this.net) this.net.send({ type: "generate_world", templateId: tpl.id });
        });
      }
    }

    // Wire Open Portal buttons
    for (const dep of deployments) {
      if (!dep.railwayServiceUrl) continue;
      if (this.store.currentWorld?.branchName === dep.branchName) continue;
      const btn = document.getElementById(`worlds-enter-${dep.branchName}`);
      if (btn) {
        btn.addEventListener("click", () => {
          const scene = this.store.sceneRef as any;
          if (scene?.openPortal) {
            scene.openPortal(dep.branchName, dep.railwayServiceUrl!);
          }
        });
      }
    }

    // Wire Upgrade buttons
    for (const dep of deployments) {
      if (!dep.railwayServiceUrl) continue;
      if (dep.assetUpgradeStatus === "ready" || dep.assetUpgradeStatus === "generating") continue;
      const upgradeBtn = document.getElementById(`worlds-upgrade-${dep.branchName}`);
      if (upgradeBtn) {
        upgradeBtn.addEventListener("click", async () => {
          // Call Stripe checkout API
          try {
            const token = localStorage.getItem("auth_token") ?? "";
            const res = await fetch("/api/asset-upgrade/checkout", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                deploymentId: dep.branchName,
                branchName: dep.branchName,
                repoFullName: dep.repoFullName,
              }),
            });
            const data = await res.json();
            if (data.url) {
              window.location.href = data.url;
            } else {
              this.store.toast(`Upgrade checkout failed: ${data.error ?? "Unknown error"}`);
            }
          } catch (err) {
            this.store.toast(`Upgrade checkout failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        });
      }
    }
  }

  private renderWardrobe(): void {
    const modal = document.getElementById("wardrobe-modal")!;
    if (!this.store.wardrobeOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      this.wardrobeBuilder = null;
      return;
    }

    const current = this.store.player?.appearance ?? DEFAULT_APPEARANCE;
    const builder = new CharBuilder("wd", current, () => {});
    this.wardrobeBuilder = builder;

    const editable = this.store.wardrobeEditable;

    const renderOutfitList = (): string => {
      const outfits = this.store.outfits;
      if (outfits.length === 0) {
        return `<p class="outfit-empty">No saved outfits yet.${editable ? " Randomize and save one!" : ""}</p>`;
      }
      return outfits.map((o) => `
        <div class="outfit-item" data-id="${o.id}">
          <div class="outfit-thumb" style="background-image:url('${generateCharPreviewDataURL(o.appearance, 2)}')"></div>
          <span class="outfit-name">${o.name}</span>
          <button class="outfit-load" data-id="${o.id}" title="Load into builder">▶ LOAD</button>
          ${editable ? `<button class="outfit-delete" data-id="${o.id}" title="Delete">✕</button>` : ""}
        </div>`).join("");
    };

    modal.innerHTML = `
      <div class="modal wardrobe-modal">
        <h2>WARDROBE</h2>
        <p class="sub" style="margin-bottom:12px;">Change your look anytime.</p>
        <div class="wardrobe-layout">
          <div class="wardrobe-builder">
            ${builder.html()}
          </div>
          <div class="wardrobe-outfits">
            <div class="outfit-header">
              <span class="outfit-title">SAVED OUTFITS</span>
              ${editable ? `<button class="btn outfit-save-btn" id="wd-save-outfit">💾 SAVE CURRENT</button>` : ""}
            </div>
            <div class="outfit-list" id="wd-outfit-list">
              ${renderOutfitList()}
            </div>
          </div>
        </div>
        <div class="row">
          <button class="btn" id="wd-cancel">CANCEL</button>
          <button class="btn primary" id="wd-save">SAVE LOOK ▶</button>
        </div>
      </div>
    `;
    modal.hidden = false;
    builder.mount();

    const wireOutfitItems = (): void => {
      document.querySelectorAll<HTMLElement>(".outfit-load").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const outfit = this.store.outfits.find((o) => o.id === id);
          if (outfit) {
            builder.setAppearance(outfit.appearance);
            this.toast(`Loaded "${outfit.name}"`);
          }
        });
      });
      document.querySelectorAll<HTMLElement>(".outfit-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.net.send({ type: "delete_outfit", id: btn.dataset.id! });
        });
      });
    };

    wireOutfitItems();

    const saveOutfitBtn = document.getElementById("wd-save-outfit");
    if (saveOutfitBtn) {
      const header = saveOutfitBtn.parentElement!;
      const restoreButton = () => {
        header.innerHTML = `<span class="outfit-title">SAVED OUTFITS</span><button class="btn outfit-save-btn" id="wd-save-outfit">💾 SAVE CURRENT</button>`;
        document.getElementById("wd-save-outfit")!.addEventListener("click", outfitSaveClick);
      };
      const outfitSaveClick = () => {
        header.querySelector("#wd-save-outfit")?.remove();
        header.insertAdjacentHTML("beforeend", `
          <input type="text" id="wd-outfit-name" placeholder="Outfit name…" maxlength="24" style="font-size:0.75rem;padding:0.3rem 0.5rem;width:120px;" />
          <button class="btn" id="wd-outfit-confirm" style="font-size:0.7rem;padding:0.3rem 0.5rem;">✓</button>
          <button class="btn" id="wd-outfit-cancel" style="font-size:0.7rem;padding:0.3rem 0.5rem;">✕</button>
        `);
        const input = document.getElementById("wd-outfit-name") as HTMLInputElement;
        input.focus();
        const submit = () => {
          const name = input.value.trim();
          if (!name) return;
          this.net.send({ type: "save_outfit", name, appearance: builder.getAppearance() });
          this.toast("Outfit saved!");
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") restoreButton();
        });
        document.getElementById("wd-outfit-confirm")!.addEventListener("click", submit);
        document.getElementById("wd-outfit-cancel")!.addEventListener("click", restoreButton);
      };
      saveOutfitBtn.addEventListener("click", outfitSaveClick);
    }

    document.getElementById("wd-cancel")!.addEventListener("click", () => {
      this.store.toggleWardrobe(false);
    });
    document.getElementById("wd-save")!.addEventListener("click", () => {
      const ap = builder.getAppearance();
      const player = this.store.player;
      if (player) {
        const updated = { ...player, appearance: ap };
        localStorage.setItem(PLAYER_KEY, JSON.stringify(updated));
        this.net.send({ type: "update_appearance", appearance: ap });
      }
      this.store.toggleWardrobe(false);
    });
  }

  private refreshOutfitList(): void {
    const listEl = document.getElementById("wd-outfit-list");
    if (!listEl) return;
    const editable = this.store.wardrobeEditable;
    const outfits = this.store.outfits;
    if (outfits.length === 0) {
      listEl.innerHTML = `<p class="outfit-empty">No saved outfits yet.${editable ? " Randomize and save one!" : ""}</p>`;
      return;
    }
    listEl.innerHTML = outfits.map((o) => `
      <div class="outfit-item" data-id="${o.id}">
        <div class="outfit-thumb" style="background-image:url('${generateCharPreviewDataURL(o.appearance, 2)}')"></div>
        <span class="outfit-name">${o.name}</span>
        <button class="outfit-load" data-id="${o.id}" title="Load into builder">▶ LOAD</button>
        ${editable ? `<button class="outfit-delete" data-id="${o.id}" title="Delete">✕</button>` : ""}
      </div>`).join("");
    listEl.querySelectorAll<HTMLElement>(".outfit-load").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const outfit = this.store.outfits.find((o) => o.id === id);
        if (outfit && this.wardrobeBuilder) {
          this.wardrobeBuilder.setAppearance(outfit.appearance);
          this.toast(`Loaded "${outfit.name}"`);
        }
      });
    });
    listEl.querySelectorAll<HTMLElement>(".outfit-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.net.send({ type: "delete_outfit", id: btn.dataset.id! });
      });
    });
  }

  private lastToastText = "";
  private lastToastTime = 0;

  private escape(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  private toast(text: string): void {
    const now = Date.now();
    if (text === this.lastToastText && now - this.lastToastTime < 2000) return;
    this.lastToastText = text;
    this.lastToastTime = now;
    const box = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  private async loadSpendData(): Promise<void> {
    const loading = document.getElementById("spend-loading");
    const content = document.getElementById("spend-content");
    if (!loading || !content) return;
    loading.hidden = false;
    content.hidden = true;
    try {
      const token = getToken();
      if (!token) {
        loading.textContent = "Sign in to view spend data.";
        return;
      }
      const res = await fetch("/api/usage?days=30", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        loading.textContent = `Failed to load (HTTP ${res.status}).`;
        return;
      }
      const data = await res.json();
      if (data.error) {
        loading.textContent = data.error;
        return;
      }
      loading.hidden = true;
      content.hidden = false;

      const fmtCost = (c: number) => `$${c.toFixed(4)}`;
      const fmtTokens = (t: number) => t >= 1_000_000 ? `${(t / 1_000_000).toFixed(1)}M` : t >= 1000 ? `${(t / 1000).toFixed(1)}K` : String(t);

      let html = `<div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">`;
      html += `<div style="background:#1a1a1a;border:1px solid #333;border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:#888;">TOTAL COST</div><div style="font-size:1.1rem;font-weight:600;color:#e0e0e0;">${fmtCost(data.totalCost)}</div></div>`;
      html += `<div style="background:#1a1a1a;border:1px solid #333;border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:#888;">API CALLS</div><div style="font-size:1.1rem;font-weight:600;color:#e0e0e0;">${data.totalCalls}</div></div>`;
      html += `<div style="background:#1a1a1a;border:1px solid #333;border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:#888;">INPUT TOKENS</div><div style="font-size:1.1rem;font-weight:600;color:#e0e0e0;">${fmtTokens(data.totalInputTokens)}</div></div>`;
      html += `<div style="background:#1a1a1a;border:1px solid #333;border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:#888;">OUTPUT TOKENS</div><div style="font-size:1.1rem;font-weight:600;color:#e0e0e0;">${fmtTokens(data.totalOutputTokens)}</div></div>`;
      html += `</div>`;

      // Monthly cap progress bar
      const currentMonth = new Date().toISOString().slice(0, 7);
      const monthSpend = (data.byDay ?? []).filter((d: any) => d.date.startsWith(currentMonth)).reduce((s: number, d: any) => s + d.cost, 0);
      const capPct = Math.min(100, (monthSpend / 30) * 100);
      const capColor = monthSpend >= 30 ? "#e05d5d" : monthSpend >= 25 ? "#e8c44a" : "#53b86b";
      html += `<div class="sec">THIS MONTH — $${monthSpend.toFixed(2)} / $30.00</div>`;
      html += `<div style="background:#1a1a1a;border-radius:0.4rem;height:20px;overflow:hidden;margin-bottom:1rem;border:1px solid #333;"><div style="width:${capPct}%;height:100%;background:${capColor};border-radius:0.4rem;transition:width 0.3s;"></div></div>`;


      if (data.byAgent?.length > 0) {
        html += `<div class="sec">BY AGENT</div><div style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:1rem;">`;
        for (const a of data.byAgent) {
          html += `<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0.5rem;background:#1a1a1a;border-radius:0.4rem;"><span style="color:#ccc;">${esc(a.agentName)}</span><span style="color:#888;">${fmtCost(a.cost)} · ${a.calls} calls</span></div>`;
        }
        html += `</div>`;
      }

      if (data.byDay?.length > 0) {
        html += `<div class="sec">DAILY SPEND</div><div style="display:flex;flex-direction:column;gap:0.2rem;">`;
        const maxCost = Math.max(...data.byDay.map((d: any) => d.cost), 0.001);
        for (const d of data.byDay) {
          const barWidth = Math.max(2, (d.cost / maxCost) * 100);
          html += `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;"><span style="color:#888;min-width:70px;">${d.date}</span><div style="flex:1;background:#1a1a1a;border-radius:0.25rem;height:16px;overflow:hidden;"><div style="width:${barWidth}%;height:100%;background:#c44a4a;border-radius:0.25rem;"></div></div><span style="color:#ccc;min-width:60px;text-align:right;">${fmtCost(d.cost)}</span></div>`;
        }
        html += `</div>`;
      }

      content.innerHTML = html;
    } catch (err) {
      loading.textContent = "Failed to load spend data.";
      console.error("[hud] loadSpendData error:", err);
    }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Agent prose gets markdown; tool/status/error lines stay literal. */
const RICH_KINDS = new Set<LogEntry["kind"]>(["text", "result", "boss"]);

function renderEntry(entry: LogEntry): string {
  return RICH_KINDS.has(entry.kind) ? md(entry.text) : esc(entry.text);
}
