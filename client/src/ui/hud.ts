import type { Net } from "../net";
import type { FeedItem, PendingInvite, Store } from "../store";
import type { AgentRole, CardStatus, LogEntry, OfficeTheme, Provider, TaskCard, TaskPhase, CharAppearance, MCPServerConfig, PersonalityTraits, AgentInfo, LeaderboardCategory, LeaderboardEntry, DecorationCategory, ChallengeResult } from "../../../shared/types";
import { AGENT_MODELS, OFFICE_THEMES, OFFICE_MANAGER_ID, HERMES_ID, WIZARD_ID, SCHEDULE_PRESETS,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES,
  ACCENT_COLOR_OPTIONS, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
  randomAppearance, DEFAULT_APPEARANCE, isValidAppearance, randomPersonality,
  SUBSCRIPTION_TIER_LIST, type SubscriptionTier,
  DECORATION_CATALOG,
} from "../../../shared/types";
import { md } from "./md";
import { achievements, ACHIEVEMENTS } from "../game/achievements";
import { touchInput, isTouchDevice } from "../touch";
import { generateCharPreviewDataURL } from "../game/chargen";
import { MarketplaceBrowser } from "./marketplace";
import { computeSuggestions } from "./suggestions";
import { createPipelineGraph } from "./pipeline-graph";
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
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
  modal.innerHTML = `
    <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:var(--radius-lg);padding:1.5rem;max-width:360px;width:90vw;text-align:center;font-family:var(--font-body);box-shadow:var(--shadow-lg);">
      <h3 style="margin:0 0 0.5rem;font-size:1.05rem;color:var(--text);">${title}</h3>
      <p style="color:var(--dim);font-size:0.82rem;margin:0 0 1.25rem;line-height:1.4;">${message}</p>
      <div style="display:flex;gap:0.75rem;justify-content:center;">
        <button id="ic-cancel" style="padding:0.5rem 1.25rem;border:1px solid var(--panel-edge);border-radius:var(--radius-sm);background:var(--panel-soft);color:var(--dim);font-size:0.85rem;cursor:pointer;font-family:var(--font-body);">Cancel</button>
        <button id="ic-confirm" style="padding:0.5rem 1.25rem;border:none;border-radius:var(--radius-sm);background:var(--red);color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font-body);">${confirmLabel}</button>
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
  micOn: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>`,
  micOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v5a3 3 0 0 0 5.12 2.12"/><path d="M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><path d="M12 18v4"/><path d="M8 22h8"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`,
  speakerOn: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  speakerOff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  concierge: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21v-1a7 7 0 0 1 14 0v1"/><path d="M9 8h6"/><path d="M12 4v8"/><circle cx="12" cy="8" r="1" fill="var(--green)"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l8 8"/><path d="M11 3l-8 8"/></svg>`,
  trophy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 4H4v3a3 3 0 0 0 3 3"/><path d="M17 4h3v3a3 3 0 0 1-3 3"/></svg>`,
  market: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  rooms: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M14 12h.01"/><path d="M10 12h.01"/></svg>`,
  social: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  terminal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
  worlds: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-9 9"/><path d="M12 21a9 9 0 0 0 9-9"/><path d="M12 7a5 5 0 0 0-5 5"/><path d="M12 17a5 5 0 0 0 5-5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  help: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  signout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>`,
  portal: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>`,
  pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-7.5 8-13a8 8 0 1 0-16 0c0 5.5 8 13 8 13z"/><circle cx="12" cy="9" r="3"/></svg>`,
  alley: `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 28V14l4-6h12l4 6v14"/><path d="M6 14h20"/><path d="M10 8v6M22 8v6"/><path d="M10 20h4M18 20h4"/><path d="M10 24h4M18 24h4"/></svg>`,
  volcano: `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 28l8-16 4 6 4-10 8 20z"/><path d="M12 12c2-3 6-3 8 0"/><path d="M14 8c1-2 3-2 4 0"/><path d="M16 4c1-1 2-1 2 0"/></svg>`,
  columns: `<svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h24"/><path d="M6 10v18M10 10v18M16 10v18M22 10v18M26 10v18"/><path d="M3 28h26"/><path d="M5 6h22l-3 4H8z"/></svg>`,
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
  private pipelineView = false;
  private dashboardView = false;
  private decomposeView = false;
  private experimentView = false;
  private decorationView = false;
  private techTreeView = false;
  private socialView = false;
  private challengeView = false;
  private dashboardPollTimer: ReturnType<typeof setInterval> | null = null;
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
        <button class="btn mini topbar-btn" id="marketplace-btn">${ICON.market} <span>MARKET</span></button>
        <button class="btn mini topbar-btn" id="rooms-btn">${ICON.rooms} <span>ROOMS</span></button>
        <button class="btn mini topbar-btn" id="social-btn">${ICON.social} <span>SOCIAL</span></button>
        <button class="btn mini topbar-btn" id="ide-bridge-btn">${ICON.terminal} <span>IDE</span></button>
        <button class="btn mini topbar-btn" id="worlds-btn">${ICON.worlds} <span>WORLDS</span></button>
        <button class="btn mini topbar-btn" id="voice-btn" title="Toggle microphone">${ICON.micOff}</button>
        <button class="btn mini topbar-btn" id="speaker-btn" title="Toggle speaker (mute/unmute incoming audio)">${ICON.speakerOn}</button>
        <button class="btn mini topbar-btn" id="settings-btn">${ICON.settings} <span>SETTINGS</span></button>
        <button class="btn mini topbar-btn" id="help-btn" title="How to play">${ICON.help} <span>HELP</span></button>
        <span id="user-menu" style="display:none; margin-left:auto; align-items:center; gap:0.5rem;">
          <span id="user-email" style="font-size:0.75rem; color:var(--dim); white-space:nowrap;"></span>
          <button class="btn mini topbar-btn" id="signout-btn" title="Sign out" style="font-size:0.75rem;">${ICON.signout}</button>
        </span>
        <span id="conn" class="conn">●</span>
      </div>
      <div id="seasonal-banner" style="display:none;"></div>
      <div class="stats-bar" id="stats-bar"></div>
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
        <div id="d-growth-section" hidden></div>
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
      <div class="modal-backdrop" id="subscribe-modal" hidden></div>
      <div class="modal-backdrop" id="away-report-modal" hidden></div>
      <div class="board-panel" id="board-panel" hidden>
        <div class="panel-title" id="board-titlebar">
          <span>TASK BOARD</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button class="btn" id="pipeline-toggle" hidden style="font-size: 11px; padding: 2px 8px;">⚙ Pipeline</button>
            <button class="btn" id="dashboard-toggle" hidden style="font-size: 11px; padding: 2px 8px;">📊 Dashboard</button>
            <button class="btn" id="decompose-toggle" hidden style="font-size: 11px; padding: 2px 8px;">🧩 Decompose</button>
            <button class="btn" id="experiment-toggle" hidden style="font-size: 11px; padding: 2px 8px;">🧪 Log</button>
            <button class="btn" id="decoration-toggle" hidden style="font-size: 11px; padding: 2px 8px;">🪑 Decorate</button>
            <button class="btn" id="techtree-toggle" hidden style="font-size: 11px; padding: 2px 8px;">🌳 Tech Tree</button>
            <button class="btn" id="social-toggle" hidden style="font-size: 11px; padding: 2px 8px;">💬 Social</button>
            <button class="btn" id="challenge-toggle" hidden style="font-size: 11px; padding: 2px 8px;">🏆 Challenge</button>
            <button class="x" id="board-close">✕</button>
          </div>
        </div>
        <div class="board-columns" id="board-columns"></div>
        <div id="pipeline-view" hidden style="height: calc(100% - 100px);"></div>
        <div id="dashboard-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="decompose-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="experiment-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="decoration-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="techtree-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="social-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div id="challenge-view" hidden style="height: calc(100% - 100px); overflow-y: auto; padding: 12px;"></div>
        <div class="board-add" id="board-add-section">
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
      <div class="concierge-bubble" id="concierge-bubble" hidden>
        <span class="concierge-avatar">${ICON.concierge}</span>
        <span class="concierge-text" id="concierge-text"></span>
        <button class="concierge-action btn mini" id="concierge-action" hidden></button>
        <button class="concierge-close" id="concierge-close">${ICON.close}</button>
      </div>
      <div class="next-steps" id="next-steps" hidden>
        <div class="next-steps-title">NEXT STEPS</div>
        <div class="next-steps-list" id="next-steps-list"></div>
      </div>
      <div class="hint">WASD/arrows move · E talk/board · H hire · F feed · B board · G gantt · N v-model · V voice · M manage projector · I inventory · click an agent · ESC close · scroll to zoom</div>
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
          <button class="mobile-action-btn" id="ma-voice" title="Voice chat">${ICON.micOff}</button>
          <button class="mobile-action-btn" id="ma-teleport" title="Teleport">Q</button>
        </div>
      </div>
      <div id="server-restart-overlay" style="display:none; position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; flex-direction:column; gap:1rem; backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);">
        <div style="font-size:1.5rem; font-weight:bold; color:var(--text); font-family:var(--font-body); display:flex; align-items:center; gap:0.6rem;">
          <svg width="28" height="28" viewBox="0 0 48 48" style="animation: restart-spin 1.2s linear infinite;" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M38.8 18.6a16 16 0 1 0 1.2 6.4"/>
            <path d="M40 6v12h-12"/>
          </svg>
          Office Update In Progress
        </div>
        <div style="font-size:0.9rem; color:var(--dim); font-family:var(--font-body);">Your agents will resume their tasks shortly…</div>
        <div style="width:120px; height:4px; background:var(--panel-edge-soft); border-radius:2px; overflow:hidden;">
          <div style="width:40%; height:100%; background:var(--accent); border-radius:2px; animation: restart-pulse 1.2s ease-in-out infinite;"></div>
        </div>
      </div>
    `;

    document.getElementById("hire-btn")!.addEventListener("click", () => this.openHireModal());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());
    document.getElementById("help-btn")!.addEventListener("click", () => this.showIntroGuide());
    document.getElementById("concierge-close")!.addEventListener("click", () => {
      const nudge = this.store.conciergeNudge;
      if (nudge) this.dismissConcierge(nudge.nudgeId);
    });
    document.getElementById("rooms-btn")!.addEventListener("click", () => {
      this.net.send({ type: "list_orgs" });
      this.openRoomsPanel();
    });
    document.getElementById("social-btn")!.addEventListener("click", () => {
      this.net.send({ type: "list_friends" });
      this.net.send({ type: "list_online_players" });
      this.openSocialPanel();
    });
    document.getElementById("ide-bridge-btn")!.addEventListener("click", () => {
      this.openIdeBridgePanel();
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
        modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
        modal.innerHTML = `
          <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:var(--radius-lg);padding:1.5rem;max-width:340px;width:90vw;text-align:center;box-shadow:var(--shadow-lg);font-family:var(--font-body);">
            <h3 style="margin:0 0 0.5rem;font-size:1.1rem;color:var(--text);">Sign out of your office?</h3>
            <p style="color:var(--dim);font-size:0.85rem;margin:0 0 1.25rem;">Your agents will keep working, but you'll need to sign back in to manage them.</p>
            <div style="display:flex;gap:0.75rem;justify-content:center;">
              <button id="signout-cancel" class="btn" style="padding:0.6rem 1.2rem;border-radius:var(--radius-sm);border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--dim);cursor:pointer;">Cancel</button>
              <button id="signout-confirm" class="btn danger" style="padding:0.6rem 1.2rem;border-radius:var(--radius-sm);border:none;background:var(--red);color:#fff;font-weight:600;cursor:pointer;">Sign out</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector("#signout-cancel")!.addEventListener("click", () => modal.remove());
        modal.querySelector("#signout-confirm")!.addEventListener("click", async () => {
          const confirmBtn = modal.querySelector("#signout-confirm") as HTMLButtonElement;
          const cancelBtn = modal.querySelector("#signout-cancel") as HTMLButtonElement;
          confirmBtn.disabled = true;
          cancelBtn.disabled = true;
          confirmBtn.textContent = "Signing out…";
          this.net.disconnect();
          await signOut();
          this.store.reset();
          document.getElementById("hud")!.style.display = "none";
          modal.remove();
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
    store.onPaymentRequired((reason, message) => {
      if (reason === "subscription") this.showSubscribeModal(message);
    });
    store.outfitUpdateListeners.push(() => {
      if (this.store.wardrobeOpen) this.refreshOutfitList();
    });
    achievements.onUnlock((def) => {
      this.toast(`${def.name} — ${def.desc}`, ICON.trophy);
    });

    // Leaderboard results from server
    store.leaderboardListeners.push((entries) => {
      this.onLeaderboardResult(entries);
    });

    // Concierge nudges from Office Manager
    store.conciergeListeners.push(() => {
      this.showConciergeNudge();
    });

    // Aspiration onboarding quiz
    store.aspirationQuizListeners.push(() => {
      this.showAspirationQuiz();
    });

    // Aspiration dashboard data updates — re-render if tab is active
    store.aspirationDashboardListeners.push(() => {
      if (this._achTab === "aspiration") {
        this.renderAchievements();
      }
    });

    // A/B comparison result — re-render experiment view if active
    store.abComparisonListeners.push(() => {
      if (this.experimentView) this.renderExperimentView(document.getElementById("experiment-view")!);
    });

    // Efficiency score — re-render dashboard if active
    store.efficiencyScoreListeners.push(() => {
      if (this.dashboardView) this.renderAutomationDashboard(document.getElementById("dashboard-view")!);
    });

    // Resource allocation — re-render if dashboard is active
    store.resourceAllocationListeners.push(() => {
      if (this.dashboardView) this.renderAutomationDashboard(document.getElementById("dashboard-view")!);
    });

    // Fulfillment stats — re-render dashboard if active
    store.fulfillmentListeners.push(() => {
      if (this.dashboardView) this.renderAutomationDashboard(document.getElementById("dashboard-view")!);
    });

    // Decomposition stream from Office Manager
    store.decomposingListeners.push(() => {
      this.renderDecomposingPanel();
    });

    // Away report — shown on reconnect after >2h absence
    store.awayReportListeners.push(() => {
      this.showAwayReport();
    });

    // Next Steps panel — recompute on store changes
    store.subscribe(() => {
      this.renderNextSteps();
      this.renderDecomposingPanel();
    });

    // Platform connection nudges
    store.platformNudgeListeners.push((kind, agentName) => {
      if (kind === "first_hire") {
        this.toast(`Want ${agentName} to ping you on Slack or Telegram when tasks are done? Connect a platform in settings →`);
        setTimeout(() => this.showIntentModal(), 2000);
      } else {
        this.toast(`${agentName} finished their first task! Want notifications on your phone? Connect Telegram in settings →`);
      }
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

    store.onInitialData(() => this.maybeOnboard());
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
          el.style.color = "var(--red)";
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

    // Pipeline graph toggle — only visible when unlocked
    document.getElementById("pipeline-toggle")!.addEventListener("click", () => {
      this.pipelineView = !this.pipelineView;
      if (this.pipelineView) { this.dashboardView = false; this.challengeView = false; }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Automation dashboard toggle — only visible when unlocked
    document.getElementById("dashboard-toggle")!.addEventListener("click", () => {
      this.dashboardView = !this.dashboardView;
      if (this.dashboardView) { this.pipelineView = false; this.decomposeView = false; this.experimentView = false; this.decorationView = false; this.techTreeView = false; this.socialView = false; this.challengeView = false; }
      if (this.dashboardView) this.startDashboardPolling();
      else this.stopDashboardPolling();
      this.renderBoard();
    });

    // Decomposition mode toggle — only visible when unlocked
    document.getElementById("decompose-toggle")!.addEventListener("click", () => {
      this.decomposeView = !this.decomposeView;
      if (this.decomposeView) { this.pipelineView = false; this.dashboardView = false; this.experimentView = false; this.decorationView = false; this.techTreeView = false; this.socialView = false; this.challengeView = false; }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Experiment log toggle — only visible when unlocked
    document.getElementById("experiment-toggle")!.addEventListener("click", () => {
      this.experimentView = !this.experimentView;
      if (this.experimentView) {
        this.pipelineView = false; this.dashboardView = false; this.decomposeView = false; this.decorationView = false; this.techTreeView = false; this.socialView = false; this.challengeView = false;
        this.net.send({ type: "request_experiment_log" });
      }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Decoration mode toggle — only visible when unlocked
    document.getElementById("decoration-toggle")!.addEventListener("click", () => {
      this.decorationView = !this.decorationView;
      if (this.decorationView) {
        this.pipelineView = false; this.dashboardView = false; this.decomposeView = false; this.experimentView = false; this.techTreeView = false; this.socialView = false; this.challengeView = false;
        this.net.send({ type: "request_decorations" });
      }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Tech tree toggle — only visible when unlocked
    document.getElementById("techtree-toggle")!.addEventListener("click", () => {
      this.techTreeView = !this.techTreeView;
      if (this.techTreeView) {
        this.pipelineView = false; this.dashboardView = false; this.decomposeView = false; this.experimentView = false; this.decorationView = false; this.socialView = false; this.challengeView = false;
        this.net.send({ type: "request_office_progress" });
      }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Social toggle — visible when visiting another user's office
    document.getElementById("social-toggle")!.addEventListener("click", () => {
      this.socialView = !this.socialView;
      if (this.socialView) {
        this.pipelineView = false; this.dashboardView = false; this.decomposeView = false; this.experimentView = false; this.decorationView = false; this.techTreeView = false; this.challengeView = false;
        const ownerId = this.store.roomOwnerId;
        if (ownerId) this.net.send({ type: "request_office_social", officeOwnerId: ownerId });
      }
      this.stopDashboardPolling();
      this.renderBoard();
    });

    // Challenge toggle — visible when optimization challenges unlocked
    document.getElementById("challenge-toggle")!.addEventListener("click", () => {
      this.challengeView = !this.challengeView;
      if (this.challengeView) {
        this.pipelineView = false; this.dashboardView = false; this.decomposeView = false; this.experimentView = false; this.decorationView = false; this.techTreeView = false; this.socialView = false;
        if (!this.store.activeChallenge) {
          this.net.send({ type: "request_challenge" });
        }
      }
      this.stopDashboardPolling();
      this.renderBoard();
    });
  }

  private startDashboardPolling(): void {
    // ... (rest of the code remains the same)
    this.stopDashboardPolling();
    this.net.send({ type: "request_automation_stats" });
    this.dashboardPollTimer = setInterval(() => {
      this.net.send({ type: "request_automation_stats" });
    }, 5000);
  }

  private stopDashboardPolling(): void {
    if (this.dashboardPollTimer) {
      clearInterval(this.dashboardPollTimer);
      this.dashboardPollTimer = null;
    }
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
        this.voiceBtn.innerHTML = ICON.micOff;
        this.voiceBtn.style.color = "";
      }
      const maVoice = document.getElementById("ma-voice");
      if (maVoice) { maVoice.innerHTML = ICON.micOff; maVoice.classList.remove("primary"); }
    } else {
      // Mic off → enable mic (upgrades from listen-only to full voice)
      voice.start().then(() => {
        if (this.voiceBtn) {
          this.voiceBtn.innerHTML = ICON.micOn;
          this.voiceBtn.style.color = "var(--green)";
        }
        const maVoice = document.getElementById("ma-voice");
        if (maVoice) { maVoice.innerHTML = ICON.micOn; maVoice.classList.add("primary"); }
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
      this.speakerBtn.innerHTML = newMuted ? ICON.speakerOff : ICON.speakerOn;
      this.speakerBtn.style.color = newMuted ? "var(--red)" : "";
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
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
    modal.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:var(--radius-lg);padding:1.5rem;max-width:420px;width:90vw;color:var(--text);box-shadow:var(--shadow-lg);font-family:var(--font-body);">
        <h3 style="margin:0 0 0.5rem;font-size:1.1rem;color:var(--red);">${title}</h3>
        <p style="margin:0 0 1rem;font-size:0.85rem;color:var(--dim);line-height:1.4;">${reason}</p>
        <ol style="margin:0 0 1rem;padding-left:1.2rem;font-size:0.85rem;color:var(--text);line-height:1.6;">${steps}</ol>
        ${settingsUrl ? `<div style="margin-bottom:1rem;"><input id="mic-url-input" readonly value="${settingsUrl}" style="width:100%;padding:0.4rem 0.6rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:var(--radius-sm);color:var(--accent);font-size:0.8rem;font-family:var(--font-mono);" /><button id="mic-copy-btn" style="margin-top:0.4rem;padding:0.3rem 0.8rem;border:1px solid var(--accent);background:transparent;color:var(--accent);border-radius:var(--radius-sm);cursor:pointer;font-size:0.75rem;font-family:var(--font-body);">Copy URL</button></div>` : ""}
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button id="mic-close-btn" style="padding:0.5rem 1rem;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--dim);border-radius:var(--radius-sm);cursor:pointer;font-size:0.8rem;font-family:var(--font-body);">Close</button>
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
      const subscribe = document.getElementById("subscribe-modal")!;
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
        subscribe.hidden = true;
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
      if (!hire.hidden || !settings.hidden || !onboard.hidden || !ach.hidden || !hof.hidden || !wardrobe.hidden || !railway.hidden || !github.hidden || !codeEditor.hidden || !worlds.hidden || !forge.hidden || !fuse.hidden || !subscribe.hidden) return;
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
      <div class="modal onboard" style="max-width: 520px; max-height: 85vh; overflow-y: auto;">
        <h1 style="font-size: 1.4rem;">WHAT DO YOU DO?</h1>
        <p class="sub" style="margin-bottom: 1rem;">Tell us about your work and the tools you use. We'll find the right agents for your stack.</p>
        <textarea id="ob-prompt-text" rows="4" placeholder="e.g. I'm a backend developer. We use GitHub, Sentry, Grafana, deploy on Vercel, and track issues in Linear." style="width: 100%; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid var(--panel-edge); background: var(--panel-soft); color: var(--text); font-size: 0.9rem; font-family: inherit; resize: vertical; box-sizing: border-box; outline: none;"></textarea>
        <div id="ob-prompt-status" style="min-height: 1.5rem; text-align: center; color: var(--dim); font-size: 0.8rem; margin-top: 0.5rem;"></div>
        <div id="ob-prompt-results" style="margin-top: 0.5rem; max-height: 220px; overflow-y: auto;"></div>
        <div id="ob-prompt-actions" style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
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
      statusEl.textContent = "Finding agents for your stack…";
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

      // Auto-hire all button
      const autoHireAllBtn = document.createElement("button");
      autoHireAllBtn.className = "btn primary";
      autoHireAllBtn.style.cssText = "width:100%;margin-bottom:0.5rem;padding:0.6rem;font-size:0.85rem;";
      autoHireAllBtn.textContent = `🚁 HIRE ALL ${recommendations.length} AGENT${recommendations.length > 1 ? "S" : ""}`;
      autoHireAllBtn.addEventListener("click", async () => {
        autoHireAllBtn.disabled = true;
        autoHireAllBtn.textContent = "Hiring all…";
        let hired = 0;
        for (const rec of recommendations) {
          try {
            const res = await fetch(`/api/marketplace/agent?id=${encodeURIComponent(rec.agentId)}`);
            if (!res.ok) continue;
            const agent = await res.json() as MarketplaceAgent;
            this.hireFromMarketplace(agent);
            hired++;
          } catch { /* skip failures */ }
        }
        autoHireAllBtn.textContent = `Hired ${hired}/${recommendations.length}! 🚁`;
        autoHireAllBtn.style.background = "var(--green)";
        autoHireAllBtn.style.color = "#fff";
        autoHireAllBtn.style.borderColor = "var(--green)";
        if (hired > 0) {
          setTimeout(() => {
            this.toast(`${hired} agent${hired > 1 ? "s" : ""} hired! They'll arrive by helicopter.`);
          }, 500);
        }
      });
      resultsEl.appendChild(autoHireAllBtn);

      for (const rec of recommendations) {
        const card = document.createElement("div");
        card.style.cssText = `
          display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem;
          margin-bottom: 0.4rem; border: 1px solid var(--panel-edge); border-radius: var(--radius-sm);
          background: var(--panel-soft); transition: border-color 0.15s;
        `;
        card.addEventListener("mouseenter", () => { card.style.borderColor = "var(--accent)"; });
        card.addEventListener("mouseleave", () => { card.style.borderColor = "var(--panel-edge)"; });

        const avatar = rec.image_url
          ? `<img src="${rec.image_url}" style="width:36px;height:36px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'" />`
          : `<div style="width:36px;height:36px;border-radius:0.375rem;background:var(--accent-light);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);flex-shrink:0;">${rec.name.charAt(0).toUpperCase()}</div>`;

        card.innerHTML = `
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.15rem; color:var(--text);">${this.escape(rec.name)}</div>
            <div style="font-size:0.72rem; color:var(--dim); margin-bottom:0.2rem;">${this.escape(rec.summary.slice(0, 80))}</div>
            <div style="font-size:0.7rem; color:var(--green); line-height:1.3;">${this.escape(rec.reason)}</div>
          </div>
          ${avatar}
        `;

        const hireBtn = document.createElement("button");
        hireBtn.textContent = "HIRE";
        hireBtn.style.cssText = `
          flex-shrink: 0; padding: 0.35rem 0.75rem; border: 1px solid var(--panel-edge); border-radius: var(--radius-sm);
          background: var(--panel); color: var(--text); font-size: 0.75rem; font-weight: 600; cursor: pointer;
          align-self: center; font-family: var(--font-body);
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
            hireBtn.style.background = "var(--green)";
            hireBtn.style.color = "#fff";
            hireBtn.style.borderColor = "var(--green)";
          } catch {
            hireBtn.textContent = "Failed";
            hireBtn.style.background = "var(--red)";
            hireBtn.style.color = "#fff";
            hireBtn.style.borderColor = "var(--red)";
            setTimeout(() => { hireBtn.disabled = false; hireBtn.textContent = "HIRE"; hireBtn.style.background = "var(--panel)"; hireBtn.style.color = "var(--text)"; hireBtn.style.borderColor = "var(--panel-edge)"; }, 2000);
          }
        });
        card.appendChild(hireBtn);
        resultsEl.appendChild(card);
      }

      // Add Search Again + Enter Office buttons in the action row
      const actionsEl = modal.querySelector("#ob-prompt-actions") as HTMLDivElement;
      actionsEl.innerHTML = "";

      const againBtn = document.createElement("button");
      againBtn.className = "btn";
      againBtn.style.cssText = "flex:1;";
      againBtn.textContent = "↻ SEARCH AGAIN";
      againBtn.addEventListener("click", () => {
        resultsEl.innerHTML = "";
        statusEl.textContent = "";
        textarea.value = "";
        textarea.focus();
        actionsEl.innerHTML = "";
        const skipBtn2 = document.createElement("button");
        skipBtn2.className = "btn";
        skipBtn2.style.cssText = "flex:1;";
        skipBtn2.textContent = "SKIP";
        skipBtn2.addEventListener("click", finish);
        const goBtn2 = document.createElement("button");
        goBtn2.className = "btn primary";
        goBtn2.style.cssText = "flex:1;";
        goBtn2.textContent = "FIND AGENTS ▶";
        goBtn2.addEventListener("click", submit);
        actionsEl.appendChild(skipBtn2);
        actionsEl.appendChild(goBtn2);
      });

      const enterBtn = document.createElement("button");
      enterBtn.className = "btn primary";
      enterBtn.style.cssText = "flex:1;";
      enterBtn.textContent = "ENTER OFFICE ▶";
      enterBtn.addEventListener("click", finish);

      actionsEl.appendChild(againBtn);
      actionsEl.appendChild(enterBtn);
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

  // ----------------------------------------------------- intent modal (post-first-hire)

  private showIntentModal(): void {
    if (localStorage.getItem("ah-intent-seen")) return;
    localStorage.setItem("ah-intent-seen", "1");

    const modal = document.getElementById("onboard-modal")!;
    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal onboard" style="max-width: 440px;">
        <h1 style="font-size: 1.2rem;">What are you trying to do?</h1>
        <p class="sub" style="margin-bottom: 1rem;">You've got your first agent. Tell us your goal so we can help you get there faster.</p>
        <div id="intent-options" style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button class="btn intent-opt" data-intent="research" style="text-align: left; padding: 0.75rem 1rem;">🔬 Research &amp; Analysis</button>
          <button class="btn intent-opt" data-intent="coding" style="text-align: left; padding: 0.75rem 1rem;">💻 Software Development</button>
          <button class="btn intent-opt" data-intent="marketing" style="text-align: left; padding: 0.75rem 1rem;">📣 Marketing &amp; Content</button>
          <button class="btn intent-opt" data-intent="finance" style="text-align: left; padding: 0.75rem 1rem;">💰 Finance &amp; Data</button>
          <button class="btn intent-opt" data-intent="general" style="text-align: left; padding: 0.75rem 1rem;">🤔 Just exploring</button>
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <button class="btn" id="intent-skip" style="flex: 1;">SKIP</button>
        </div>
      </div>
    `;

    const close = () => { modal.hidden = true; };

    modal.querySelector("#intent-skip")!.addEventListener("click", close);

    modal.querySelectorAll(".intent-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const intent = (btn as HTMLButtonElement).dataset.intent ?? "general";
        this.net.send({ type: "set_stated_intent", intent });
        close();
      });
    });
  }

  // --------------------------------------------------------------- intro guide

  private tourActive = false;
  private tourCleanup: (() => void) | null = null;

  private showIntroGuide(): void {
    if (this.tourActive) return;
    this.tourActive = true;
    localStorage.setItem("agent-heights-intro-seen", "1");

    const svgIcon = (paths: string, color: string) =>
      `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

    type TourStep = {
      icon: string;
      title: string;
      body: string;
      targetId?: string;
      cameraTarget?: "hermes" | "mailboxes" | "officeManager";
    };

    const steps: TourStep[] = [
      {
        icon: svgIcon('<path d="M3 21h18"/><path d="M5 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/>', "var(--green)"),
        title: "Welcome to Agent Heights",
        body: "You're the boss of a virtual office full of <strong>real AI agents</strong>. Each employee at a desk is a live AI that reads, writes, and runs code. Your job: hire them, give them tasks, and watch them work. Let's take a quick tour.",
      },
      {
        icon: svgIcon('<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>', "var(--amber)"),
        title: "Hire Your First Agent",
        body: "Click <strong>+ HIRE AGENT</strong> to create a custom agent from scratch — pick a name, role, and personality. Or browse the <strong>MARKET</strong> for pre-built agents with specialized skills.",
        targetId: "hire-btn",
      },
      {
        icon: svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', "var(--amber)"),
        title: "The Marketplace",
        body: "The <strong>MARKET</strong> button opens the agent marketplace. Browse ready-to-hire AI agents, or search 22,000+ <strong>MCP servers</strong> to give your agents new tools — file access, API integrations, databases, and more.",
        targetId: "marketplace-btn",
      },
      {
        icon: svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', "var(--accent)"),
        title: "Your Office Manager",
        body: "The <strong>Office Manager</strong> runs the day-to-day — she can hire agents, reorganize desks, and manage your office layout. Click her desk to interact.",
        cameraTarget: "officeManager",
      },
      {
        icon: svgIcon('<path d="M3 21h18"/><path d="M5 21V7l8-4 8 4v14"/><path d="M9 21v-6h6v6"/>', "var(--green)"),
        title: "Meet Hermes",
        body: "The agent at the front desk is <strong>Hermes</strong> — your office concierge. Hermes can relay messages to other agents, manage your calendar, and connect to external platforms like Slack, Discord, and Telegram. Click Hermes to start a conversation anytime.",
        cameraTarget: "hermes",
      },
      {
        icon: svgIcon('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', "var(--green)"),
        title: "Office Feed",
        body: "The <strong>Office Feed</strong> streams real-time activity from all your agents — tool calls, output, and status changes. Type a task here to assign it to everyone at once.",
        targetId: "feed",
      },
      {
        icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>', "var(--accent)"),
        title: "Help & Shortcuts",
        body: "Click <strong>? HELP</strong> anytime to replay this tour. Use <strong>WASD</strong> or arrows to walk, <strong>E</strong> to interact, <strong>scroll</strong> to zoom. That's it — you're ready to build your team!",
        targetId: "help-btn",
      },
    ];

    let current = 0;
    let overlay: HTMLElement | null = null;
    let card: HTMLElement | null = null;
    let highlightedEl: HTMLElement | null = null;
    let savedPosition: string | null = null;
    let cameraRestored = false;

    const restoreCamera = () => {
      if (cameraRestored) return;
      cameraRestored = true;
      const scene = this.store.sceneRef as any;
      if (scene?.cameras?.main && scene?.player) {
        scene.cameras.main.startFollow(scene.player, false, 0.1, 0.1);
        scene.cameras.main.setZoom(scene.defaultZoom?.() ?? 1);
      }
    };

    const panCameraTo = (target: "hermes" | "mailboxes" | "officeManager") => {
      const scene = this.store.sceneRef as any;
      if (!scene?.cameras?.main) return;
      cameraRestored = false;
      const cam = scene.cameras.main;
      let px = 0, py = 0;
      if (target === "hermes" && scene.hermes?.container) {
        px = scene.hermes.container.x;
        py = scene.hermes.container.y;
      } else if (target === "officeManager" && scene.officeManager?.container) {
        px = scene.officeManager.container.x;
        py = scene.officeManager.container.y;
      } else if (target === "mailboxes" && scene.platformMailboxes?.[0]?.tile) {
        const t = scene.platformMailboxes[0].tile;
        const tilePx = scene.TILE_PX ?? 32;
        px = t.x * tilePx + tilePx / 2;
        py = t.y * tilePx + tilePx / 2;
      } else {
        return;
      }
      cam.stopFollow();
      cam.pan(px, py, 800, "Cubic.easeInOut");
    };

    const clearHighlight = () => {
      if (highlightedEl) {
        highlightedEl.classList.remove("tour-highlight");
        if (savedPosition !== null) {
          highlightedEl.style.position = savedPosition;
          savedPosition = null;
        }
        highlightedEl = null;
      }
    };

    const positionCard = (targetEl: HTMLElement) => {
      if (!card) return;
      const rect = targetEl.getBoundingClientRect();
      const cardW = 320;
      const cardH = card.offsetHeight || 160;
      const gap = 16;
      const margin = 10;

      let left = rect.left + rect.width / 2 - cardW / 2;
      let top = rect.bottom + gap;

      if (top + cardH > window.innerHeight - margin) {
        top = rect.top - cardH - gap;
      }
      if (top < margin) {
        top = rect.bottom + gap;
      }
      if (left + cardW > window.innerWidth - margin) {
        left = window.innerWidth - cardW - margin;
      }
      if (left < margin) left = margin;

      card.style.transform = "none";
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    };

    const cleanup = () => {
      clearHighlight();
      restoreCamera();
      if (overlay) { overlay.remove(); overlay = null; }
      if (card) { card.remove(); card = null; }
      this.tourActive = false;
      this.tourCleanup = null;
    };
    this.tourCleanup = cleanup;

    const render = () => {
      const step = steps[current];

      if (current === 0) {
        if (card) { card.remove(); card = null; }
        if (!overlay) {
          overlay = document.createElement("div");
          overlay.className = "intro-overlay";
          document.body.appendChild(overlay);
        }
        overlay.innerHTML = `<div class="intro-modal"></div>`;
        const modal = overlay.querySelector(".intro-modal") as HTMLDivElement;
        modal.innerHTML = `
          <div class="intro-icon">${step.icon}</div>
          <h2 class="intro-title">${step.title}</h2>
          <p class="intro-body">${step.body}</p>
          <div class="intro-dots">
            ${steps.map((_, i) => `<span class="intro-dot${i === current ? " active" : ""}"></span>`).join("")}
          </div>
          <div class="intro-actions">
            <span></span>
            <button class="btn primary" id="intro-next">NEXT ▶</button>
          </div>
          <button class="intro-skip" id="intro-skip">Skip tour</button>
        `;
        const next = modal.querySelector("#intro-next");
        if (next) next.addEventListener("click", () => { current++; render(); });
        const skip = modal.querySelector("#intro-skip");
        if (skip) skip.addEventListener("click", cleanup);
        return;
      }

      if (overlay) { overlay.remove(); overlay = null; }

      clearHighlight();

      if (step.targetId) {
        const el = document.getElementById(step.targetId);
        if (el) {
          const computed = getComputedStyle(el).position;
          if (computed === "static") {
            savedPosition = el.style.position;
            el.style.position = "relative";
          } else {
            savedPosition = null;
          }
          el.classList.add("tour-highlight");
          highlightedEl = el;
        }
      }

      if (step.cameraTarget) {
        panCameraTo(step.cameraTarget);
      } else {
        restoreCamera();
      }

      if (!card) {
        card = document.createElement("div");
        card.className = "tour-card";
        document.body.appendChild(card);
      }

      card.innerHTML = `
        <div class="tour-card-title">${step.icon} ${step.title}</div>
        <p class="tour-card-body">${step.body}</p>
        <div class="tour-card-actions">
          <div class="tour-dots">
            ${steps.map((_, i) => `<span class="tour-dot${i === current ? " active" : ""}"></span>`).join("")}
          </div>
          <div class="tour-btns">
            ${current > 0 ? '<button class="btn" id="tour-back">◀</button>' : ""}
            ${current < steps.length - 1
              ? '<button class="btn primary" id="tour-next">NEXT ▶</button>'
              : '<button class="btn primary" id="tour-done">LET\'S GO ▶</button>'}
          </div>
        </div>
        <button class="tour-skip" id="tour-skip">Skip tour</button>
      `;

      if (step.targetId) {
        const el = document.getElementById(step.targetId);
        if (el) positionCard(el);
        else { card.style.left = "50%"; card.style.top = "50%"; card.style.transform = "translate(-50%, -50%)"; }
      } else if (step.cameraTarget) {
        card.style.transform = "translateX(-50%)";
        card.style.left = "50%";
        card.style.top = `calc(100vh - ${card.offsetHeight + 24}px)`;
      } else {
        card.style.left = "50%";
        card.style.top = "50%";
        card.style.transform = "translate(-50%, -50%)";
      }

      const next = card.querySelector("#tour-next");
      if (next) next.addEventListener("click", () => { current++; render(); });
      const back = card.querySelector("#tour-back");
      if (back) back.addEventListener("click", () => { current--; render(); });
      const done = card.querySelector("#tour-done");
      if (done) done.addEventListener("click", cleanup);
      const skip = card.querySelector("#tour-skip");
      if (skip) skip.addEventListener("click", cleanup);
    };

    render();
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

    return `<div style="margin-top:0.6rem; padding:0.5rem; border:1px solid var(--panel-edge); border-radius:var(--radius-sm); background:var(--panel-soft);">
      <div style="display:flex; align-items:center; gap:0.3rem; margin-bottom:0.3rem;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span style="font-size:0.65rem; font-weight:600; color:var(--amber);">ROOM SECURITY SUMMARY</span>
      </div>
      ${agentsWithMcp.length > 0 ? `<div style="font-size:0.62rem; color:var(--dim); margin-bottom:0.2rem;">${agentsWithMcp.length} agent${agentsWithMcp.length !== 1 ? "s" : ""} with API access: ${esc(mcpSummary)}</div>` : ""}
      ${restrictedAgents.length > 0
        ? `<div style="font-size:0.62rem; color:var(--dim);">${restrictedAgents.length} agent${restrictedAgents.length !== 1 ? "s" : ""} access-restricted (ACL). Visitor can chat with ${unrestrictedCount} agent${unrestrictedCount !== 1 ? "s" : ""}.</div>`
        : agentsWithMcp.length > 0
          ? `<div style="font-size:0.62rem; color:var(--dim);">No agents are ACL-restricted. Consider restricting sensitive agents before inviting.</div>`
          : ""}
    </div>`;
  }

  private openIdeBridgePanel(): void {
    const existing = document.getElementById("ide-bridge-overlay");
    if (existing) { existing.remove(); return; }

    const overlay = document.createElement("div");
    overlay.id = "ide-bridge-overlay";
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";

    const sessions = [...this.store.externalSessions.values()];
    const orgSessions = [...this.store.orgExternalSessions.values()];
    const token = this.net.getToken();
    const wsHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? `ws://${window.location.hostname}:3001`
      : `wss://${window.location.host}`;
    const visibility = this.store.ideBridgeVisibility;
    const velocityTrends = this.store.velocityTrends;
    const standupSummary = this.store.standupSummary;
    const anomalyAlerts = this.store.anomalyAlerts;

    const stateBadge = (state: string) => {
      const colors: Record<string, string> = { active: "var(--accent)", idle: "var(--dim)", error: "#ff4a4a", disconnected: "var(--panel-edge)" };
      return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors[state] ?? colors.idle};margin-right:0.4rem;"></span>${state}`;
    };

    const toolLabel: Record<string, string> = {
      "claude-code": "Claude Code", "codex": "Codex", "aider": "Aider",
      "vscode": "VS Code", "cursor": "Cursor", "windsurf": "Windsurf", "unknown": "Terminal",
    };

    const sessionHtml = sessions.length === 0
      ? `<div style="color:var(--dim);text-align:center;padding:2rem;">No active external sessions.<br>Connect a CLI tool to see it here.</div>`
      : sessions.map(s => {
          const fileShort = s.currentFile ? s.currentFile.split("/").pop() : "—";
          const branchTag = s.gitBranch ? ` <span style="color:var(--dim);">[${s.gitBranch}]</span>` : "";
          const recentEvents = s.events.slice(-5).map(e => {
            const icons: Record<string, string> = {
              file_edit: "✏️", file_save: "💾", git_commit: "📦", git_branch: "🌿",
              test_run: "🧪", test_result: e.success ? "✅" : "❌", command: "⚙️",
              ai_completion: "🤖", ai_chat: "💬", session_start: "▶️", session_end: "⏹️", error: "⚠️",
            };
            const time = new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return `<div style="font-size:0.7rem;color:var(--dim);padding:0.1rem 0;">${icons[e.type] ?? "•"} ${time} ${e.type}${e.file ? ` ${e.file.split("/").pop()}` : ""}${e.message ? ` — ${e.message.slice(0, 60)}` : ""}</div>`;
          }).join("");
          return `
            <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:6px;padding:0.8rem;margin-bottom:0.6rem;">
              <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
                <span style="font-size:0.9rem;font-weight:600;color:var(--text);">${toolLabel[s.tool] ?? "Terminal"}</span>
                ${branchTag}
                <span style="margin-left:auto;font-size:0.75rem;">${stateBadge(s.state)}</span>
              </div>
              <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">📂 ${fileShort}</div>
              <div style="font-size:0.7rem;color:var(--dim);margin-bottom:0.4rem;">
                ${s.filesChanged} files · +${s.linesAdded} / -${s.linesRemoved} lines
              </div>
              <div style="border-top:1px solid var(--panel-edge);padding-top:0.4rem;">
                ${recentEvents || '<div style="font-size:0.7rem;color:var(--dim);">No recent events</div>'}
              </div>
            </div>`;
        }).join("");

    overlay.innerHTML = `
      <div style="background:var(--bg);border:1px solid var(--panel-edge);border-radius:10px;padding:1.5rem;width:min(520px,90vw);max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.4);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1.1rem;color:var(--text);">🖥️ IDE Bridge</h2>
          <button class="btn" id="ide-bridge-close" style="font-size:0.75rem;padding:0.2rem 0.5rem;">✕</button>
        </div>

        <div style="margin-bottom:1rem;">
          <h3 style="font-size:0.85rem;color:var(--text);margin-bottom:0.5rem;">Active Sessions</h3>
          ${sessionHtml}
        </div>

        ${orgSessions.length > 0 ? `
        <div style="margin-bottom:1rem;border-top:1px solid var(--panel-edge);padding-top:1rem;">
          <h3 style="font-size:0.85rem;color:var(--text);margin-bottom:0.5rem;">👥 Team Activity</h3>
          ${orgSessions.map(s => {
            const fileShort = s.currentFile ? s.currentFile.split("/").pop() : "—";
            const branchTag = s.gitBranch ? ` <span style="color:var(--dim);">[${s.gitBranch}]</span>` : "";
            return `
              <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:6px;padding:0.6rem 0.8rem;margin-bottom:0.4rem;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <span style="font-size:0.85rem;font-weight:600;color:var(--text);">${s.userName}</span>
                  <span style="font-size:0.75rem;color:var(--dim);">${toolLabel[s.tool] ?? "Terminal"}</span>
                  ${branchTag}
                  <span style="margin-left:auto;font-size:0.7rem;">${stateBadge(s.state)}</span>
                </div>
                <div style="font-size:0.7rem;color:var(--dim);margin-top:0.2rem;">📂 ${fileShort}</div>
              </div>`;
          }).join("")}
        </div>
        ` : ""}

        <div style="border-top:1px solid var(--panel-edge);padding-top:1rem;">
          <h3 style="font-size:0.85rem;color:var(--text);margin-bottom:0.5rem;">Connect a Tool</h3>
          ${token ? `
            <div style="margin-bottom:0.6rem;">
              <p style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">Your bridge token (click to copy):</p>
              <div id="ah-token-box" style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:4px;padding:0.4rem 0.6rem;font-family:monospace;font-size:0.7rem;color:var(--text);cursor:pointer;word-break:break-all;user-select:all;">${token.slice(0, 20)}••••••••••••••••</div>
            </div>
            <p style="font-size:0.75rem;color:var(--dim);margin-bottom:0.4rem;">Run this in your project directory:</p>
            <div id="ah-cmd-box" style="background:var(--panel);border-radius:6px;padding:0.6rem;font-family:monospace;font-size:0.72rem;color:var(--text);cursor:pointer;user-select:all;">
              <div style="color:var(--dim);margin-bottom:0.2rem;"># Install the CLI</div>
              <div style="color:var(--accent);">cd ah-cli && npm install && npm run build</div>
              <div style="color:var(--dim);margin-top:0.4rem;margin-bottom:0.2rem;"># Connect Windsurf activity to your office</div>
              <div style="color:var(--accent);">AH_TOKEN=${token} AH_HOST=${wsHost} node dist/cli.js watch --tool windsurf</div>
            </div>
            <p style="font-size:0.7rem;color:var(--dim);margin-top:0.5rem;">
              Only metadata is sent — never file contents. Token is scoped to your account.
            </p>
          ` : `
            <p style="font-size:0.75rem;color:var(--dim);">Sign in to get your bridge token.</p>
          `}
        </div>

        <div style="border-top:1px solid var(--panel-edge);padding-top:1rem;margin-top:0.5rem;">
          <h3 style="font-size:0.85rem;color:var(--text);margin-bottom:0.4rem;">🔒 Team Visibility</h3>
          <p style="font-size:0.72rem;color:var(--dim);margin-bottom:0.5rem;">Control what org members can see about your coding activity.</p>
          <div style="display:flex;gap:0.4rem;">
            <button class="btn ${visibility === "full" ? "primary" : ""}" data-privacy="full" style="font-size:0.75rem;padding:0.3rem 0.6rem;">Full</button>
            <button class="btn ${visibility === "branch_only" ? "primary" : ""}" data-privacy="branch_only" style="font-size:0.75rem;padding:0.3rem 0.6rem;">Branch Only</button>
            <button class="btn ${visibility === "hidden" ? "primary" : ""}" data-privacy="hidden" style="font-size:0.75rem;padding:0.3rem 0.6rem;">Hidden</button>
          </div>
          <p style="font-size:0.68rem;color:var(--dim);margin-top:0.4rem;">
            ${visibility === "full" ? "Teammates see your tool, files, branch, and line stats." : visibility === "branch_only" ? "Teammates see your tool and branch only — no file details." : "Your activity is invisible to org members."}
          </p>
        </div>

        <div style="border-top:1px solid var(--panel-edge);padding-top:1rem;margin-top:0.5rem;">
          <h3 style="font-size:0.85rem;color:var(--text);margin-bottom:0.4rem;">🖥️ Office Display</h3>
          <p style="font-size:0.72rem;color:var(--dim);margin-bottom:0.5rem;">Show terminal stations in your office for connected tools.</p>
          <label style="display:flex;align-items:center;gap:0.4rem;cursor:pointer;font-size:0.78rem;color:var(--text);">
            <input type="checkbox" id="ide-bridge-show-stations" ${this.store.showTerminalStations ? "checked" : ""} style="cursor:pointer;" />
            Show terminal stations in office
          </label>
        </div>

        <div style="border-top:1px solid var(--panel-edge);padding-top:1rem;margin-top:0.5rem;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
            <h3 style="font-size:0.85rem;color:var(--text);margin:0;">📊 Velocity & Analytics</h3>
            <button class="btn" id="ide-bridge-refresh-analytics" style="font-size:0.7rem;padding:0.2rem 0.5rem;">Refresh</button>
          </div>

          ${velocityTrends.length > 0 ? `
            <div style="margin-bottom:0.8rem;">
              <p style="font-size:0.72rem;color:var(--dim);margin-bottom:0.3rem;">Lines changed (last ${velocityTrends.length} days)</p>
              <svg width="100%" height="60" viewBox="0 0 ${velocityTrends.length * 20} 60" style="overflow:visible;">
                ${(() => {
                  const maxVal = Math.max(...velocityTrends.map(t => t.totalLinesAdded + t.totalLinesRemoved), 1);
                  const points = velocityTrends.map((t, i) => {
                    const x = i * 20 + 10;
                    const addedH = (t.totalLinesAdded / maxVal) * 50;
                    const removedH = (t.totalLinesRemoved / maxVal) * 50;
                    return { x, addedH, removedH, day: t.day.slice(5), total: t.totalLinesAdded + t.totalLinesRemoved };
                  });
                  const addedBars = points.map(p => `<rect x="${p.x - 6}" y="${55 - p.addedH}" width="5" height="${p.addedH}" fill="var(--accent)" rx="1"/>`).join("");
                  const removedBars = points.map(p => `<rect x="${p.x + 1}" y="${55 - p.removedH}" width="5" height="${p.removedH}" fill="#ff6a6a" rx="1"/>`).join("");
                  const labels = points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 5)) === 0).map(p => `<text x="${p.x}" y="60" font-size="8" fill="var(--dim)" text-anchor="middle">${p.day}</text>`).join("");
                  return addedBars + removedBars + labels;
                })()}
              </svg>
              <div style="display:flex;gap:0.8rem;font-size:0.68rem;color:var(--dim);margin-top:0.2rem;">
                <span><span style="display:inline-block;width:8px;height:8px;background:var(--accent);border-radius:1px;margin-right:0.2rem;"></span>Added</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#ff6a6a;border-radius:1px;margin-right:0.2rem;"></span>Removed</span>
              </div>
            </div>
          ` : `<p style="font-size:0.72rem;color:var(--dim);margin-bottom:0.5rem;">No velocity data yet. Click Refresh to load.</p>`}

          ${anomalyAlerts.length > 0 ? `
            <div style="margin-bottom:0.8rem;">
              <p style="font-size:0.75rem;color:var(--text);margin-bottom:0.3rem;">🚨 Anomalies</p>
              ${anomalyAlerts.map(a => `
                <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:4px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.72rem;">
                  <span style="color:${a.severity === "critical" ? "#ff4a4a" : a.severity === "warning" ? "#ffaa4a" : "var(--dim)"};">${a.severity === "critical" ? "🔴" : a.severity === "warning" ? "🟡" : "🔵"}</span>
                  <span style="color:var(--text);">${a.message}</span>
                </div>
              `).join("")}
            </div>
          ` : ""}

          ${standupSummary ? `
            <div style="margin-bottom:0.5rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.3rem;">
                <p style="font-size:0.75rem;color:var(--text);margin:0;">📋 Standup — ${standupSummary.date}</p>
                <button class="btn" id="ide-bridge-post-standup" style="font-size:0.68rem;padding:0.15rem 0.4rem;">Post in Chat</button>
              </div>
              <div style="font-size:0.68rem;color:var(--dim);margin-bottom:0.3rem;">
                ${standupSummary.activeEngineers} engineers · ${standupSummary.totalFilesChanged} files · +${standupSummary.totalLinesAdded}/-${standupSummary.totalLinesRemoved} lines
              </div>
              ${standupSummary.entries.map(e => `
                <div style="font-size:0.68rem;color:var(--dim);padding:0.15rem 0;">
                  • <span style="color:var(--text);">${e.userName}</span> — ${e.tool} · +${e.linesAdded}/-${e.linesRemoved}${e.errors > 0 ? ` · ⚠️ ${e.errors} errors` : ""}
                </div>
              `).join("")}
            </div>
          ` : ""}
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || (e.target as HTMLElement).id === "ide-bridge-close") overlay.remove();
    });

    // Click-to-copy for token
    const tokenBox = overlay.querySelector("#ah-token-box");
    if (tokenBox) {
      tokenBox.addEventListener("click", () => {
        if (token) {
          navigator.clipboard.writeText(token).then(() => {
            const el = tokenBox as HTMLElement;
            const orig = el.textContent;
            el.textContent = "✅ Copied!";
            setTimeout(() => { if (el.isConnected) el.textContent = orig; }, 1500);
          }).catch(() => {});
        }
      });
    }

    // Click-to-copy for full command
    const cmdBox = overlay.querySelector("#ah-cmd-box");
    if (cmdBox && token) {
      const fullCmd = `AH_TOKEN=${token} AH_HOST=${wsHost} node dist/cli.js watch --tool windsurf`;
      cmdBox.addEventListener("click", () => {
        navigator.clipboard.writeText(fullCmd).then(() => {
          const el = cmdBox as HTMLElement;
          const orig = el.innerHTML;
          el.innerHTML = '<div style="color:var(--accent);text-align:center;padding:0.4rem;">✅ Command copied to clipboard!</div>';
          setTimeout(() => { if (el.isConnected) el.innerHTML = orig; }, 1500);
        }).catch(() => {});
      });
    }

    // Privacy toggle buttons
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-privacy]")) {
      btn.addEventListener("click", () => {
        const vis = btn.dataset.privacy as "full" | "branch_only" | "hidden";
        this.net.send({ type: "set_ide_bridge_privacy", visibility: vis });
      });
    }

    // Show terminal stations toggle
    const stationsCheckbox = overlay.querySelector("#ide-bridge-show-stations") as HTMLInputElement | null;
    if (stationsCheckbox) {
      stationsCheckbox.addEventListener("change", () => {
        this.store.toggleTerminalStations();
      });
    }

    // Refresh analytics button
    const refreshAnalyticsBtn = overlay.querySelector("#ide-bridge-refresh-analytics");
    if (refreshAnalyticsBtn) {
      refreshAnalyticsBtn.addEventListener("click", () => {
        this.net.send({ type: "request_velocity_report", days: 14 });
        this.net.send({ type: "request_standup" });
        this.net.send({ type: "request_anomalies" });
      });
    }

    // Post standup in chat button
    const postStandupBtn = overlay.querySelector("#ide-bridge-post-standup");
    if (postStandupBtn) {
      postStandupBtn.addEventListener("click", () => {
        const summary = this.store.standupSummary;
        if (!summary) return;
        const lines: string[] = [
          `📋 Daily Standup — ${summary.date}`,
          `${summary.activeEngineers} engineers · ${summary.totalFilesChanged} files · +${summary.totalLinesAdded}/-${summary.totalLinesRemoved} lines`,
        ];
        for (const e of summary.entries) {
          lines.push(`• ${e.userName} — ${e.tool} · +${e.linesAdded}/-${e.linesRemoved}${e.errors > 0 ? ` · ⚠️ ${e.errors} errors` : ""}`);
        }
        if (summary.anomalies.length > 0) {
          lines.push("", "🚨 Anomalies:");
          for (const a of summary.anomalies) {
            lines.push(`  ${a.message}`);
          }
        }
        // Post to office manager chat
        const el = postStandupBtn as HTMLElement;
        const orig = el.textContent;
        el.textContent = "✅ Posted!";
        setTimeout(() => { if (el.isConnected) el.textContent = orig; }, 1500);
      });
    }

    // Auto-refresh on session changes
    const refresh = () => {
      if (!overlay.isConnected) return;
      this.store.externalSessionListeners = this.store.externalSessionListeners.filter(fn => fn !== refresh);
      this.store.orgExternalSessionListeners = this.store.orgExternalSessionListeners.filter(fn => fn !== refresh);
      this.store.velocityListeners = this.store.velocityListeners.filter(fn => fn !== refresh);
      this.store.standupListeners = this.store.standupListeners.filter(fn => fn !== refresh);
      this.store.anomalyListeners = this.store.anomalyListeners.filter(fn => fn !== refresh);
      overlay.remove();
      this.openIdeBridgePanel();
    };
    this.store.externalSessionListeners.push(refresh);
    this.store.orgExternalSessionListeners.push(refresh);
    this.store.velocityListeners.push(refresh);
    this.store.standupListeners.push(refresh);
    this.store.anomalyListeners.push(refresh);
  }

  private openSocialPanel(): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
    overlay.id = "social-overlay";

    const onlineFriends = this.store.friends.filter(f => f.online);
    const offlineFriends = this.store.friends.filter(f => !f.online);
    const incomingReqs = this.store.pendingFriendRequests.filter(r => r.direction === "incoming");
    const outgoingReqs = this.store.pendingFriendRequests.filter(r => r.direction === "outgoing");

    const friendHtml = (f: typeof onlineFriends[0]) => `
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
        <span style="width:8px;height:8px;border-radius:50%;background:${f.online ? 'var(--accent)' : 'var(--panel-edge)'};flex-shrink:0;"></span>
        <span style="font-size:0.85rem;color:var(--text);flex:1;">${f.name}</span>
        ${f.online && f.roomName ? `<span style="font-size:0.7rem;color:var(--dim);">in ${f.roomName}</span>` : ''}
        ${f.online && f.roomId ? `<button class="btn" data-join-room="${f.roomId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;">Join</button>` : ''}
        <button class="btn" data-remove-friend="${f.userId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;color:var(--dim);">✕</button>
      </div>`;

    const reqHtml = (r: typeof incomingReqs[0], incoming: boolean) => `
      <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
        <span style="font-size:0.85rem;color:var(--text);flex:1;">${r.name}</span>
        ${incoming ? `
          <button class="btn primary" data-accept-friend="${r.userId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;">Accept</button>
          <button class="btn" data-decline-friend="${r.userId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;">Decline</button>
        ` : `<span style="font-size:0.7rem;color:var(--dim);">Pending</span>`}
      </div>`;

    const onlinePlayerHtml = this.store.onlinePlayers
      .filter(p => p.userId !== this.store.userId)
      .map(p => `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0;"></span>
          <span style="font-size:0.85rem;color:var(--text);flex:1;">${p.name}</span>
          <span style="font-size:0.7rem;color:var(--dim);">${p.roomName || '—'}</span>
          ${p.roomId ? `<button class="btn" data-join-room="${p.roomId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;">Join</button>` : ''}
        </div>
      `).join("");

    const roomOccupancyHtml = this.store.roomsList
      .filter(r => r.roomType === "organization" || r.roomId === "hq2")
      .map(r => {
        const occ = this.store.roomOccupancy.get(r.roomId);
        const count = occ?.playerCount ?? 0;
        const isCurrent = this.store.roomId === r.roomId;
        return `
          <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
            <span style="font-size:0.85rem;color:var(--text);flex:1;">${r.name}</span>
            <span style="font-size:0.7rem;color:${count > 0 ? 'var(--accent)' : 'var(--dim)'};">${count > 0 ? `🟢 ${count} player${count !== 1 ? 's' : ''}` : '⚫ Empty'}</span>
            ${!isCurrent ? `<button class="btn" data-join-room="${r.roomId}" style="font-size:0.65rem;padding:0.15rem 0.4rem;">Join</button>` : '<span style="font-size:0.65rem;color:var(--dim);">Here</span>'}
          </div>`;
      }).join("");

    overlay.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:var(--radius-lg);padding:1.5rem;width:500px;max-width:90vw;color:var(--text);font-family:var(--font-body);max-height:85vh;overflow-y:auto;box-shadow:var(--shadow-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1.1rem;color:var(--text);">👥 Social</h2>
          <button class="x" id="social-close" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">ADD FRIEND</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="friend-email-input" placeholder="Email address…" style="flex:1;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:var(--radius-sm);color:var(--text);font-size:0.85rem;font-family:var(--font-body);" />
            <button class="btn primary" id="friend-send-btn" style="font-size:0.8rem;">SEND</button>
          </div>
        </div>

        ${incomingReqs.length > 0 ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">FRIEND REQUESTS (${incomingReqs.length})</div>
          ${incomingReqs.map(r => reqHtml(r, true)).join("")}
        </div>
        ` : ""}

        ${outgoingReqs.length > 0 ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">SENT REQUESTS (${outgoingReqs.length})</div>
          ${outgoingReqs.map(r => reqHtml(r, false)).join("")}
        </div>
        ` : ""}

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">FRIENDS — ONLINE (${onlineFriends.length})</div>
          ${onlineFriends.length === 0 ? '<p style="color:var(--dim);font-size:0.8rem;">No friends online.</p>' : onlineFriends.map(f => friendHtml(f)).join("")}
        </div>

        ${offlineFriends.length > 0 ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">FRIENDS — OFFLINE (${offlineFriends.length})</div>
          <div style="max-height:200px;overflow-y:auto;">
            ${offlineFriends.map(f => friendHtml(f)).join("")}
          </div>
        </div>
        ` : ""}

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
            <div style="font-size:0.75rem;color:var(--dim);">ONLINE PLAYERS (${this.store.onlinePlayers.length})</div>
            <button class="btn" id="online-refresh-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;">↻</button>
          </div>
          ${this.store.onlinePlayers.length <= 1 ? '<p style="color:var(--dim);font-size:0.8rem;">No other players online.</p>' : onlinePlayerHtml}
        </div>

        ${roomOccupancyHtml ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">ROOMS — WHO'S WHERE</div>
          ${roomOccupancyHtml}
        </div>
        ` : ""}
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("social-close")!.addEventListener("click", close);

    // Send friend request
    document.getElementById("friend-send-btn")!.addEventListener("click", () => {
      const input = document.getElementById("friend-email-input") as HTMLInputElement;
      const email = input.value.trim();
      if (!email) return;
      this.net.send({ type: "friend_request", email });
      input.value = "";
      setTimeout(() => {
        this.net.send({ type: "list_friends" });
        this.rerenderSocialPanel(overlay);
      }, 500);
    });

    // Accept friend
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-accept-friend]")) {
      btn.addEventListener("click", () => {
        this.net.send({ type: "friend_accept", userId: btn.dataset.acceptFriend! });
        setTimeout(() => {
          this.net.send({ type: "list_friends" });
          this.rerenderSocialPanel(overlay);
        }, 500);
      });
    }

    // Decline friend
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-decline-friend]")) {
      btn.addEventListener("click", () => {
        this.net.send({ type: "friend_decline", userId: btn.dataset.declineFriend! });
        setTimeout(() => {
          this.net.send({ type: "list_friends" });
          this.rerenderSocialPanel(overlay);
        }, 500);
      });
    }

    // Remove friend
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-remove-friend]")) {
      btn.addEventListener("click", () => {
        this.net.send({ type: "friend_remove", userId: btn.dataset.removeFriend! });
        setTimeout(() => {
          this.net.send({ type: "list_friends" });
          this.rerenderSocialPanel(overlay);
        }, 500);
      });
    }

    // Join room
    for (const btn of overlay.querySelectorAll<HTMLButtonElement>("button[data-join-room]")) {
      btn.addEventListener("click", () => {
        const roomId = btn.dataset.joinRoom!;
        this.net.send({ type: "switch_room", roomId });
        close();
      });
    }

    // Refresh online players
    const refreshBtn = document.getElementById("online-refresh-btn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.net.send({ type: "list_online_players" });
        setTimeout(() => this.rerenderSocialPanel(overlay), 500);
      });
    }
  }

  private rerenderSocialPanel(overlay: HTMLElement): void {
    if (!overlay || !overlay.isConnected) return;
    const oldScroll = overlay.querySelector("div")?.scrollTop ?? 0;
    this.openSocialPanel();
    const newOverlay = document.getElementById("social-overlay");
    if (newOverlay) {
      const inner = newOverlay.querySelector("div");
      if (inner) inner.scrollTop = oldScroll;
      overlay.remove();
    }
  }

  private openRoomsPanel(): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);";
    overlay.id = "rooms-overlay";

    const players = Array.from(this.store.roomPlayers.values());
    const playerListHtml = players.length === 0
      ? '<p style="color:var(--dim);font-size:0.85rem;">No players in room.</p>'
      : players.map(p => `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0;">
          <span style="width:8px;height:8px;border-radius:50%;background:${p.role === 'owner' ? 'var(--accent)' : p.role === 'guest' ? 'var(--amber)' : 'var(--panel-edge)'};"></span>
          <span style="font-size:0.85rem;color:var(--text);">${p.name}</span>
          <span style="font-size:0.7rem;color:var(--dim);">${p.role}</span>
        </div>
      `).join("");

    const isHq2 = this.store.roomId === "hq2";
    const isInOffice = this.store.privateOfficeId != null && this.store.roomId === this.store.privateOfficeId;

    // Separate org rooms from other rooms
    const orgRooms = this.store.roomsList.filter(r => r.roomType === "organization" && r.roomId !== "hq2");
    const otherRooms = this.store.roomsList.filter(r => r.roomId !== "hq2" && r.roomId !== this.store.privateOfficeId && r.roomType !== "organization");

    overlay.innerHTML = `
      <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:var(--radius-lg);padding:1.5rem;width:480px;max-width:90vw;color:var(--text);font-family:var(--font-body);max-height:85vh;overflow-y:auto;box-shadow:var(--shadow-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1.1rem;color:var(--text);">🚪 Rooms</h2>
          <button class="x" id="rooms-close" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">CURRENT ROOM</div>
          <div style="font-size:0.9rem;font-weight:bold;color:var(--text);margin-bottom:0.3rem;">${this.store.roomName || "—"}</div>
          ${!isHq2 ? `<div style="font-size:0.7rem;color:var(--dim);margin-bottom:0.5rem;word-break:break-all;">Room ID: <span id="room-id-display" style="color:var(--accent);cursor:pointer;text-decoration:underline;">${this.store.roomId ?? "—"}</span></div>` : ""}
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">PLAYERS (${players.length})</div>
          <div>${playerListHtml}</div>
        </div>

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.5rem;">SWITCH ROOM</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn ${isHq2 ? 'primary' : ''}" id="room-hq2-btn" style="font-size:0.8rem;${isHq2 ? 'opacity:0.6;pointer-events:none;' : ''}">🌐 COMMAND CENTER</button>
            <button class="btn ${isInOffice ? 'primary' : ''}" id="room-office-btn" style="font-size:0.8rem;${isInOffice ? 'opacity:0.6;pointer-events:none;' : ''}">🏠 MY OFFICE</button>
          </div>
        </div>

        ${orgRooms.length > 0 ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.5rem;">🏢 ORGANIZATION ROOMS</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${orgRooms.map(r => {
              const isCurrent = this.store.roomId === r.roomId;
              const occ = this.store.roomOccupancy.get(r.roomId);
              const count = occ?.playerCount ?? 0;
              const badge = count > 0 ? ` <span style="font-size:0.65rem;color:var(--accent);">(${count})</span>` : '';
              return `<button class="btn ${isCurrent ? 'primary' : ''}" data-room-id="${r.roomId}" style="font-size:0.8rem;${isCurrent ? 'opacity:0.6;pointer-events:none;' : ''}">🏢 ${r.name}${badge}</button>`;
            }).join("")}
          </div>
        </div>
        ` : ""}

        ${otherRooms.length > 0 ? `
        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.5rem;">YOUR ROOMS</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            ${otherRooms.map(r => {
              const isCurrent = this.store.roomId === r.roomId;
              return `<button class="btn ${isCurrent ? 'primary' : ''}" data-room-id="${r.roomId}" style="font-size:0.8rem;${isCurrent ? 'opacity:0.6;pointer-events:none;' : ''}">${r.name}</button>`;
            }).join("")}
          </div>
        </div>
        ` : ""}

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.5rem;">CREATE NEW ROOM</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="room-name-input" placeholder="Room name…" style="flex:1;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:var(--radius-sm);color:var(--text);font-size:0.85rem;font-family:var(--font-body);" />
            <button class="btn primary" id="room-create-btn" style="font-size:0.8rem;">CREATE</button>
          </div>
        </div>

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;margin-bottom:1rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div style="font-size:0.75rem;color:var(--dim);">ORGANIZATIONS</div>
            <button class="btn" id="org-refresh-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;">↻</button>
          </div>
          <div id="orgs-container" style="display:flex;flex-direction:column;gap:0.4rem;">
            ${this.store.orgsList.length === 0 ? '<p style="color:var(--dim);font-size:0.8rem;">No organizations yet.</p>' : this.store.orgsList.map(o => `
              <div style="background:var(--panel-soft);border:1px solid var(--panel-edge-soft);border-radius:var(--radius-sm);padding:0.5rem 0.7rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <span style="font-size:0.85rem;font-weight:bold;color:var(--text);">${o.name}</span>
                    ${o.githubOrg ? `<span style="font-size:0.7rem;color:var(--dim);margin-left:0.4rem;">github:${o.githubOrg}</span>` : ""}
                  </div>
                  <div style="display:flex;gap:0.3rem;align-items:center;">
                    <span style="font-size:0.7rem;color:var(--dim);">${o.memberCount} member${o.memberCount !== 1 ? 's' : ''}</span>
                    ${o.isMember ? `<span style="font-size:0.65rem;color:var(--accent);">${o.role}</span>` : ''}
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

        <div style="border-top:1px solid var(--panel-edge-soft);padding-top:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.5rem;">INVITE PLAYER TO CURRENT ROOM</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="room-invite-input" placeholder="User ID..." style="flex:1;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:var(--radius-sm);color:var(--text);font-size:0.85rem;font-family:var(--font-body);" />
            <button class="btn" id="room-invite-btn" style="font-size:0.8rem;">INVITE</button>
          </div>
          <div style="margin-top:0.6rem;">
            <div style="font-size:0.7rem;color:var(--dim);margin-bottom:0.3rem;">ACCESS LEVEL</div>
            <div style="display:flex;gap:0.4rem;">
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text);cursor:pointer;padding:0.3rem 0.5rem;border:1px solid var(--panel-edge);border-radius:var(--radius-sm);">
                <input type="radio" name="invite-access" value="tour" style="accent-color:var(--accent);" />
                Tour
              </label>
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text);cursor:pointer;padding:0.3rem 0.5rem;border:1px solid var(--panel-edge);border-radius:var(--radius-sm);">
                <input type="radio" name="invite-access" value="talk" checked style="accent-color:var(--green);" />
                Talk
              </label>
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text);cursor:pointer;padding:0.3rem 0.5rem;border:1px solid var(--panel-edge);border-radius:var(--radius-sm);">
                <input type="radio" name="invite-access" value="manage" style="accent-color:var(--amber);" />
                Manage
              </label>
            </div>
            <div id="invite-access-desc" style="font-size:0.65rem;color:var(--dim);margin-top:0.3rem;">Can enter, see agents, and chat (subject to per-agent ACLs).</div>
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
      <div style="background:var(--panel);border-radius:12px;padding:1.5rem;width:400px;max-width:90vw;color:var(--text);font-family:'M Plus Rounded 1c',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1rem;">🏢 Create Organization</h2>
          <button class="x" id="org-create-close" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <div>
            <label style="font-size:0.75rem;color:var(--dim);">Name</label>
            <input id="org-name-input" placeholder="My Organization" style="width:100%;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;color:var(--text);font-size:0.85rem;margin-top:0.2rem;" />
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--dim);">Slug (URL-safe)</label>
            <input id="org-slug-input" placeholder="my-org" style="width:100%;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;color:var(--text);font-size:0.85rem;margin-top:0.2rem;" />
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--dim);">GitHub Org (optional)</label>
            <input id="org-github-input" placeholder="my-github-org" style="width:100%;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;color:var(--text);font-size:0.85rem;margin-top:0.2rem;" />
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
      <div style="background:var(--panel);border-radius:12px;padding:1.5rem;width:420px;max-width:90vw;color:var(--text);font-family:'M Plus Rounded 1c',sans-serif;max-height:80vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="margin:0;font-size:1rem;">👥 Organization Members</h2>
          <button class="x" id="org-members-close" style="background:none;border:none;color:var(--dim);font-size:1.2rem;cursor:pointer;">✕</button>
        </div>
        <div id="org-members-list" style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:1rem;">
          ${members.length === 0 ? '<p style="color:var(--dim);font-size:0.8rem;">No members yet.</p>' : members.map(m => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--panel-soft);border-radius:6px;padding:0.5rem 0.7rem;">
              <div>
                <span style="font-size:0.85rem;">${m.userEmail ?? m.userId}</span>
                <span style="font-size:0.65rem;color:${m.role === 'admin' ? 'var(--accent)' : 'var(--dim)'};margin-left:0.4rem;">${m.role}</span>
              </div>
              <button class="btn" data-remove-member="${m.userId}" style="font-size:0.7rem;padding:0.2rem 0.5rem;color:var(--red);">Remove</button>
            </div>
          `).join("")}
        </div>
        <div style="border-top:1px solid var(--panel-edge);padding-top:1rem;">
          <div style="font-size:0.75rem;color:var(--dim);margin-bottom:0.3rem;">ADD MEMBER BY EMAIL</div>
          <div style="display:flex;gap:0.5rem;">
            <input id="org-add-email" placeholder="user@example.com" style="flex:1;padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;color:var(--text);font-size:0.85rem;" />
            <select id="org-add-role" style="padding:0.5rem;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;color:var(--text);font-size:0.85rem;">
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
      <div style="background:var(--panel);border-radius:12px;padding:1.5rem;width:380px;max-width:90vw;color:var(--text);font-family:'M Plus Rounded 1c',sans-serif;text-align:center;">
        <div style="font-size:2rem;margin-bottom:0.5rem;">📨</div>
        <h2 style="margin:0 0 0.5rem;font-size:1rem;">Room Invitation</h2>
        <p style="margin:0 0 1rem;font-size:0.9rem;color:var(--dim);">
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
          <p style="font-size:0.8rem;color:var(--dim);margin-bottom:0.5rem;">Bring your own key — your agents will use it instead of the server's shared key.</p>
          <div id="api-key-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.hasApiKey ? "var(--green)" : "var(--red)"};">
            ${this.store.hasApiKey ? "✓ You have a personal API key set." : "⚠ No personal API key — using the server's shared key."}
          </div>
          <label>API KEY
            <input id="s-api-key" type="password" placeholder="sk-..." autocomplete="off"
              style="width:100%;padding:0.6rem 0.8rem;border-radius:0.5rem;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--text);font-size:0.9rem;" />
          </label>
          <div class="row" style="margin-top:0.75rem;">
            <button class="btn primary" id="s-save-key">SAVE KEY</button>
            <button class="btn danger" id="s-clear-key" ${this.store.hasApiKey ? "" : "disabled"}>CLEAR KEY</button>
          </div>
        </div>
        <div class="tabpanel" data-panel="spend" hidden>
          <div class="sec">API SPEND (30 DAYS)</div>
          <div id="spend-loading" style="font-size:0.85rem;color:var(--dim);">Loading…</div>
          <div id="spend-content" hidden></div>
          <div id="spend-cap-info" style="margin-top:1rem;font-size:0.78rem;color:var(--dim);border-top:1px solid var(--panel-edge);padding-top:0.75rem;">
            Monthly cap: ${this.store.usageCap > 0 ? `$${(this.store.usageCap / 100).toFixed(2)}` : "—"} — upgrade your plan to increase.
          </div>
        </div>
        <div class="tabpanel" data-panel="billing" hidden>
          <div class="sec">SUBSCRIPTION</div>
          <div id="sub-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.subscriptionActive ? "var(--green)" : "var(--red)"};">
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
          <div id="s-deletion-warning" hidden style="margin-top:1rem;padding:0.75rem;border:1px solid var(--red);border-radius:0.5rem;background:rgba(220,38,38,0.08);">
            <div style="font-size:0.85rem;color:var(--red);margin-bottom:0.5rem;">⚠ Your account is scheduled for deletion on <span id="s-deletion-date"></span>.</div>
            <div style="font-size:0.78rem;color:var(--dim);margin-bottom:0.75rem;">All agents are stopped. Your data will be permanently erased after this date. Sign in anytime before then to cancel.</div>
            <button class="btn" id="s-cancel-deletion">CANCEL DELETION</button>
          </div>
          <div style="margin-bottom:1rem;">
            <a href="/privacy" target="_blank" style="font-size:0.85rem;color:var(--dim);text-decoration:none;display:inline-flex;align-items:center;gap:0.3rem;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> Privacy Policy</a>
            <span style="margin:0 0.5rem;color:var(--panel-edge);">·</span>
            <a href="/terms" target="_blank" style="font-size:0.85rem;color:var(--dim);text-decoration:none;">Terms of Service</a>
          </div>
          <div id="s-delete-account-section" style="margin-top:1rem;border-top:1px solid var(--panel-edge);padding-top:1rem;">
            <div class="sec" style="color:var(--red);">DANGER ZONE</div>
            <p style="font-size:0.78rem;color:var(--dim);margin-bottom:0.5rem;">Permanently delete your account and all associated data. A 30-day grace period applies — you can cancel by signing back in.</p>
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

  // -------------------------------------------------------- subscribe modal

  private showSubscribeModal(message: string): void {
    const modal = document.getElementById("subscribe-modal")!;
    if (!modal.hidden) return;
    modal.hidden = false;

    modal.innerHTML = `
      <div class="modal" style="width:420px;max-width:92vw;">
        <h2>SUBSCRIPTION REQUIRED</h2>
        <p style="font-size:0.85rem;color:var(--dim);text-align:center;margin:0 0 0.4rem 0;">${esc(message)}</p>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
          ${SUBSCRIPTION_TIER_LIST.map(t => {
            const agentLabel = `${t.agentLimit} agent${t.agentLimit === 1 ? "" : "s"}`;
            return `<button class="btn primary sub-tier-btn" data-tier="${t.id}" style="text-align:left;padding:0.7rem 0.9rem;font-size:0.9rem;">
              <span style="font-weight:800;">${t.name}</span> — ${t.label} <span style="color:var(--dim);font-size:0.78rem;">(${agentLabel})</span>
            </button>`;
          }).join("")}
        </div>
        <div class="row footer">
          <button class="btn" id="sub-cancel">MAYBE LATER</button>
        </div>
      </div>
    `;

    document.getElementById("sub-cancel")!.addEventListener("click", () => {
      modal.hidden = true;
    });
    modal.querySelectorAll<HTMLButtonElement>(".sub-tier-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tier = btn.dataset.tier as SubscriptionTier;
        if (tier) void startSubscriptionCheckout(tier);
      });
    });
  }

  // ------------------------------------------------------------- hire modal

  private openHireModal(): void {
    if (this.tourCleanup) this.tourCleanup();
    const onboard = document.getElementById("onboard-modal");
    if (onboard) onboard.hidden = true;
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
      <div style="margin-bottom:0.8rem;padding:0.6rem 0.8rem;border-radius:8px;background:rgba(240,101,101,0.15);border:1px solid rgba(240,101,101,0.3);color:var(--red);font-size:0.82rem;line-height:1.3;">
        <strong>Subscription required.</strong> Pay a $0.99 one-time entry fee to hire agents and run tasks. Subscribe for more agents and higher usage caps.
        <button id="h-subscribe" style="margin-top:0.4rem;display:block;padding:0.4rem 0.8rem;border-radius:6px;border:none;background:var(--green);color:var(--bg);font-size:0.8rem;font-weight:700;cursor:pointer;">Get started →</button>
      </div>`;

    const traitSliders = ([
      { key: "openness", label: "Openness", desc: "Creative vs conventional" },
      { key: "conscientiousness", label: "Conscientiousness", desc: "Organized vs spontaneous" },
      { key: "extraversion", label: "Extraversion", desc: "Outgoing vs reserved" },
      { key: "agreeableness", label: "Agreeableness", desc: "Warm vs blunt" },
      { key: "neuroticism", label: "Neuroticism", desc: "Sensitive vs calm" },
    ] as const).map(({ key, label, desc }) => `
      <div class="trait-row" style="margin-bottom:0.5rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text);margin-bottom:0.2rem;">
          <span>${label} <span style="color:var(--dim);font-size:0.7rem;">${desc}</span></span>
          <span id="h-${key}-val" style="color:var(--accent);font-weight:600;">${Math.round(personality[key] * 100)}</span>
        </div>
        <input type="range" id="h-${key}" min="0" max="100" value="${Math.round(personality[key] * 100)}"
          style="width:100%;accent-color:var(--accent);" />
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
            <div class="sec" style="margin-top:0.3rem;font-size:0.8rem;color:var(--dim);">PERSONALITY</div>
            <div id="h-traits" style="padding:0.4rem 0;">
              ${traitSliders}
              <button class="btn" id="h-rand-personality" style="font-size:0.75rem;padding:0.3rem 0.6rem;margin-top:0.3rem;">🎲 RANDOMIZE</button>
            </div>
            <div class="sec" style="margin-top:0.3rem;font-size:0.8rem;color:var(--dim);">ACCESS</div>
            <div style="padding:0.3rem 0;">
              <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:var(--text);cursor:pointer;margin-bottom:0.25rem;">
                <input type="radio" name="h-access" value="owner" checked style="accent-color:var(--accent);" />
                Only you can chat
              </label>
              <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:var(--text);cursor:pointer;">
                <input type="radio" name="h-access" value="open" style="accent-color:var(--accent);" />
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
      if (unique.length === 0) return "<span style='color:var(--dim);'>None</span>";
      return unique.map((s) => `<span style='display:inline-block;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:4px;padding:0.15rem 0.5rem;margin:0.15rem;font-size:0.75rem;'>${esc(s.name ?? s.url ?? s.command ?? "MCP")}</span>`).join("");
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
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text);margin-bottom:0.2rem;">
          <span>${label}</span>
          <span id="f-${key}-val" style="color:var(--accent);font-weight:600;">${Math.round(personality[key] * 100)}</span>
        </div>
        <input type="range" id="f-${key}" min="0" max="100" value="${Math.round(personality[key] * 100)}"
          style="width:100%;accent-color:var(--accent);" />
      </div>
    `).join("");

    const suggestedName = (agentA.name.slice(0, 8) + firstOther.name.slice(0, 8)).slice(0, 24);

    modal.innerHTML = `
      <div class="modal hire-modal" style="max-width:680px;">
        <h2>⚗️ FUSE AGENTS</h2>
        <p style="color:var(--dim);font-size:0.82rem;margin-bottom:0.8rem;">
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
            <div class="sec" style="font-size:0.8rem;color:var(--dim);margin-top:0.3rem;">MERGED MCP SERVERS</div>
            <div id="f-mcp-display" style="padding:0.4rem 0;margin-bottom:0.4rem;">${mergeMcpDisplay(agentA, firstOther)}</div>
            <div class="sec" style="font-size:0.8rem;color:var(--dim);">PERSONALITY (averaged)</div>
            <div id="f-traits" style="padding:0.4rem 0;">
              ${traitSliders}
            </div>
            <div class="sec" style="font-size:0.8rem;color:var(--dim);margin-top:0.3rem;">WALLETS</div>
            <div id="f-wallets" style="padding:0.3rem 0;font-size:0.78rem;color:var(--text);">
              ${((agentA.cdpSolana || firstOther.cdpSolana) ? "🔵 Solana (CDP) " : "")}${((agentA.crossmintWallet || firstOther.crossmintWallet) ? "🟢 Crossmint " : "")}${(!agentA.cdpSolana && !firstOther.cdpSolana && !agentA.crossmintWallet && !firstOther.crossmintWallet) ? "<span style='color:var(--dim);'>None</span>" : ""}
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
        "<span style='color:var(--dim);'>None</span>";
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

  private updateSeasonalBanner(): void {
    const banner = document.getElementById("seasonal-banner");
    if (!banner) return;
    const event = this.store.seasonalEvent;
    if (!event) {
      banner.style.display = "none";
      return;
    }
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.gap = "8px";
    banner.style.padding = "4px 12px";
    banner.style.background = "linear-gradient(90deg, var(--panel), var(--panel-soft))";
    banner.style.borderBottom = "1px solid var(--panel-edge)";
    banner.style.fontSize = "12px";
    banner.style.color = "var(--text)";
    banner.innerHTML = `
      <span style="font-size:18px;">${event.icon}</span>
      <span style="font-weight:600;">${event.eventName}</span>
      <span style="color:var(--dim);">${event.description.replace(/</g, "&lt;")}</span>
    `;
  }

  private render(): void {
    document.getElementById("workspace-name")!.textContent = this.store.player
      ? `${this.store.player.workspace} · boss: ${this.store.player.name}`
      : "";
    const connEl = document.getElementById("conn")!;
    connEl.classList.toggle("ok", this.store.connected);
    connEl.classList.toggle("updating", this.store.serverRestarting);

    // Seasonal event banner
    this.updateSeasonalBanner();

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
    this.renderStatsBar();
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
    this.checkElegantSolution();
    this.checkBreakthrough();
  }

  private lastElegantGoalId: string | null = null;

  private checkElegantSolution(): void {
    const es = this.store.elegantSolution;
    if (!es || es.goalCardId === this.lastElegantGoalId) return;
    this.lastElegantGoalId = es.goalCardId;

    const tier = es.tier;
    const emoji = tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : "🥉";
    const tierLabel = tier === "gold" ? "GOLD" : tier === "silver" ? "SILVER" : "BRONZE";
    const color = tier === "gold" ? "#ffd700" : tier === "silver" ? "#c0c0c0" : "#cd7f32";
    const s = es.score;

    // Create celebration overlay
    let overlay = document.getElementById("elegant-celebration");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "elegant-celebration";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7); z-index: 10000; pointer-events: none;
      animation: elegant-fade-in 0.3s ease-out;
    `;
    overlay.innerHTML = `
      <div style="text-align: center; animation: elegant-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);">
        <div style="font-size: 72px; margin-bottom: 12px;">${emoji}</div>
        <div style="font-size: 32px; font-weight: 900; color: ${color}; text-shadow: 0 0 20px ${color}66; margin-bottom: 8px;">ELEGANT SOLUTION</div>
        <div style="font-size: 18px; color: var(--text); margin-bottom: 16px;">${tierLabel} TIER</div>
        <div style="font-size: 14px; color: var(--dim); max-width: 400px; margin: 0 auto;">
          ${s.subtaskCount} subtasks · 0 rework · ${s.maxParallel} parallel paths · ${s.longestPath}-deep chain
        </div>
        <div style="font-size: 48px; font-weight: 900; color: ${color}; margin-top: 16px;">${s.grade}</div>
        <div style="font-size: 14px; color: var(--dim); margin-top: 8px;">${s.summary}</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.style.transition = "opacity 0.5s";
        overlay.style.opacity = "0";
        setTimeout(() => overlay?.remove(), 500);
      }
    }, 5000);

    // Clear from store so it doesn't re-trigger
    this.store.elegantSolution = null;
  }

  private lastBreakthroughId: string | null = null;

  private checkBreakthrough(): void {
    const bt = this.store.breakthrough;
    if (!bt || bt.agentId === this.lastBreakthroughId) return;
    this.lastBreakthroughId = bt.agentId;

    const triggerIcons: Record<string, string> = {
      high_success_rate: "🎯",
      fast_completion: "⚡",
      faster_than_peers: "🚀",
    };
    const icon = triggerIcons[bt.trigger] ?? "🔬";

    // Create celebration card (non-blocking, bottom-right)
    let card = document.getElementById("breakthrough-card");
    if (card) card.remove();
    card = document.createElement("div");
    card.id = "breakthrough-card";
    card.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: linear-gradient(135deg, var(--panel) 0%, var(--panel-soft) 100%);
      border: 2px solid var(--green); border-radius: 12px; padding: 16px 20px;
      max-width: 360px; box-shadow: 0 8px 32px rgba(74, 222, 128, 0.3);
      animation: elegant-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: var(--font-body, sans-serif);
    `;
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
        <span style="font-size: 28px;">${icon}</span>
        <div>
          <div style="font-size: 16px; font-weight: 800; color: var(--green); text-shadow: 0 0 12px rgba(74, 222, 128, 0.4);">BREAKTHROUGH!</div>
          <div style="font-size: 12px; color: var(--dim);">${bt.agentName}</div>
        </div>
        <button style="margin-left: auto; background: none; border: none; color: var(--dim); cursor: pointer; font-size: 16px;" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div style="font-size: 13px; color: var(--text); line-height: 1.5;">${bt.description}</div>
    `;
    document.body.appendChild(card);

    // Auto-remove after 8 seconds
    setTimeout(() => {
      if (card && card.parentNode) {
        card.style.transition = "opacity 0.5s, transform 0.5s";
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(() => card?.remove(), 500);
      }
    }, 8000);

    // Clear from store
    this.store.breakthrough = null;
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
        banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:500;padding:6px 14px;border-radius:8px;background:var(--panel);border:1px solid var(--panel-edge);color:var(--accent);font-size:13px;display:flex;align-items:center;gap:10px;backdrop-filter:blur(4px);";
        document.body.appendChild(banner);
      }
      const worldName = this.store.currentWorld.themeName;
      banner.innerHTML = `${ICON.portal} <strong>${esc(worldName)}</strong>`;
      const returnBtn = document.createElement("button");
      returnBtn.textContent = "← Return to HQ";
      returnBtn.style.cssText = "padding:3px 10px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--accent);cursor:pointer;font-size:12px;";
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
    if (gate.freeText) {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Type your answer...";
      input.style.cssText = "width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--panel-edge-soft);background:var(--panel-soft);color:var(--text);font-size:13px;box-sizing:border-box;outline:none;";
      input.addEventListener("focus", () => { input.style.borderColor = "var(--accent)"; });
      input.addEventListener("blur", () => { input.style.borderColor = "var(--panel-edge-soft)"; });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim()) {
          this.store.resolveGate(input.value.trim());
        }
      });
      optsContainer.appendChild(input);
      input.focus();
    } else {
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
          <span class="status" style="cursor:pointer;color:var(--green)">restore</span>
        </div>`,
      )
      .join("");
    const vacSection = vacRows
      ? `<div style="margin-top:0.4rem;padding-top:0.4rem;border-top:1px solid var(--panel-edge);font-size:0.7rem;color:var(--dim);text-transform:uppercase;letter-spacing:0.05em;">On Vacation</div>${vacRows}`
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
        input.style.cssText = `color:${agent.accent};background:var(--panel-soft);border:1px solid ${agent.accent};border-radius:0.25rem;padding:0.15rem 0.4rem;font-size:0.9rem;font-family:inherit;width:10rem;`;
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
        ? `<div style="margin-top:0.3rem; display:flex; align-items:center; gap:0.3rem; font-size:0.62rem; color:var(--amber);"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Access restricted — chat disabled</div>`
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

    // MCP tools & auth management for agents with MCP servers
    const mcpSection = document.getElementById("d-mcp-section")!;
    // Remove previous detail MCP listener to prevent leaks
    if (this.detailMcpListener) {
      const idx = this.store.mcpKeysStatusListeners.indexOf(this.detailMcpListener);
      if (idx >= 0) this.store.mcpKeysStatusListeners.splice(idx, 1);
      this.detailMcpListener = null;
    }
    const mcpServers = agent.mcpServers;
    if (mcpServers && mcpServers.length > 0) {
      mcpSection.hidden = false;
      // Split servers into auth-required (oauth/apikey) and no-auth (stdio/local tools)
      const authServers = mcpServers.filter((s) => s.authType === "oauth" || s.authType === "apikey");
      const noAuthServers = mcpServers.filter((s) => s.authType !== "oauth" && s.authType !== "apikey");
      const serverUrls = authServers.map((s) => s.url).filter((u): u is string => !!u);

      // Build read-only tools list for no-auth servers (e.g. playwright, sequential-thinking, memory)
      const toolsListHtml = noAuthServers.length > 0
        ? `<div style="margin-bottom:0.5rem;">
            <div class="wallet-label" style="font-size:0.65rem; color:var(--dim); margin-bottom:0.25rem;">BUILT-IN TOOLS</div>
            ${noAuthServers.map((s) => {
              const sName = s.name ?? s.url ?? s.command ?? "MCP Server";
              return `<div style="display:flex; align-items:center; gap:0.3rem; margin-bottom:0.2rem;">
                <span style="font-size:0.65rem; color:var(--green);">✓</span>
                <span style="font-size:0.7rem; color:var(--text);">${esc(sName)}</span>
              </div>`;
            }).join("")}
          </div>`
        : "";

      // Build auth section only for servers that require authentication
      const authSectionHtml = authServers.length > 0
        ? `<div class="wallet-card">
            <div id="d-mcp-toggle" class="wallet-title mcp" style="cursor:pointer; user-select:none; display:flex; justify-content:space-between; align-items:center;">
              <span>MCP SERVER AUTH</span>
              <span id="d-mcp-arrow" style="font-size:0.7rem; color:var(--dim);">▼</span>
            </div>
            <div id="d-mcp-body" style="margin-top:0.4rem;">
              ${authServers.map((s, i) => {
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
          </div>`
        : "";

      mcpSection.innerHTML = toolsListHtml + authSectionHtml;

      // Wire up collapsible toggle (only exists if auth servers present)
      const mcpToggle = mcpSection.querySelector("#d-mcp-toggle") as HTMLElement | null;
      const mcpBody = mcpSection.querySelector("#d-mcp-body") as HTMLElement | null;
      const mcpArrow = mcpSection.querySelector("#d-mcp-arrow") as HTMLElement | null;
      if (mcpToggle && mcpBody) {
        mcpToggle.addEventListener("click", () => {
          const isHidden = mcpBody.style.display === "none";
          mcpBody.style.display = isHidden ? "" : "none";
          if (mcpArrow) mcpArrow.textContent = isHidden ? "▼" : "▶";
        });
      }
      // Check existing key status (only for auth servers with URLs)
      if (serverUrls.length > 0) {
        this.net.send({ type: "check_mcp_keys", serverUrls });
      }
      // Wire up save buttons (API key auth) — only for auth servers
      authServers.forEach((s, i) => {
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
            if (statusEl) { statusEl.textContent = "✓"; statusEl.style.color = "var(--green)"; }
          });
        }
      });
      // Wire up OAuth connect/disconnect buttons — only for auth servers
      authServers.forEach((s, i) => {
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
      // Listen for key status response (only for auth servers)
      if (authServers.length > 0) {
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
        };
        this.store.mcpKeysStatusListeners.push(this.detailMcpListener);
      }
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
        const borderColor = hasHighRisk ? "var(--red)" : hasMediumRisk ? "var(--amber)" : "var(--panel-edge-soft)";
        const bgColor = hasHighRisk ? "rgba(220,38,38,0.08)" : hasMediumRisk ? "rgba(245,158,11,0.08)" : "var(--panel-soft)";
        const headerColor = hasHighRisk ? "var(--red)" : hasMediumRisk ? "var(--amber)" : "var(--dim)";
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
                const rc = e.riskLevel === "high" ? "var(--red)" : e.riskLevel === "medium" ? "var(--amber)" : "var(--dim)";
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
        <div style="margin:0.5rem 0; padding:0.6rem; border:1px solid var(--panel-edge); border-radius:0.5rem; background:var(--accent-light);">
          <div style="font-size:0.75rem; font-weight:600; color:var(--purple); margin-bottom:0.3rem;">⚡ PREMIUM API SERVICES · ${priceLabel}</div>
          <div style="display:flex; flex-direction:column; gap:0.25rem;">
            ${grouped.map((s, si) => {
              const toolCount = s.tools.length;
              return `<div style="padding:0.25rem 0.4rem; border:1px solid var(--panel-edge); border-radius:0.3rem; background:var(--accent-light);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.7rem; color:var(--text);">${esc(s.name)}</span>
                  <span style="font-size:0.65rem; color:var(--purple); font-weight:600;">$${s.pricePerCall.toFixed(4)}/call</span>
                </div>
                ${toolCount > 0 ? `<div id="hud-premium-toggle-${si}" style="font-size:0.6rem; color:var(--purple); margin-top:0.2rem; cursor:pointer; user-select:none;">▸ ${toolCount} endpoint${toolCount > 1 ? "s" : ""}</div>
                <div id="hud-premium-tools-${si}" style="display:none; max-height:100px; overflow-y:auto; margin-top:0.2rem; padding:0.25rem 0.4rem; border:1px solid var(--panel-edge); border-radius:0.25rem; background:var(--panel-soft);">
                  ${s.tools.map((t) => `<div style="font-size:0.58rem; color:var(--dim); padding:0.08rem 0; border-bottom:1px solid var(--panel-edge-soft);">${esc(t.name)}</div>`).join("")}
                </div>` : ""}
              </div>`;
            }).join("")}
          </div>
          <div style="font-size:0.62rem; color:var(--dim); margin-top:0.4rem; line-height:1.3;">
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

    // Agent growth section — only when unlocked
    const growthUnlocked = this.store.aspirationUnlocks?.agentGrowth ?? false;
    const growthSection = document.getElementById("d-growth-section")!;
    if (growthUnlocked) {
      if (agentChanged) {
        this.net.send({ type: "request_agent_growth", agentId: agent.id });
      }
      growthSection.hidden = false;
      this.renderAgentGrowth(agent.id, growthSection);
    } else {
      growthSection.hidden = true;
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

    // Aspiration-aware task framing
    const dominant = this.store.aspirationProfile?.dominant ?? null;
    const DEFAULT_FRAMING = { placeholder: "New task title…", descPlaceholder: "Description (optional)", btnLabel: "+ ADD CARD" };
    const FRAMING: Record<string, { placeholder: string; descPlaceholder: string; btnLabel: string }> = {
      warrior: { placeholder: "What challenge will your team conquer?", descPlaceholder: "Boss fight details (optional)", btnLabel: "⚔ DEPLOY SQUAD" },
      builder: { placeholder: "What should your factory produce?", descPlaceholder: "Pipeline spec (optional)", btnLabel: "⚙ START ASSEMBLY" },
      explorer: { placeholder: "What do you want to discover?", descPlaceholder: "Experiment notes (optional)", btnLabel: "🔬 LAUNCH EXPERIMENT" },
      puzzle_solver: { placeholder: "What needs to be solved?", descPlaceholder: "Problem constraints (optional)", btnLabel: "🧩 BREAK IT DOWN" },
      creator: { placeholder: "Describe your vision", descPlaceholder: "Creative brief (optional)", btnLabel: "✨ MAKE IT HAPPEN" },
      strategist: { placeholder: "What's your strategic objective?", descPlaceholder: "Strategic context (optional)", btnLabel: "♟ EXECUTE PLAN" },
    };
    const framing: { placeholder: string; descPlaceholder: string; btnLabel: string } = (dominant && FRAMING[dominant]) || DEFAULT_FRAMING;
    const titleEl = document.getElementById("board-new-title") as HTMLInputElement;
    const descEl = document.getElementById("board-new-desc") as HTMLTextAreaElement;
    const btnEl = document.getElementById("board-add-btn") as HTMLButtonElement;
    if (titleEl.placeholder !== framing.placeholder) titleEl.placeholder = framing.placeholder;
    if (descEl.placeholder !== framing.descPlaceholder) descEl.placeholder = framing.descPlaceholder;
    if (btnEl.textContent !== framing.btnLabel) btnEl.textContent = framing.btnLabel;

    // Pipeline graph toggle — show/hide based on aspiration unlock
    const pipelineToggle = document.getElementById("pipeline-toggle") as HTMLButtonElement | null;
    const dashboardToggle = document.getElementById("dashboard-toggle") as HTMLButtonElement | null;
    const decomposeToggle = document.getElementById("decompose-toggle") as HTMLButtonElement | null;
    const experimentToggle = document.getElementById("experiment-toggle") as HTMLButtonElement | null;
    const decorationToggle = document.getElementById("decoration-toggle") as HTMLButtonElement | null;
    const techTreeToggle = document.getElementById("techtree-toggle") as HTMLButtonElement | null;
    const socialToggle = document.getElementById("social-toggle") as HTMLButtonElement | null;
    const challengeToggle = document.getElementById("challenge-toggle") as HTMLButtonElement | null;
    const pipelineView = document.getElementById("pipeline-view")!;
    const dashboardView = document.getElementById("dashboard-view")!;
    const decomposeView = document.getElementById("decompose-view")!;
    const experimentView = document.getElementById("experiment-view")!;
    const decorationView = document.getElementById("decoration-view")!;
    const techTreeView = document.getElementById("techtree-view")!;
    const socialViewEl = document.getElementById("social-view")!;
    const challengeViewEl = document.getElementById("challenge-view")!;
    const boardColumns = document.getElementById("board-columns")!;
    const boardAddSection = document.getElementById("board-add-section")!;
    const pipelineUnlocked = this.store.aspirationUnlocks?.pipelineGraph ?? false;
    const dashboardUnlocked = this.store.aspirationUnlocks?.automationDashboard ?? false;
    const decomposeUnlocked = this.store.aspirationUnlocks?.decompositionScoring ?? false;
    const experimentUnlocked = this.store.aspirationUnlocks?.experimentLog ?? false;
    const decorationUnlocked = this.store.aspirationUnlocks?.officeDecoration ?? false;
    const techTreeUnlocked = this.store.aspirationUnlocks?.officeTechTree ?? false;
    const challengeUnlocked = this.store.aspirationUnlocks?.optimizationChallenges ?? false;
    if (pipelineToggle) pipelineToggle.hidden = !pipelineUnlocked;
    if (dashboardToggle) dashboardToggle.hidden = !dashboardUnlocked;
    if (decomposeToggle) decomposeToggle.hidden = !decomposeUnlocked;
    if (experimentToggle) experimentToggle.hidden = !experimentUnlocked;
    if (decorationToggle) decorationToggle.hidden = !decorationUnlocked;
    if (techTreeToggle) techTreeToggle.hidden = !techTreeUnlocked;
    const isVisitingOffice = this.store.roomType === "private" && this.store.roomOwnerId && this.store.roomOwnerId !== this.store.userId;
    if (socialToggle) socialToggle.hidden = !isVisitingOffice;
    if (challengeToggle) challengeToggle.hidden = !challengeUnlocked;

    if (this.pipelineView && pipelineUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      pipelineView.hidden = false;
      if (pipelineToggle) pipelineToggle.textContent = "📋 Board";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      pipelineView.innerHTML = "";
      pipelineView.appendChild(createPipelineGraph(this.store));
      // Add chain creation UI
      const chainDiv = document.createElement("div");
      chainDiv.style.marginTop = "16px";
      chainDiv.style.padding = "12px";
      chainDiv.style.background = "var(--panel)";
      chainDiv.style.border = "1px solid var(--panel-edge)";
      chainDiv.style.borderRadius = "8px";
      const agents = [...this.store.agents.values()].filter(
        (a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard",
      );
      const agentOptions = agents.map((a) => `<option value="${a.id}">${a.name.replace(/</g, "&lt;")}</option>`).join("");
      chainDiv.innerHTML = `
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">🔗 Compound Schedule Chain</div>
        <div style="font-size:11px;color:var(--dim);margin-bottom:8px;">Create a multi-step pipeline where each schedule triggers the next on completion. Only the first step fires on cron; the rest auto-trigger.</div>
        <input id="chain-name" placeholder="Chain name (e.g. Daily Report Pipeline)" style="width:100%;font-size:12px;padding:4px 8px;margin-bottom:8px;background:var(--panel-soft);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;" />
        <div id="chain-steps" style="display:flex;flex-direction:column;gap:6px;"></div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn" id="chain-add-step" style="font-size:11px;padding:4px 10px;">+ Add Step</button>
          <button class="btn primary" id="chain-create" style="font-size:11px;padding:4px 10px;margin-left:auto;">Create Chain</button>
        </div>
      `;
      pipelineView.appendChild(chainDiv);

      // Chain step builder
      let stepCount = 0;
      const stepsContainer = chainDiv.querySelector("#chain-steps") as HTMLElement;
      const addStep = () => {
        stepCount++;
        const stepDiv = document.createElement("div");
        stepDiv.style.cssText = "display:grid;grid-template-columns:30px 1fr 1fr 1fr;gap:4px;align-items:center;";
        stepDiv.innerHTML = `
          <span style="font-size:11px;color:var(--dim);">${stepCount}.</span>
          <select class="chain-step-agent" style="font-size:11px;padding:3px 6px;background:var(--panel-soft);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;">
            <option value="">Agent…</option>
            ${agentOptions}
          </select>
          <input class="chain-step-task" placeholder="Task…" style="font-size:11px;padding:3px 6px;background:var(--panel-soft);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;" />
          <select class="chain-step-cron" style="font-size:11px;padding:3px 6px;background:var(--panel-soft);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;">
            <option value="0 * * * *">Hourly</option>
            <option value="0 9 * * *">Daily 9am</option>
            <option value="0 9 * * 1">Weekly Mon</option>
            <option value="*/15 * * * *">Every 15min</option>
            <option value="*/30 * * * *">Every 30min</option>
            <option value="0 */6 * * *">Every 6h</option>
          </select>
        `;
        stepsContainer.appendChild(stepDiv);
      };
      // Start with 2 steps
      addStep();
      addStep();
      chainDiv.querySelector("#chain-add-step")!.addEventListener("click", (e) => { e.preventDefault(); addStep(); });
      chainDiv.querySelector("#chain-create")!.addEventListener("click", (e) => {
        e.preventDefault();
        const name = (chainDiv.querySelector("#chain-name") as HTMLInputElement).value.trim();
        if (!name) return;
        const stepEls = stepsContainer.querySelectorAll(":scope > div");
        const steps: { agentId: string; name: string; task: string; cronExpression: string }[] = [];
        stepEls.forEach((el, i) => {
          const agentId = (el.querySelector(".chain-step-agent") as HTMLSelectElement).value;
          const task = (el.querySelector(".chain-step-task") as HTMLInputElement).value.trim();
          const cron = (el.querySelector(".chain-step-cron") as HTMLSelectElement).value;
          if (agentId && task) steps.push({ agentId, name: `Step ${i + 1}`, task, cronExpression: cron });
        });
        if (steps.length < 2) return;
        this.net.send({ type: "create_schedule_chain", chainName: name, steps });
      });

      return;
    } else if (this.dashboardView && dashboardUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      dashboardView.hidden = false;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📋 Board";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      this.renderAutomationDashboard(dashboardView);
      this.wireDashboardButtons();
      return;
    } else if (this.decomposeView && decomposeUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      decomposeView.hidden = false;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "📋 Board";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      this.renderDecomposeView(decomposeView);
      return;
    } else if (this.experimentView && experimentUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = false;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "📋 Board";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      this.renderExperimentView(experimentView);
      return;
    } else if (this.decorationView && decorationUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = false;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "📋 Board";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      this.renderDecorationView(decorationView);
      return;
    } else if (this.socialView && isVisitingOffice) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = false;
      challengeViewEl.hidden = true;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      if (socialToggle) socialToggle.textContent = "📋 Board";
      if (challengeToggle) challengeToggle.textContent = "🏆 Challenge";
      this.renderSocialPanel(socialViewEl);
      return;
    } else if (this.techTreeView && techTreeUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = false;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "📋 Board";
      if (socialToggle) socialToggle.textContent = "💬 Social";
      if (challengeToggle) challengeToggle.textContent = "🏆 Challenge";
      this.renderTechTreeView(techTreeView);
      return;
    } else if (this.challengeView && challengeUnlocked) {
      boardColumns.hidden = true;
      boardAddSection.hidden = true;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = false;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      if (socialToggle) socialToggle.textContent = "💬 Social";
      if (challengeToggle) challengeToggle.textContent = "📋 Board";
      this.renderChallengeView(challengeViewEl);
      return;
    } else {
      boardColumns.hidden = false;
      boardAddSection.hidden = false;
      pipelineView.hidden = true;
      dashboardView.hidden = true;
      decomposeView.hidden = true;
      experimentView.hidden = true;
      decorationView.hidden = true;
      techTreeView.hidden = true;
      socialViewEl.hidden = true;
      challengeViewEl.hidden = true;
      if (pipelineToggle) pipelineToggle.textContent = "⚙ Pipeline";
      if (dashboardToggle) dashboardToggle.textContent = "📊 Dashboard";
      if (decomposeToggle) decomposeToggle.textContent = "🧩 Decompose";
      if (experimentToggle) experimentToggle.textContent = "🧪 Log";
      if (decorationToggle) decorationToggle.textContent = "🪑 Decorate";
      if (techTreeToggle) techTreeToggle.textContent = "🌳 Tech Tree";
      if (socialToggle) socialToggle.textContent = "💬 Social";
      if (challengeToggle) challengeToggle.textContent = "🏆 Challenge";
    }

    const cards = [...this.store.board.values()].sort((a, b) => a.createdAt - b.createdAt);
    const agents = [...this.store.agents.values()];

    // signature: board open state + card data + agent roster (for dropdowns) + aspiration framing
    const sig =
      this.store.boardOpen + "|" +
      cards.map((c) => c.id + c.status + c.assignedAgentId + c.title + (c.type ?? "") + (c.progress ?? 0)).join(",") + "|" +
      agents.map((a) => a.id + a.name + a.status).join(",") + "|" + (dominant ?? "");
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
        ? `<span class="card-assignee" style="color:${agent?.accent ?? 'var(--dim)'}">${esc(assigned)}${statusDot}</span>`
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
      const catColors: Record<string, string> = { frontend: "#61dafb", backend: "#68a063", devops: "#326ce5", data: "var(--red)", writing: "var(--yellow)", research: "var(--purple)", crypto: "#f7931a", general: "var(--dim)" };
      const catBadge = c.category ? `<span class="card-cat-badge" style="color:${catColors[c.category] ?? 'var(--dim)'}">${esc(c.category)}</span>` : "";
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

  private renderStatsBar(): void {
    const bar = document.getElementById("stats-bar");
    if (!bar) return;

    const hireable = [...this.store.agents.values()].filter(
      (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
    );
    const tasksDone = achievements.getStat("tasksDone");
    const creaturesKilled = achievements.getStat("creaturesKilled");
    const bossesSlain = achievements.getStat("bossesSlain");
    const weapons = achievements.getSetSize("weapons");
    const holes = achievements.getStat("holeInOnes");
    const achCount = achievements.getUnlockedCount();
    const achTotal = achievements.getTotalCount();
    const hasCrown = achievements.isUnlocked("from_cubicle_to_conqueror");

    // Build compact stat chips — only show ones with > 0 value to avoid clutter
    const chips: { icon: string; value: string; label: string; glow?: boolean }[] = [
      { icon: "📋", value: String(tasksDone), label: "Tasks" },
      { icon: "🤖", value: String(hireable.length), label: "Agents" },
    ];
    if (creaturesKilled > 0) chips.push({ icon: "⚔️", value: String(creaturesKilled), label: "Kills" });
    if (bossesSlain > 0) chips.push({ icon: "🐲", value: String(bossesSlain), label: "Bosses" });
    if (weapons > 0) chips.push({ icon: "🗡️", value: String(weapons), label: "Weapons" });
    if (holes > 0) chips.push({ icon: "⛳", value: String(holes), label: "Holes" });
    chips.push({ icon: "🏆", value: `${achCount}/${achTotal}`, label: "Ach" });
    if (hasCrown) chips.push({ icon: "👑", value: "", label: "Crown", glow: true });

    const sig = chips.map(c => `${c.icon}${c.value}`).join("|");
    if (sig === this._statsBarSig) return;
    this._statsBarSig = sig;

    bar.innerHTML = chips.map(c =>
      `<span class="stat-chip${c.glow ? " stat-chip-glow" : ""}" title="${c.label}">${c.icon}${c.value ? ` <b>${c.value}</b>` : ""}</span>`
    ).join("");
  }

  private _statsBarSig = "";

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
    const activeTab = this._achTab ?? "achievements";
    let html = `<div class="ach-modal-content">`;
    html += `<div class="ach-modal-sticky">`;
    html += `<div class="ach-modal-header">`;
    html += `<span class="ach-modal-title">🏆 ACHIEVEMENTS</span>`;
    html += `<span class="ach-modal-progress">${count} / ${total}</span>`;
    html += `<button class="x" id="ach-close">✕</button>`;
    html += `</div>`;
    html += `<div class="ach-modal-progress-bar"><div class="ach-modal-progress-fill" style="width:${(count / total) * 100}%"></div></div>`;
    html += `<div class="ach-tabs">`;
    html += `<button class="ach-tab${activeTab === "achievements" ? " active" : ""}" id="ach-tab-achievements">Achievements</button>`;
    html += `<button class="ach-tab${activeTab === "stats" ? " active" : ""}" id="ach-tab-stats">Combat Record</button>`;
    html += `<button class="ach-tab${activeTab === "leaderboards" ? " active" : ""}" id="ach-tab-leaderboards">Leaderboards</button>`;
    html += `<button class="ach-tab${activeTab === "aspiration" ? " active" : ""}" id="ach-tab-aspiration">⭐ Aspiration</button>`;
    html += `</div>`;
    html += `</div>`;
    if (activeTab === "stats") {
      html += this.renderStatsTab();
    } else if (activeTab === "leaderboards") {
      html += this.renderLeaderboardsTab();
    } else if (activeTab === "aspiration") {
      html += this.renderAspirationTab();
    } else {
      // Aspiration-aware "Recommended for You" section
      const dominant = this.store.aspirationProfile?.dominant ?? null;
      const ASPIRATION_TIERS: Record<string, string[]> = {
        warrior: ["Warrior", "Adventurer"],
        builder: ["Agent Mastery"],
        explorer: ["Explorer"],
        puzzle_solver: ["Agent Mastery"],
        creator: ["First Steps"],
        strategist: ["Agent Mastery"],
      };
      const recommendedTiers = dominant ? (ASPIRATION_TIERS[dominant] ?? []) : [];

      if (dominant && recommendedTiers.length > 0) {
        const recommended = ACHIEVEMENTS.filter((a) => recommendedTiers.includes(a.tier) && !unlocked.has(a.id) && !a.comingSoon);
        if (recommended.length > 0) {
          html += `<div class="ach-tier-name">⭐ Recommended for You</div>`;
          html += `<div class="ach-tier-grid">`;
          for (const a of recommended.slice(0, 4)) {
            html += `<div class="ach-card locked">`;
            html += `<span class="ach-icon">❓</span>`;
            html += `<div class="ach-info">`;
            html += `<span class="ach-name">${a.name}</span>`;
            html += `<span class="ach-desc">${a.desc}</span>`;
            html += `</div></div>`;
          }
          html += `</div>`;
        }
      }

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
    }
    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;
    document.getElementById("ach-close")!.addEventListener("click", () => {
      this.store.toggleAchievements(false);
    });
    document.getElementById("ach-tab-achievements")?.addEventListener("click", () => {
      this._achTab = "achievements";
      this.renderAchievements();
    });
    document.getElementById("ach-tab-stats")?.addEventListener("click", () => {
      this._achTab = "stats";
      this.renderAchievements();
    });
    document.getElementById("ach-tab-leaderboards")?.addEventListener("click", () => {
      this._achTab = "leaderboards";
      this.renderAchievements();
    });
    document.getElementById("ach-tab-aspiration")?.addEventListener("click", () => {
      this._achTab = "aspiration";
      this.net.send({ type: "request_aspiration_dashboard" });
      this.renderAchievements();
    });
    // If aspiration tab is active, request dashboard data and listen for updates
    if (this._achTab === "aspiration") {
      this.net.send({ type: "request_aspiration_dashboard" });
    }
  }

  private _achTab: "achievements" | "stats" | "leaderboards" | "aspiration" = "achievements";

  private formatSpeedrun(ms: number): string {
    if (!ms || ms <= 0) return "—";
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  private renderAspirationTab(): string {
    const TRACKS = [
      { key: "warrior", label: "Warrior", icon: "⚔️", color: "#ef4444" },
      { key: "builder", label: "Builder", icon: "🔨", color: "var(--green)" },
      { key: "explorer", label: "Explorer", icon: "🧭", color: "#3b82f6" },
      { key: "puzzle_solver", label: "Puzzle Solver", icon: "🧩", color: "#a855f7" },
      { key: "creator", label: "Creator", icon: "🎨", color: "#ec4899" },
      { key: "strategist", label: "Strategist", icon: "♟️", color: "#f59e0b" },
    ];

    const SIGNAL_LABELS: Record<string, string> = {
      creature_killed: "Creature defeated", boss_slain: "Boss slain", weapon_collected: "Weapon collected",
      crown_placed: "Crown placed", speedrun_recorded: "Speedrun recorded", world_explored: "World explored",
      handoff_created: "Agent handoff created", scheduled_task: "Scheduled task",
      task_completed_unattended: "Task completed autonomously", multiple_agents_working: "Multiple agents working",
      pipeline_created: "Pipeline created", agent_rehired_different_config: "Agent rehired with new config",
      mcp_server_installed: "MCP server installed", new_agent_model_tried: "New model tried",
      world_generated: "World generated", agent_fired: "Agent fired",
      manual_subtask_with_deps: "Subtask with dependencies", phase_gate_used: "Phase gate used",
      task_zero_rework: "Zero-rework task", manual_agent_assignment: "Manual agent assignment",
      office_theme_changed: "Office theme changed", wardrobe_used: "Wardrobe used",
      character_customized: "Character customized", trophy_room_shared: "Trophy room viewed",
      office_visited: "Office visited", org_created: "Organization created",
      agent_count_grew: "Agent count grew", daily_return_streak: "Daily return",
      agent_performance_improved: "Agent performance improved", strategic_hire: "Strategic hire",
    };

    const dash = this.store.aspirationDashboard;
    if (!dash) {
      return `<div style="text-align:center;padding:40px;color:#888;">Loading aspiration data…</div>`;
    }

    const scores = TRACKS.map((t) => dash.scores[t.key] ?? 0);
    const dominant = dash.dominant;
    const dominantInfo = TRACKS.find((t) => t.key === dominant);

    let html = `<div style="padding:16px;max-height:70vh;overflow-y:auto;">`;

    // ── Header with dominant aspiration ──
    html += `<div style="text-align:center;margin-bottom:20px;">`;
    if (dominantInfo) {
      html += `<div style="font-size:28px;margin-bottom:4px;">${dominantInfo.icon}</div>`;
      html += `<div style="font-size:18px;font-weight:600;color:${dominantInfo.color};">Dominant: ${dominantInfo.label}</div>`;
      html += `<div style="font-size:13px;color:var(--dim);margin-top:4px;">${dash.signalCount} signals recorded</div>`;
    } else {
      html += `<div style="font-size:16px;color:var(--dim);">No dominant aspiration yet</div>`;
      html += `<div style="font-size:13px;color:var(--dim);margin-top:4px;">Keep playing — your profile emerges after ~5 signals</div>`;
    }
    html += `</div>`;

    // ── Radar Chart (canvas) ──
    html += `<div style="display:flex;justify-content:center;margin-bottom:24px;">`;
    html += `<canvas id="aspiration-radar" width="280" height="280" style="background:var(--panel-soft);border-radius:12px;"></canvas>`;
    html += `</div>`;

    // ── Score bars ──
    html += `<div style="margin-bottom:24px;">`;
    for (const t of TRACKS) {
      const score = dash.scores[t.key] ?? 0;
      const pct = Math.round(score * 100);
      const isDominant = t.key === dominant;
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">`;
      html += `<span style="font-size:16px;width:24px;">${t.icon}</span>`;
      html += `<span style="font-size:13px;width:100px;color:var(--text);">${t.label}</span>`;
      html += `<div style="flex:1;height:8px;background:var(--panel-edge-soft);border-radius:4px;overflow:hidden;">`;
      html += `<div style="width:${pct}%;height:100%;background:${t.color};border-radius:4px;transition:width 0.3s;"></div>`;
      html += `</div>`;
      html += `<span style="font-size:12px;width:36px;text-align:right;color:${isDominant ? t.color : "var(--dim)"};font-weight:${isDominant ? "600" : "400"};">${pct}%</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // ── Unlock Progress ──
    html += `<div style="margin-bottom:24px;">`;
    html += `<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px;">🔓 Feature Unlocks</div>`;
    for (const u of dash.unlocks) {
      const trackInfo = TRACKS.find((t) => t.key === u.track);
      const color = trackInfo?.color ?? "var(--dim)";
      const pct = Math.min(100, Math.round((u.currentScore / u.threshold) * 100));
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 12px;background:var(--panel);border-radius:8px;border:1px solid ${u.unlocked ? color : "var(--panel-edge)"};">`;
      html += `<span style="font-size:18px;">${u.icon}</span>`;
      html += `<div style="flex:1;">`;
      html += `<div style="font-size:13px;color:${u.unlocked ? color : "var(--dim)"};font-weight:${u.unlocked ? "600" : "400"};">${u.label}</div>`;
      html += `<div style="height:6px;background:var(--panel-edge-soft);border-radius:3px;overflow:hidden;margin-top:4px;">`;
      html += `<div style="width:${pct}%;height:100%;background:${u.unlocked ? color : "var(--panel-edge)"};border-radius:3px;"></div>`;
      html += `</div>`;
      html += `</div>`;
      html += `<span style="font-size:11px;color:${u.unlocked ? color : "var(--dim)"};width:50px;text-align:right;">${u.unlocked ? "✓ Unlocked" : `${pct}%`}</span>`;
      html += `</div>`;
    }
    html += `</div>`;

    // ── Signal History ──
    html += `<div>`;
    html += `<div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:12px;">📡 Recent Signals</div>`;
    if (dash.history.length === 0) {
      html += `<div style="text-align:center;color:var(--dim);padding:16px;font-size:13px;">No signals yet — your actions will appear here</div>`;
    } else {
      const recent = dash.history.slice(-20).reverse();
      for (const h of recent) {
        const trackInfo = TRACKS.find((t) => t.key === h.aspiration);
        const label = SIGNAL_LABELS[h.key] ?? h.aspiration;
        const time = new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 12px;margin-bottom:4px;background:var(--panel);border-radius:6px;">`;
        html += `<span style="font-size:14px;">${trackInfo?.icon ?? "•"}</span>`;
        html += `<span style="flex:1;font-size:12px;color:var(--text);">${label}</span>`;
        html += `<span style="font-size:11px;color:var(--dim);">${time}</span>`;
        html += `</div>`;
      }
    }
    html += `</div>`;

    html += `</div>`;

    // Schedule radar chart drawing after DOM update
    requestAnimationFrame(() => this.drawRadarChart("aspiration-radar", scores, TRACKS));

    return html;
  }

  private drawRadarChart(canvasId: string, scores: number[], tracks: { key: string; label: string; color: string }[]): void {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 40;
    const n = scores.length;
    const angleStep = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid rings (0.25, 0.5, 0.75, 1.0)
    for (let ring = 1; ring <= 4; ring++) {
      const r = (radius * ring) / 4;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = ring === 4 ? "var(--panel-edge)" : "var(--panel-edge-soft)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw axis lines and labels
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "var(--panel-edge-soft)";
      const labelX = cx + (radius + 20) * Math.cos(angle);
      const labelY = cy + (radius + 20) * Math.sin(angle);
      ctx.fillStyle = tracks[i].color;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tracks[i].label, labelX, labelY);
    }

    // Draw data polygon
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const r = radius * Math.min(1, scores[i]);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(93, 217, 127, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "var(--green)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw data points
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2;
      const r = radius * Math.min(1, scores[i]);
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = tracks[i].color;
      ctx.fill();
    }
  }

  private renderStatsTab(): string {
    const hireable = [...this.store.agents.values()].filter(
      (a) => a.id !== OFFICE_MANAGER_ID && a.id !== HERMES_ID && a.id !== WIZARD_ID,
    );
    const stats: { label: string; value: string; icon: string }[] = [
      { icon: "📋", label: "Tasks Completed", value: String(achievements.getStat("tasksDone")) },
      { icon: "🤖", label: "Agents Hired", value: String(hireable.length) },
      { icon: "⚔️", label: "Creatures Killed", value: String(achievements.getStat("creaturesKilled")) },
      { icon: "🐲", label: "Bosses Slain", value: String(achievements.getStat("bossesSlain")) },
      { icon: "🗡️", label: "Weapons Collected", value: String(achievements.getSetSize("weapons")) },
      { icon: "⛳", label: "Hole-in-Ones", value: String(achievements.getStat("holeInOnes")) },
      { icon: "🪓", label: "Trees Chopped", value: String(achievements.getStat("treesChopped")) },
      { icon: "💐", label: "Flowers Picked", value: String(achievements.getStat("flowersPicked")) },
      { icon: "🔥", label: "Agents Fired", value: String(achievements.getStat("agentsFired")) },
      { icon: "🤝", label: "Agents Recruited Back", value: String(achievements.getStat("agentsRecruited")) },
      { icon: "📌", label: "Board Cards Done", value: String(achievements.getStat("boardCardsDone")) },
      { icon: "⏱️", label: "Crown Speedrun", value: this.formatSpeedrun(achievements.getStat("speedrunTimeMs")) },
      { icon: "🏆", label: "Achievements Unlocked", value: `${achievements.getUnlockedCount()} / ${achievements.getTotalCount()}` },
    ];

    let html = `<div class="ach-stats-grid">`;
    for (const s of stats) {
      html += `<div class="ach-stat-card">`;
      html += `<span class="ach-stat-icon">${s.icon}</span>`;
      html += `<span class="ach-stat-value">${s.value}</span>`;
      html += `<span class="ach-stat-label">${s.label}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
    return html;
  }

  // ── Leaderboards tab ──

  private _lbCategory: LeaderboardCategory = "boss_rating";
  private _lbPeriod: "weekly" | "alltime" = "alltime";
  private _lbEntries: LeaderboardEntry[] = [];
  private _lbLoading = false;

  private renderLeaderboardsTab(): string {
    const categories: { id: LeaderboardCategory; label: string; icon: string }[] = [
      { id: "boss_rating", label: "Boss Rating", icon: "👑" },
      { id: "most_tasks_completed", label: "Tasks Done", icon: "📋" },
      { id: "most_creatures_slain", label: "Creatures Slain", icon: "⚔️" },
      { id: "deepest_explorers", label: "Deepest Explorers", icon: "🧭" },
      { id: "fastest_crown", label: "Fastest Crown", icon: "⏱️" },
    ];

    let html = `<div class="ach-lb-container">`;

    // Category selector
    html += `<div class="ach-lb-categories">`;
    for (const cat of categories) {
      const active = this._lbCategory === cat.id;
      html += `<button class="ach-lb-cat${active ? " active" : ""}" id="lb-cat-${cat.id}">${cat.icon} ${cat.label}</button>`;
    }
    html += `</div>`;

    // Period toggle
    html += `<div class="ach-lb-period">`;
    html += `<button class="ach-lb-period-btn${this._lbPeriod === "alltime" ? " active" : ""}" id="lb-period-alltime">All-Time</button>`;
    html += `<button class="ach-lb-period-btn${this._lbPeriod === "weekly" ? " active" : ""}" id="lb-period-weekly">This Week</button>`;
    html += `</div>`;

    // Entries
    if (this._lbLoading) {
      html += `<div class="ach-lb-loading">Loading...</div>`;
    } else if (this._lbEntries.length === 0) {
      html += `<div class="ach-lb-empty">No entries yet. Be the first!</div>`;
    } else {
      html += `<div class="ach-lb-list">`;
      for (const entry of this._lbEntries) {
        const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `${entry.rank}.`;
        html += `<div class="ach-lb-row">`;
        html += `<span class="ach-lb-rank">${medal}</span>`;
        html += `<span class="ach-lb-name">${entry.playerName}</span>`;
        html += `<span class="ach-lb-score">${entry.scoreLabel}</span>`;
        html += `</div>`;
      }
      html += `</div>`;
    }

    // Share button
    html += `<div class="ach-lb-share">`;
    html += `<button class="btn" id="lb-share-btn" style="margin-top: 0.75rem;">🔗 Share Your Trophy Room</button>`;
    html += `</div>`;

    html += `</div>`;

    // Wire up interactions after render
    setTimeout(() => {
      for (const cat of categories) {
        document.getElementById(`lb-cat-${cat.id}`)?.addEventListener("click", () => {
          this._lbCategory = cat.id;
          this.fetchLeaderboard();
        });
      }
      document.getElementById("lb-period-alltime")?.addEventListener("click", () => {
        this._lbPeriod = "alltime";
        this.fetchLeaderboard();
      });
      document.getElementById("lb-period-weekly")?.addEventListener("click", () => {
        this._lbPeriod = "weekly";
        this.fetchLeaderboard();
      });
      document.getElementById("lb-share-btn")?.addEventListener("click", () => {
        this.shareTrophyRoom();
      });
    }, 0);

    // Fetch if not loading and entries are empty or category/period changed
    if (!this._lbLoading && this._lbEntries.length === 0) {
      this.fetchLeaderboard();
    }

    return html;
  }

  private fetchLeaderboard(): void {
    this._lbLoading = true;
    this.renderAchievements();
    this.store.sendFn?.({ type: "get_leaderboard", category: this._lbCategory, period: this._lbPeriod });
  }

  private onLeaderboardResult(entries: LeaderboardEntry[]): void {
    this._lbLoading = false;
    this._lbEntries = entries;
    if (this.store.achievementsOpen) this.renderAchievements();
  }

  private shareTrophyRoom(): void {
    const playerName = this.store.player?.name;
    if (!playerName) {
      this.toast("Set up your player name first!");
      return;
    }
    const url = `${window.location.origin}/u/${encodeURIComponent(playerName)}`;
    if (navigator.share) {
      navigator.share({ title: `${playerName}'s Trophy Room — Agent Heights`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        this.toast("Trophy room link copied to clipboard!");
      }).catch(() => {
        this.toast(`Share: ${url}`);
      });
    }
  }

  private renderDecomposingPanel(): void {
    const text = this.store.managerDecomposingText;
    let panel = document.getElementById("decomposing-panel");
    // Clear panel if decomposition is done (Office Manager no longer thinking/working)
    const om = this.store.agents.get("office-manager");
    if (text && om && om.status !== "thinking" && om.status !== "working" && om.status !== "waiting") {
      this.store.managerDecomposingText = null;
      if (panel) panel.remove();
      return;
    }
    if (!text) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "decomposing-panel";
      panel.className = "decomposing-panel";
      document.body.appendChild(panel);
    }
    const displayText = text.length > 500 ? text.slice(-500) : text;
    panel.innerHTML = `<div class="decomposing-header">📋 Office Manager is planning...</div><pre class="decomposing-text">${displayText.replace(/</g, "&lt;")}</pre>`;
  }

  private renderABComparison(agents: { id: string; name: string }[]): string {
    const options = agents.map((a) => `<option value="${a.id}">${a.name.replace(/</g, "&lt;")}</option>`).join("");
    const result = this.store.abComparison;

    let resultHtml = "";
    if (result) {
      const a = result.agentA;
      const b = result.agentB;
      const aSuccess = Math.round(a.successRate * 100);
      const bSuccess = Math.round(b.successRate * 100);
      const aDur = a.avgDurationMin.toFixed(1);
      const bDur = b.avgDurationMin.toFixed(1);

      resultHtml = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
          <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:8px;padding:10px;">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">${a.name.replace(/</g, "&lt;")}</div>
            <div style="font-size:11px;color:var(--dim);">Model: ${a.model.replace(/</g, "&lt;")}</div>
            <div style="font-size:11px;color:var(--dim);">Tasks: ${a.tasksDone} · Success: ${aSuccess}% · Avg: ${aDur}min</div>
          </div>
          <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:8px;padding:10px;">
            <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">${b.name.replace(/</g, "&lt;")}</div>
            <div style="font-size:11px;color:var(--dim);">Model: ${b.model.replace(/</g, "&lt;")}</div>
            <div style="font-size:11px;color:var(--dim);">Tasks: ${b.tasksDone} · Success: ${bSuccess}% · Avg: ${bDur}min</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--green);margin-top:8px;font-weight:600;">📊 ${result.verdict.replace(/</g, "&lt;")}</div>
      `;
    }

    return `
      <div style="background:var(--panel);border:1px solid var(--panel-edge);border-radius:8px;padding:12px;margin-bottom:12px;">
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">⚖️ A/B Agent Comparison</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
          <select id="ab-agent-a" style="font-size:12px;padding:4px 8px;background:var(--panel);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;flex:1;">
            <option value="">Select agent A…</option>
            ${options}
          </select>
          <span style="font-size:14px;color:var(--dim);">vs</span>
          <select id="ab-agent-b" style="font-size:12px;padding:4px 8px;background:var(--panel);color:var(--text);border:1px solid var(--panel-edge);border-radius:4px;flex:1;">
            <option value="">Select agent B…</option>
            ${options}
          </select>
          <button class="btn" id="ab-compare-btn" style="font-size:12px;padding:4px 12px;">Compare</button>
        </div>
        ${resultHtml}
      </div>
    `;
  }

  private renderExperimentView(container: HTMLElement): void {
    const entries = this.store.experimentLog;
    const typeIcons: Record<string, string> = {
      config_change: "⚙️",
      mcp_install: "🔌",
      model_swap: "🔄",
      agent_hire: "👋",
      agent_fire: "👋",
    };
    const verdictColors: Record<string, string> = {
      confirmed: "var(--green)",
      refuted: "var(--red)",
      inconclusive: "var(--amber)",
      pending: "var(--dim)",
    };

    if (entries.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--dim);">
          <div style="font-size: 48px; margin-bottom: 12px;">🧪</div>
          <div style="font-size: 16px; margin-bottom: 8px;">No experiments yet</div>
          <div style="font-size: 13px; max-width: 400px; margin: 0 auto;">
            Every time you hire an agent, fire one, or change their config, it gets logged here.
            Think of it as your lab notebook. Write hypotheses. Track results. Science!
          </div>
        </div>
      `;
      return;
    }

    const entriesHtml = entries.map((e) => {
      const date = new Date(e.timestamp).toLocaleString();
      const icon = typeIcons[e.type] ?? "📝";
      const verdictColor = verdictColors[e.verdict] ?? "var(--dim)";
      const resultStr = e.result.tasksCompleted !== null
        ? `${e.result.tasksCompleted} tasks completed`
        : "results pending";
      return `
        <div style="background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="font-size: 18px;">${icon}</span>
            <span style="font-size: 14px; font-weight: 600; color: var(--text);">${e.agentName}</span>
            <span style="font-size: 11px; color: var(--dim); margin-left: auto;">${date}</span>
          </div>
          <div style="font-size: 12px; color: var(--dim); margin-bottom: 6px;">
            <span style="color: var(--dim);">Hypothesis:</span> ${e.hypothesis.replace(/</g, "&lt;")}
          </div>
          <div style="font-size: 11px; color: var(--dim); margin-bottom: 4px;">
            <span style="color: var(--dim);">Before:</span> ${e.setup.before.replace(/</g, "&lt;")}
          </div>
          <div style="font-size: 11px; color: var(--dim); margin-bottom: 6px;">
            <span style="color: var(--dim);">After:</span> ${e.setup.after.replace(/</g, "&lt;")}
          </div>
          <div style="display: flex; align-items: center; gap: 12px; margin-top: 8px;">
            <span style="font-size: 11px; color: ${verdictColor}; font-weight: 600; text-transform: uppercase;">${e.verdict}</span>
            <span style="font-size: 11px; color: var(--dim);">${resultStr}</span>
            <select class="exp-verdict-select" data-entry-id="${e.id}" style="margin-left: auto; font-size: 11px; padding: 2px 6px; background: var(--panel-soft); color: var(--text); border: 1px solid var(--panel-edge); border-radius: 4px;">
              <option value="">Set verdict…</option>
              <option value="confirmed">Confirmed</option>
              <option value="refuted">Refuted</option>
              <option value="inconclusive">Inconclusive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          ${e.notes ? `<div style="font-size: 11px; color: var(--dim); margin-top: 6px; font-style: italic;">"${e.notes.replace(/</g, "&lt;")}"</div>` : ""}
          <input class="exp-notes-input" data-entry-id="${e.id}" placeholder="Add notes…" value="${e.notes.replace(/"/g, "&quot;")}" style="width: 100%; margin-top: 6px; font-size: 11px; padding: 4px 8px; background: var(--panel-soft); color: var(--text); border: 1px solid var(--panel-edge); border-radius: 4px;" />
        </div>
      `;
    }).join("");

    const agents = [...this.store.agents.values()].filter(
      (a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard",
    );
    const abUnlocked = this.store.aspirationUnlocks?.abComparison ?? false;
    const abHtml = abUnlocked && agents.length >= 2 ? this.renderABComparison(agents) : "";

    container.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 700; color: var(--text);">🧪 Experiment Log</div>
        <div style="font-size: 12px; color: var(--dim); margin-top: 2px;">${entries.length} experiment${entries.length === 1 ? "" : "s"} logged. Every hire, fire, and config change is a data point.</div>
      </div>
      ${abHtml}
      ${entriesHtml}
    `;

    // Wire A/B comparison button
    const abBtn = document.getElementById("ab-compare-btn");
    if (abBtn) {
      abBtn.addEventListener("click", () => {
        const selA = document.getElementById("ab-agent-a") as HTMLSelectElement;
        const selB = document.getElementById("ab-agent-b") as HTMLSelectElement;
        if (selA && selB && selA.value && selB.value && selA.value !== selB.value) {
          this.net.send({ type: "request_ab_comparison", agentAId: selA.value, agentBId: selB.value });
        }
      });
    }

    // Wire verdict selects
    container.querySelectorAll<HTMLSelectElement>(".exp-verdict-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const entryId = sel.dataset.entryId!;
        this.net.send({ type: "update_experiment_entry", entryId, verdict: sel.value });
      });
    });

    // Wire notes inputs
    container.querySelectorAll<HTMLInputElement>(".exp-notes-input").forEach((input) => {
      input.addEventListener("change", () => {
        const entryId = input.dataset.entryId!;
        this.net.send({ type: "update_experiment_entry", entryId, notes: input.value });
      });
    });
  }

  private renderDecorationView(container: HTMLElement): void {
    const categories: DecorationCategory[] = ["furniture", "plants", "wall_decor", "flooring", "lighting", "special"];
    const categoryLabels: Record<string, string> = {
      furniture: "🪑 Furniture",
      plants: "🪴 Plants",
      wall_decor: "🖼️ Wall Decor",
      flooring: "🟫 Flooring",
      lighting: "💡 Lighting",
      special: "🏆 Special",
    };

    // Compute unlock stats
    const tasksDone = [...this.store.board.values()].filter((c) => c.status === "done").length;
    const agentsHired = this.store.agents.size;
    const achievementsUnlocked = achievements.getUnlockedCount();
    const stats = { tasksDone, agentsHired, dayStreak: 0, achievementsUnlocked };

    const decorations = this.store.decorations;

    container.innerHTML = `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 15px; font-weight: 700; margin-bottom: 4px;">🪑 Office Decoration</div>
        <div style="font-size: 12px; color: var(--dim);">Click an item to enter placement mode. Click on the floor to place. Click an existing decoration to remove it. Press ESC to exit.</div>
      </div>
      <div style="display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap;">
        ${categories.map((cat) => `<button class="btn deco-cat-btn" data-cat="${cat}" style="font-size: 11px; padding: 4px 10px;">${categoryLabels[cat]}</button>`).join("")}
      </div>
      <div id="deco-item-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;"></div>
      <div style="margin-top: 16px; border-top: 1px solid var(--panel-edge); padding-top: 12px;">
        <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Placed Decorations (${decorations.length})</div>
        <div id="deco-placed-list" style="display: flex; flex-direction: column; gap: 4px;"></div>
      </div>
    `;

    // Category buttons
    let activeCategory: DecorationCategory = "furniture";
    const grid = container.querySelector("#deco-item-grid") as HTMLElement;

    const renderGrid = () => {
      const items = DECORATION_CATALOG.filter((c) => c.category === activeCategory);
      grid.innerHTML = items.map((item) => {
        const unlocked = this.isDecorationUnlocked(item.type, stats);
        return `
          <div class="deco-item ${unlocked ? "" : "locked"}" data-type="${item.type}" style="
            display: flex; flex-direction: column; align-items: center; gap: 4px;
            padding: 10px 6px; border-radius: 8px; cursor: ${unlocked ? "pointer" : "not-allowed"};
            background: ${unlocked ? "var(--panel-soft)" : "var(--panel-soft)"}; border: 1px solid ${unlocked ? "var(--panel-edge)" : "var(--panel-edge-soft)"};
            transition: border-color 0.15s;
          " ${unlocked ? "" : "title=\"Unlock: " + item.unlockRequirement + "\""}>
            <span style="font-size: 28px; ${unlocked ? "" : "filter: grayscale(1); opacity: 0.4;"}">${item.emoji}</span>
            <span style="font-size: 10px; color: ${unlocked ? "var(--text)" : "var(--dim)"}; text-align: center;">${item.label}</span>
            ${unlocked ? "" : `<span style="font-size: 9px; color: var(--dim);">🔒 ${item.unlockRequirement}</span>`}
          </div>
        `;
      }).join("");

      // Wire item clicks
      grid.querySelectorAll(".deco-item").forEach((el) => {
        if (el.classList.contains("locked")) return;
        el.addEventListener("click", () => {
          const type = (el as HTMLElement).dataset.type!;
          this.enterDecorationPlacementMode(type);
        });
      });
    };

    container.querySelectorAll(".deco-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCategory = (btn as HTMLElement).dataset.cat as DecorationCategory;
        container.querySelectorAll(".deco-cat-btn").forEach((b) => (b as HTMLElement).style.background = "");
        (btn as HTMLElement).style.background = "var(--accent-light)";
        renderGrid();
      });
    });

    // Highlight first category
    const firstBtn = container.querySelector(".deco-cat-btn") as HTMLElement;
    if (firstBtn) firstBtn.style.background = "var(--accent-light)";
    renderGrid();

    // Render placed decorations list
    const placedList = container.querySelector("#deco-placed-list") as HTMLElement;
    if (decorations.length === 0) {
      placedList.innerHTML = `<div style="color: var(--dim); font-size: 12px;">No decorations placed yet. Select an item above and click on the office floor!</div>`;
    } else {
      placedList.innerHTML = decorations.map((d) => {
        const item = DECORATION_CATALOG.find((c) => c.type === d.type);
        return `
          <div style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: var(--panel-soft); border-radius: 6px;">
            <span style="font-size: 20px;">${item?.emoji ?? "📦"}</span>
            <span style="font-size: 12px; color: var(--text);">${item?.label ?? d.type} at (${d.tileX}, ${d.tileY})</span>
            <button class="btn" data-remove="${d.id}" style="margin-left: auto; font-size: 11px; padding: 2px 8px; color: var(--red);">Remove</button>
          </div>
        `;
      }).join("");
      placedList.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.net.send({ type: "remove_decoration", decorationId: (btn as HTMLElement).dataset.remove! });
        });
      });
    }
  }

  private isDecorationUnlocked(type: string, stats: { tasksDone: number; agentsHired: number; dayStreak: number; achievementsUnlocked: number }): boolean {
    const item = DECORATION_CATALOG.find((c) => c.type === type);
    if (!item) return false;
    switch (item.unlockRequirement) {
      case "10 tasks": return stats.tasksDone >= 10;
      case "50 tasks": return stats.tasksDone >= 50;
      case "100 tasks": return stats.tasksDone >= 100;
      case "5 agents hired": return stats.agentsHired >= 5;
      case "7-day streak": return stats.dayStreak >= 7;
      default: return true;
    }
  }

  private enterDecorationPlacementMode(type: string): void {
    const scene = this.store.sceneRef as any;
    if (scene && typeof scene.enterDecorationMode === "function") {
      scene.enterDecorationMode(type);
      this.store.toast(`Placement mode: ${DECORATION_CATALOG.find((c) => c.type === type)?.label ?? type}. Click floor to place, ESC to exit.`);
    }
  }

  private renderTechTreeView(container: HTMLElement): void {
    const progress = this.store.officeProgress;
    if (!progress) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">Loading office progression…</div>`;
      return;
    }

    const pct = progress.xpForNextLevel > 0 ? Math.round((progress.xpForCurrentLevel / progress.xpForNextLevel) * 100) : 100;
    const levelLabels: Record<number, string> = {
      1: "Basic Task Board", 2: "Schedules", 3: "Handoffs", 4: "Phase Gates",
      5: "V-Model", 6: "Parallel Execution", 7: "Compound Chains",
      8: "A/B Testing", 9: "Org Collaboration", 10: "Prestige",
    };

    let levelRows = "";
    for (let lvl = 1; lvl <= 10; lvl++) {
      const isCurrent = lvl === progress.level;
      const isUnlocked = lvl <= progress.level;
      const xpReq = [0, 500, 1500, 3000, 5000, 8000, 12000, 20000, 35000, 50000][lvl - 1];
      const maxA = [3, 5, 6, 7, 8, 9, 10, 12, 15, 20][lvl - 1];
      const label = levelLabels[lvl] ?? "";
      levelRows += `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;${isCurrent ? "background:rgba(100,200,255,0.15);border:1px solid rgba(100,200,255,0.3);" : ""}">
          <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;${isUnlocked ? "background:linear-gradient(135deg,var(--green),var(--accent));color:#fff;" : "background:var(--panel-soft);color:var(--dim);"}">${lvl}</div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;${isUnlocked ? "" : "color:var(--dim);"}">${label}</div>
            <div style="font-size:11px;color:var(--dim);">${xpReq.toLocaleString()} XP · ${maxA} agents max</div>
          </div>
          ${isCurrent ? '<span style="font-size:11px;color:var(--accent);">● Current</span>' : isUnlocked ? '<span style="font-size:16px;">✓</span>' : '<span style="font-size:16px;color:var(--panel-edge);">🔒</span>'}
        </div>`;
    }

    container.innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
          <div style="width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;background:linear-gradient(135deg,var(--green),var(--accent));color:#fff;">${progress.level}</div>
          <div>
            <div style="font-size:18px;font-weight:700;">Office Level ${progress.level}</div>
            <div style="font-size:12px;color:var(--dim);">${progress.xp.toLocaleString()} total XP · ${progress.maxAgents} agents max · ${progress.prestigeCount > 0 ? `${progress.prestigeCount} prestige` : "no prestige"}</div>
          </div>
        </div>
        <div style="background:var(--panel-soft);border-radius:8px;height:12px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--green),var(--accent));transition:width 0.5s;"></div>
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:4px;">${progress.xpForCurrentLevel} / ${progress.xpForNextLevel} XP to Level ${progress.level + 1}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;">${levelRows}</div>
      <div style="margin-top:16px;padding:12px;background:var(--panel-soft);border-radius:8px;font-size:11px;color:var(--dim);">
        <strong>XP Sources:</strong><br>
        Task completed: +10 XP · Agent hired: +50 XP · Day active: +25 XP<br>
        Achievement unlocked: +100 XP · Schedule executed: +15 XP · World explored: +200 XP
      </div>
    `;
  }

  private renderSocialPanel(container: HTMLElement): void {
    const social = this.store.officeSocial;
    const isVisitor = this.store.roomType === "private" && this.store.accessLevel !== "manage";

    if (!social) {
      container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--dim);">Loading social…</div>`;
      return;
    }

    const likeBtnText = social.likes.some((l) => l.likerId === this.store.userId) ? "👍 Liked" : "👍 Like";
    const notesHtml = social.stickyNotes.length === 0
      ? '<div style="color:var(--dim);font-size:12px;padding:12px;">No sticky notes yet.</div>'
      : social.stickyNotes.map((n) => `
        <div style="background:${n.color};padding:10px;border-radius:6px;margin-bottom:8px;font-size:12px;box-shadow:2px 2px 4px rgba(0,0,0,0.2);">
          <div style="font-weight:600;margin-bottom:4px;">${n.authorName}</div>
          <div>${n.text.replace(/</g, "&lt;")}</div>
          <div style="font-size:10px;opacity:0.7;margin-top:4px;">${new Date(n.createdAt).toLocaleDateString()}</div>
        </div>`).join("");

    const visitorsHtml = social.recentVisitors.length === 0
      ? '<div style="color:var(--dim);font-size:12px;">No visitors yet.</div>'
      : social.recentVisitors.slice().reverse().map((v) => `
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;">
          <span>${v.visitorName}</span>
          <span style="color:var(--dim);">${new Date(v.visitedAt).toLocaleDateString()}</span>
        </div>`).join("");

    container.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:16px;">
        <button class="btn" id="social-like-btn" style="font-size:12px;padding:6px 14px;">${likeBtnText}</button>
        <div style="font-size:20px;font-weight:700;">${social.likeCount}</div>
        <div style="font-size:12px;color:var(--dim);align-self:center;">likes · ${social.recentVisitors.length} visitors</div>
      </div>
      ${isVisitor ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Leave a sticky note:</div>
        <textarea id="sticky-note-input" rows="2" placeholder="Write something nice…" style="width:100%;background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;padding:8px;color:var(--text);font-size:12px;resize:vertical;"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn" id="sticky-note-color" style="font-size:11px;padding:3px 8px;background:#ffeb3b;color:#1a1d28;">Color</button>
          <button class="btn primary" id="sticky-note-submit" style="font-size:11px;padding:3px 12px;">Post</button>
        </div>
      </div>` : ""}
      <div style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Sticky Notes</div>
        ${notesHtml}
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;">Recent Visitors</div>
        ${visitorsHtml}
      </div>
    `;

    const likeBtn = document.getElementById("social-like-btn");
    if (likeBtn) {
      likeBtn.addEventListener("click", () => {
        const ownerId = this.store.roomOwnerId;
        if (!ownerId) return;
        if (social.likes.some((l) => l.likerId === this.store.userId)) {
          this.net.send({ type: "unlike_office", officeOwnerId: ownerId });
        } else {
          this.net.send({ type: "like_office", officeOwnerId: ownerId });
        }
      });
    }

    if (isVisitor) {
      const submitBtn = document.getElementById("sticky-note-submit");
      const noteInput = document.getElementById("sticky-note-input") as HTMLTextAreaElement | null;
      const colorBtn = document.getElementById("sticky-note-color") as HTMLButtonElement | null;
      let currentColor = "#ffeb3b";
      const colors = ["#ffeb3b", "#ffcc80", "#b2dfdb", "#f8bbd0", "#d1c4e9"];
      let colorIdx = 0;
      if (colorBtn) {
        colorBtn.addEventListener("click", () => {
          colorIdx = (colorIdx + 1) % colors.length;
          currentColor = colors[colorIdx];
          (colorBtn as HTMLElement).style.background = currentColor;
        });
      }
      if (submitBtn && noteInput) {
        submitBtn.addEventListener("click", () => {
          const text = noteInput.value.trim();
          if (!text) return;
          const ownerId = this.store.roomOwnerId;
          if (!ownerId) return;
          this.net.send({ type: "leave_sticky_note", officeOwnerId: ownerId, text, color: currentColor });
          noteInput.value = "";
        });
      }
    }
  }

  private renderAgentGrowth(agentId: string, container: HTMLElement): void {
    const growth = this.store.agentGrowthData.get(agentId);
    if (!growth || growth.totalTasks === 0) {
      container.innerHTML = `<div style="color:var(--dim);font-size:11px;padding:8px;">No growth data yet. Complete tasks to see performance trends.</div>`;
      return;
    }

    const trendIcon = growth.trend === "improving" ? "📈" : growth.trend === "declining" ? "📉" : "➡️";
    const trendColor = growth.trend === "improving" ? "var(--green)" : growth.trend === "declining" ? "var(--red)" : "var(--dim)";

    const sparkPoints = growth.recentHistory.map((h, i) => {
      const x = (i / Math.max(growth.recentHistory.length - 1, 1)) * 120;
      const y = 30 - (h.success ? 25 : 5);
      return `${x},${y}`;
    }).join(" ");

    container.innerHTML = `
      <div style="padding:8px;background:var(--panel-soft);border-radius:8px;margin-top:8px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Agent Growth</div>
        <div style="display:flex;gap:16px;margin-bottom:8px;">
          <div><span style="color:var(--dim);font-size:10px;">Tasks</span><br><span style="font-size:14px;font-weight:600;">${growth.totalTasks}</span></div>
          <div><span style="color:var(--dim);font-size:10px;">Success</span><br><span style="font-size:14px;font-weight:600;">${Math.round(growth.successRate * 100)}%</span></div>
          <div><span style="color:var(--dim);font-size:10px;">Avg Time</span><br><span style="font-size:14px;font-weight:600;">${growth.avgCompletionMin.toFixed(1)}m</span></div>
          <div><span style="color:var(--dim);font-size:10px;">Trend</span><br><span style="font-size:14px;color:${trendColor};">${trendIcon}</span></div>
        </div>
        ${growth.specialty ? `<div style="font-size:11px;color:var(--dim);margin-bottom:6px;">Specialty: <span style="color:var(--accent);">${growth.specialty}</span></div>` : ""}
        <svg width="120" height="35" style="display:block;">
          <polyline points="${sparkPoints}" fill="none" stroke="${trendColor}" stroke-width="1.5" />
        </svg>
      </div>
    `;
  }

  private renderChallengeView(container: HTMLElement): void {
    const challenge = this.store.activeChallenge;
    const result = this.store.challengeResult;

    if (result) {
      this.renderChallengeResult(container, result);
      return;
    }

    if (!challenge) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#888;">Loading challenge…</div>`;
      return;
    }

    const agentOptions = challenge.agents.map((a) =>
      `<option value="${a.id}">${a.name} (${a.specialties.join(", ")})</option>`
    ).join("");

    let tasksHtml = "";
    for (const task of challenge.tasks) {
      const deps = task.dependsOn.length > 0
        ? `<span style="color:var(--dim);font-size:11px;"> ← depends on: ${task.dependsOn.map((d) => challenge.tasks.find((t) => t.id === d)?.title ?? d).join(", ")}</span>`
        : "";
      tasksHtml += `
        <div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:6px;padding:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
              <span style="font-weight:600;color:var(--text);">${task.title}</span>
              <span style="color:var(--accent);font-size:11px;margin-left:6px;">${task.category}</span>
              ${deps}
            </div>
            <span style="color:var(--dim);font-size:11px;">${task.baseDurationMin}m base</span>
          </div>
          <select id="challenge-assign-${task.id}" style="width:100%;padding:4px 8px;background:var(--panel);border:1px solid var(--panel-edge);border-radius:4px;color:var(--text);font-size:12px;">
            <option value="">— Select agent —</option>
            ${agentOptions}
          </select>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="dash-section">
        <div class="dash-section-title">🏆 ${challenge.title}</div>
        <div class="dash-section-body">
          <div style="margin-bottom:12px;color:var(--dim);font-size:13px;">${challenge.description}</div>
          <div style="display:flex;gap:16px;margin-bottom:12px;">
            <div><span style="color:var(--dim);font-size:11px;">Tasks</span><br><span style="font-size:18px;font-weight:600;">${challenge.tasks.length}</span></div>
            <div><span style="color:var(--dim);font-size:11px;">Agents</span><br><span style="font-size:18px;font-weight:600;">${challenge.agents.length}</span></div>
            <div><span style="color:var(--dim);font-size:11px;">Optimal Time</span><br><span style="font-size:18px;font-weight:600;color:var(--green);">${challenge.optimalTimeMin}m</span></div>
          </div>
          <div style="margin-bottom:6px;font-size:12px;color:var(--dim);">Assign each task to the agent that minimizes total completion time. Specialists finish tasks in base time; non-specialists take 1.5x longer.</div>
        </div>
      </div>
      ${tasksHtml}
      <button class="btn primary" id="challenge-submit" style="width:100%;margin-top:8px;">Submit Assignment</button>
    `;

    const submitBtn = document.getElementById("challenge-submit");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        const assignments: { taskId: string; agentId: string }[] = [];
        let allAssigned = true;
        for (const task of challenge.tasks) {
          const select = document.getElementById(`challenge-assign-${task.id}`) as HTMLSelectElement | null;
          const agentId = select?.value ?? "";
          if (!agentId) {
            allAssigned = false;
            break;
          }
          assignments.push({ taskId: task.id, agentId });
        }
        if (!allAssigned) {
          submitBtn.textContent = "⚠ Assign all tasks first!";
          setTimeout(() => { submitBtn.textContent = "Submit Assignment"; }, 2000);
          return;
        }
        this.net.send({ type: "submit_challenge", challengeId: challenge.id, assignments });
        submitBtn.textContent = "Scoring…";
        (submitBtn as HTMLButtonElement).disabled = true;
      });
    }
  }

  private renderChallengeResult(container: HTMLElement, result: ChallengeResult): void {
    const scoreColor = result.score >= 90 ? "var(--green)" : result.score >= 70 ? "var(--amber)" : "var(--red)";
    const grade = result.score >= 95 ? "S" : result.score >= 85 ? "A" : result.score >= 70 ? "B" : result.score >= 50 ? "C" : "D";

    let breakdownHtml = "";
    for (const b of result.breakdown) {
      const isCritical = result.criticalPath.includes(b.taskId);
      breakdownHtml += `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--panel-edge-soft);font-size:12px;">
          ${isCritical ? '<span style="color:var(--amber);">🔥</span>' : '<span style="color:var(--dim);">○</span>'}
          <span style="flex:1;color:var(--text);">${b.taskTitle}</span>
          <span style="color:var(--dim);">${b.agentName}</span>
          <span style="color:${b.isSpecialty ? "var(--green)" : "var(--amber)"};">${b.isSpecialty ? "★" : "×1.5"}</span>
          <span style="color:var(--text);font-weight:600;min-width:40px;text-align:right;">${b.durationMin}m</span>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="dash-section" style="border-color:${scoreColor};border-width:2px;">
        <div class="dash-section-title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>🏆 Challenge Result</span>
          <span style="font-size:32px;font-weight:900;color:${scoreColor};">${grade}</span>
        </div>
        <div class="dash-section-body">
          <div style="display:flex;gap:24px;margin-bottom:12px;">
            <div><span style="color:var(--dim);font-size:11px;">Your Time</span><br><span style="font-size:20px;font-weight:600;">${result.userTimeMin}m</span></div>
            <div><span style="color:var(--dim);font-size:11px;">Optimal</span><br><span style="font-size:20px;font-weight:600;color:var(--green);">${result.optimalTimeMin}m</span></div>
            <div><span style="color:var(--dim);font-size:11px;">Score</span><br><span style="font-size:20px;font-weight:600;color:${scoreColor};">${result.score}/100</span></div>
          </div>
          <div style="font-size:12px;color:var(--dim);margin-bottom:12px;">
            ${result.score >= 95 ? "Perfect optimization! You found the optimal assignment." :
              result.score >= 85 ? "Excellent! Very close to optimal." :
              result.score >= 70 ? "Good effort. Room for improvement." :
              result.score >= 50 ? "Decent, but the optimal solution is significantly faster." :
              "Far from optimal. Try matching agent specialties to task categories."}
          </div>
          <div style="margin-bottom:8px;font-size:12px;color:var(--dim);">🔥 = critical path task</div>
          ${breakdownHtml}
        </div>
      </div>
      <button class="btn primary" id="challenge-new" style="width:100%;margin-top:12px;">New Challenge</button>
    `;

    const newBtn = document.getElementById("challenge-new");
    if (newBtn) {
      newBtn.addEventListener("click", () => {
        this.store.activeChallenge = null;
        this.store.challengeResult = null;
        this.net.send({ type: "request_challenge" });
      });
    }
  }

  private renderDecomposeView(container: HTMLElement): void {
    const goals = [...this.store.board.values()].filter((c) => c.type === "goal" && c.manualDecompose);
    const allCards = [...this.store.board.values()];

    // Check for decomposition score to display
    const scoreData = this.store.decompositionScore;

    let html = "";

    // Score display if available
    if (scoreData) {
      const s = scoreData.score;
      const gradeColor = s.grade === "S" ? "#ffd700" : s.grade === "A" ? "var(--green)" : s.grade === "B" ? "var(--accent)" : s.grade === "C" ? "var(--amber)" : "var(--red)";
      html += `
        <div class="dash-section" style="border-color: ${gradeColor}; border-width: 2px;">
          <div class="dash-section-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>🧩 Decomposition Score</span>
            <span style="font-size: 28px; font-weight: 900; color: ${gradeColor};">${s.grade}</span>
          </div>
          <div class="dash-section-body">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
              <div><b>Overall:</b> ${s.overall}/100</div>
              <div><b>Coverage:</b> ${s.coverage}/100</div>
              <div><b>Parallelism:</b> ${s.parallelism}/100</div>
              <div><b>Depth:</b> ${s.dependencyDepth}/100</div>
              <div><b>Granularity:</b> ${s.granularity}/100</div>
              <div><b>Execution:</b> ${s.executionSuccess}/100</div>
            </div>
            <div style="margin-bottom: 6px; font-size: 12px; color: var(--dim);">
              ${s.subtaskCount} subtasks · ${s.reworkCount} rework · ${s.longestPath}-deep chain · ${s.maxParallel} parallel
            </div>
            <div>${s.summary}</div>
          </div>
        </div>
      `;
    }

    // Goal creation form
    html += `
      <div class="dash-section">
        <div class="dash-section-title">🎯 Create a Goal to Decompose</div>
        <div class="dash-section-body">
          <input id="decompose-goal-title" maxlength="200" placeholder="Enter your high-level goal…" style="width: 100%; margin-bottom: 6px; padding: 6px 8px; background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 4px; color: var(--text);" />
          <textarea id="decompose-goal-desc" rows="2" placeholder="Detailed description (optional)" style="width: 100%; margin-bottom: 6px; padding: 6px 8px; background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 4px; color: var(--text); resize: vertical;"></textarea>
          <button class="btn primary" id="decompose-create-goal" style="width: 100%;">Create Goal</button>
        </div>
      </div>
    `;

    // List existing manual-decompose goals with their subtasks
    if (goals.length > 0) {
      html += `<div class="dash-section"><div class="dash-section-title">📋 Your Goals</div>`;
      for (const goal of goals) {
        const subtasks = allCards.filter((c) => c.parentGoalId === goal.id);
        const completed = subtasks.filter((c) => c.status === "done").length;
        const allDone = subtasks.length > 0 && completed === subtasks.length;

        html += `
          <div style="background: var(--panel-soft); border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px; margin-bottom: 10px;">
            <div style="font-weight: 600; color: var(--text); margin-bottom: 4px;">${goal.title}</div>
            <div style="font-size: 12px; color: var(--dim); margin-bottom: 8px;">${subtasks.length} subtasks · ${completed}/${subtasks.length} done</div>
        `;

        // Show subtasks
        if (subtasks.length > 0) {
          html += `<div style="margin-bottom: 8px;">`;
          for (const st of subtasks) {
            const statusIcon = st.status === "done" ? "✅" : st.status === "in_progress" ? "🔄" : st.status === "backlog" ? "📋" : "⏸";
            const agentName = st.assignedAgentId ? this.store.agents.get(st.assignedAgentId)?.name ?? "?" : "Unassigned";
            const deps = st.dependsOnCardIds?.length ?? 0;
            html += `<div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px;">${statusIcon} <span style="flex: 1; color: var(--text);">${st.title}</span> <span style="color: var(--dim);">${agentName}</span>${deps > 0 ? `<span style="color: var(--dim);">←${deps}</span>` : ""}</div>`;
          }
          html += `</div>`;
        }

        // Add subtask form
        html += `
          <div style="display: flex; gap: 4px; margin-bottom: 6px;">
            <input id="decompose-subtask-title-${goal.id}" maxlength="200" placeholder="Subtask title…" style="flex: 1; padding: 4px 8px; background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 4px; color: var(--text); font-size: 12px;" />
            <button class="btn" id="decompose-add-subtask-${goal.id}" style="font-size: 11px; padding: 2px 8px;">+ Subtask</button>
          </div>
        `;

        // Score button (only if all subtasks done)
        if (allDone) {
          html += `<button class="btn primary" id="decompose-score-${goal.id}" style="width: 100%; font-size: 12px;">📊 Score This Decomposition</button>`;
        }

        // Show existing score if present
        if (goal.decompositionScore) {
          const s = goal.decompositionScore;
          const gradeColor = s.grade === "S" ? "#ffd700" : s.grade === "A" ? "var(--green)" : s.grade === "B" ? "var(--accent)" : s.grade === "C" ? "var(--amber)" : "var(--red)";
          html += `<div style="margin-top: 8px; padding: 8px; background: rgba(20,22,30,0.4); border-radius: 4px; text-align: center;"><span style="font-size: 24px; font-weight: 900; color: ${gradeColor};">${s.grade}</span> <span style="color: var(--dim); font-size: 12px;">${s.overall}/100 — ${s.summary}</span></div>`;
        }

        html += `</div>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="dash-section"><div class="dash-section-body" style="text-align: center; color: var(--dim);">No goals yet. Create one above to start decomposing.</div></div>`;
    }

    container.innerHTML = html;

    // Wire up goal creation
    const createGoalBtn = document.getElementById("decompose-create-goal");
    if (createGoalBtn) {
      createGoalBtn.addEventListener("click", () => {
        const titleEl = document.getElementById("decompose-goal-title") as HTMLInputElement;
        const descEl = document.getElementById("decompose-goal-desc") as HTMLTextAreaElement;
        const title = titleEl.value.trim();
        if (!title) return;
        this.net.send({ type: "create_goal", title, description: descEl.value.trim() || undefined });
        titleEl.value = "";
        descEl.value = "";
      });
    }

    // Wire up subtask creation and scoring for each goal
    for (const goal of goals) {
      const addBtn = document.getElementById(`decompose-add-subtask-${goal.id}`);
      if (addBtn) {
        addBtn.addEventListener("click", () => {
          const input = document.getElementById(`decompose-subtask-title-${goal.id}`) as HTMLInputElement;
          const title = input.value.trim();
          if (!title) return;
          // Create card then link it to the goal
          this.net.send({ type: "create_card", title });
          // We need to wait for the card to be created, then link it
          // The card ID isn't known yet, so we'll link it after a short delay
          setTimeout(() => {
            const cards = [...this.store.board.values()].sort((a, b) => b.createdAt - a.createdAt);
            const newest = cards.find((c) => c.title === title && !c.parentGoalId);
            if (newest) {
              this.net.send({ type: "link_subtask", parentGoalId: goal.id, subtaskCardId: newest.id });
            }
          }, 500);
          input.value = "";
        });
      }

      const scoreBtn = document.getElementById(`decompose-score-${goal.id}`);
      if (scoreBtn) {
        scoreBtn.addEventListener("click", () => {
          this.net.send({ type: "score_decomposition", goalCardId: goal.id });
        });
      }
    }
  }

  private renderAutomationDashboard(container: HTMLElement): void {
    const stats = this.store.automationStats;
    if (!stats) {
      container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--dim); font-size: 14px;">Loading automation stats…</div>`;
      return;
    }

    const successPct = Math.round(stats.successRate * 100);
    const idlePct = Math.round(stats.idlePct * 100);
    const automationPct = Math.round(stats.automationRate * 100);
    const avgMin = stats.avgCompletionMin.toFixed(1);

    const successColor = successPct >= 80 ? "var(--green)" : successPct >= 50 ? "var(--amber)" : "var(--red)";
    const idleColor = idlePct <= 30 ? "var(--green)" : idlePct <= 60 ? "var(--amber)" : "var(--red)";

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div class="dash-card">
          <div class="dash-card-label">Throughput (1h)</div>
          <div class="dash-card-value">${stats.throughput} <span class="dash-card-unit">tasks/hr</span></div>
        </div>
        <div class="dash-card">
          <div class="dash-card-label">Avg Completion</div>
          <div class="dash-card-value">${avgMin} <span class="dash-card-unit">min</span></div>
        </div>
        <div class="dash-card">
          <div class="dash-card-label">Success Rate</div>
          <div class="dash-card-value" style="color: ${successColor};">${successPct}%</div>
          <div class="dash-bar"><div class="dash-bar-fill" style="width: ${successPct}%; background: ${successColor};"></div></div>
        </div>
        <div class="dash-card">
          <div class="dash-card-label">Idle Rate</div>
          <div class="dash-card-value" style="color: ${idleColor};">${idlePct}%</div>
          <div class="dash-bar"><div class="dash-bar-fill" style="width: ${idlePct}%; background: ${idleColor};"></div></div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div class="dash-card-sm">
          <div class="dash-card-label">Automation</div>
          <div class="dash-card-value-sm">${automationPct}%</div>
        </div>
        <div class="dash-card-sm">
          <div class="dash-card-label">Pipeline Depth</div>
          <div class="dash-card-value-sm">${stats.pipelineDepth}</div>
        </div>
        <div class="dash-card-sm">
          <div class="dash-card-label">Agents</div>
          <div class="dash-card-value-sm">${stats.agentCount}</div>
        </div>
      </div>

      <div class="dash-section">
        <div class="dash-section-title">🏆 Top Performer</div>
        <div class="dash-section-body">${stats.busiestAgent ? `${stats.busiestAgent} — ${stats.totalTasksDone} total tasks completed` : "No tasks completed yet"}</div>
      </div>

      <div class="dash-section">
        <div class="dash-section-title">📋 Summary</div>
        <div class="dash-section-body">
          ${stats.throughput > 0
            ? `Your team completed <b>${stats.throughput}</b> task${stats.throughput === 1 ? "" : "s"} in the last hour at <b>${avgMin} min/task</b> average.`
            : `No tasks completed in the last hour. Your team is ${idlePct >= 80 ? "mostly idle" : "partially active"}.`}
          ${stats.pipelineDepth > 0 ? ` Pipeline depth: <b>${stats.pipelineDepth}</b> stage${stats.pipelineDepth === 1 ? "" : "s"}.` : ""}
          ${automationPct > 50 ? " Automation is running smoothly." : " Consider setting up schedules to increase automation."}
        </div>
      </div>

      ${this.renderEfficiencyBadge()}
      ${this.renderResourceAllocation()}
      ${this.renderFulfillmentSection()}
    `;
  }

  private renderEfficiencyBadge(): string {
    const score = this.store.efficiencyScore;
    if (!score) {
      return `<div class="dash-section">
        <div class="dash-section-title">🏅 Pipeline Efficiency</div>
        <div class="dash-section-body">
          <button class="btn" id="req-efficiency-btn" style="font-size: 12px; padding: 4px 12px;">Calculate Efficiency Score</button>
        </div>
      </div>`;
    }
    return `<div class="dash-section">
      <div class="dash-section-title">🏅 Pipeline Efficiency</div>
      <div class="dash-section-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <span style="font-size:24px;">${score.badge}</span>
          <div>
            <div style="font-size:14px;font-weight:600;color:${score.badgeColor};">${score.badge}</div>
            <div style="font-size:11px;color:var(--dim);">Throughput: ${score.throughput}/hr · Success: ${Math.round(score.successRate * 100)}% · Autonomy: ${Math.round(score.autonomyRate * 100)}% · Chains: ${score.chainCount}</div>
          </div>
        </div>
        ${score.suggestions.map((s) => `<div style="font-size:11px;color:var(--dim);margin-bottom:2px;">• ${s.replace(/</g, "&lt;")}</div>`).join("")}
        <button class="btn" id="req-efficiency-btn" style="font-size: 11px; padding: 3px 10px; margin-top: 6px;">Recalculate</button>
      </div>
    </div>`;
  }

  private renderResourceAllocation(): string {
    const alloc = this.store.resourceAllocation;
    const agents = [...this.store.agents.values()].filter(
      (a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard",
    );
    if (agents.length === 0) return "";

    if (!alloc) {
      return `<div class="dash-section">
        <div class="dash-section-title">💰 Resource Allocation</div>
        <div class="dash-section-body">
          <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">Distribute your budget across agents. Total: 100 points.</div>
          ${agents.map((a) => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:12px;width:100px;color:var(--text);">${a.name}</span>
              <input type="range" min="0" max="100" value="${Math.floor(100 / agents.length)}" class="alloc-slider" data-agent-id="${a.id}" style="flex:1;accent-color:var(--accent);" />
              <span class="alloc-value" data-agent-id="${a.id}" style="font-size:11px;width:30px;text-align:right;color:var(--dim);">${Math.floor(100 / agents.length)}</span>
            </div>
          `).join("")}
          <div style="font-size:11px;color:var(--dim);margin-top:4px;">Total: <span id="alloc-total">${Math.floor(100 / agents.length) * agents.length}</span> / 100</div>
          <button class="btn" id="alloc-submit-btn" style="font-size: 12px; padding: 4px 12px; margin-top: 6px;">Allocate Resources</button>
        </div>
      </div>`;
    }
    return `<div class="dash-section">
      <div class="dash-section-title">💰 Resource Allocation</div>
      <div class="dash-section-body">
        <div style="font-size:12px;color:var(--dim);margin-bottom:8px;">Budget: ${alloc.totalBudget} points across ${alloc.allocations.length} agents.</div>
        ${alloc.allocations.map((a) => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:12px;width:100px;color:var(--text);">${a.agentName}</span>
            <div style="flex:1;height:8px;background:var(--panel-soft);border-radius:4px;overflow:hidden;">
              <div style="width:${a.budget}%;height:100%;background:var(--amber);border-radius:4px;"></div>
            </div>
            <span style="font-size:11px;width:30px;text-align:right;color:var(--amber);">${a.budget}</span>
            <span style="font-size:10px;width:40px;text-align:right;color:var(--dim);">${Math.round(a.utilization * 100)}% util</span>
          </div>
        `).join("")}
        <button class="btn" id="alloc-reset-btn" style="font-size: 11px; padding: 3px 10px; margin-top: 6px;">Reallocate</button>
      </div>
    </div>`;
  }

  private wireDashboardButtons(): void {
    // Efficiency score button
    const effBtn = document.getElementById("req-efficiency-btn");
    if (effBtn) {
      effBtn.addEventListener("click", () => {
        this.net.send({ type: "request_efficiency_score" });
      });
    }

    // Fulfillment stats button
    const fulBtn = document.getElementById("req-fulfillment-btn");
    if (fulBtn) {
      fulBtn.addEventListener("click", () => {
        this.net.send({ type: "request_fulfillment" });
      });
    }

    // Resource allocation sliders
    const sliders = document.querySelectorAll(".alloc-slider");
    if (sliders.length > 0) {
      sliders.forEach((slider) => {
        slider.addEventListener("input", () => {
          const el = slider as HTMLInputElement;
          const agentId = el.dataset.agentId;
          const valueEl = document.querySelector(`.alloc-value[data-agent-id="${agentId}"]`);
          if (valueEl) valueEl.textContent = el.value;
          // Update total
          let total = 0;
          document.querySelectorAll(".alloc-slider").forEach((s) => {
            total += parseInt((s as HTMLInputElement).value, 10);
          });
          const totalEl = document.getElementById("alloc-total");
          if (totalEl) totalEl.textContent = String(total);
        });
      });

      const submitBtn = document.getElementById("alloc-submit-btn");
      if (submitBtn) {
        submitBtn.addEventListener("click", () => {
          const allocations: { agentId: string; budget: number }[] = [];
          document.querySelectorAll(".alloc-slider").forEach((s) => {
            const el = s as HTMLInputElement;
            allocations.push({ agentId: el.dataset.agentId!, budget: parseInt(el.value, 10) });
          });
          this.net.send({ type: "allocate_resources", allocations });
        });
      }
    }

    // Resource allocation reset button
    const resetBtn = document.getElementById("alloc-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.store.resourceAllocation = null;
        this.renderAutomationDashboard(document.getElementById("dashboard-view")!);
        this.wireDashboardButtons();
      });
    }
  }

  private renderFulfillmentSection(): string {
    const fs = this.store.fulfillmentStats;
    if (!fs) {
      return `<div class="dash-section">
        <div class="dash-section-title">🎯 Aspiration Fulfillment</div>
        <div class="dash-section-body">
          <button class="btn" id="req-fulfillment-btn" style="font-size: 12px; padding: 4px 12px;">Load Fulfillment Stats</button>
        </div>
      </div>`;
    }

    const TRACK_META: Record<string, { label: string; icon: string; color: string }> = {
      warrior: { label: "Warrior", icon: "⚔️", color: "#ef4444" },
      builder: { label: "Builder", icon: "🔨", color: "var(--green)" },
      explorer: { label: "Explorer", icon: "🧭", color: "#3b82f6" },
      puzzle_solver: { label: "Puzzle Solver", icon: "🧩", color: "#a855f7" },
      creator: { label: "Creator", icon: "🎨", color: "#ec4899" },
      strategist: { label: "Strategist", icon: "♟️", color: "#f59e0b" },
    };

    const tracks = ["warrior", "builder", "explorer", "puzzle_solver", "creator", "strategist"] as const;

    // Radar chart SVG
    const cx = 120, cy = 120, r = 90;
    const angles = tracks.map((_, i) => (Math.PI * 2 * i) / tracks.length - Math.PI / 2);
    const gridLevels = [0.25, 0.5, 0.75, 1.0];

    // Grid polygons
    const gridPolys = gridLevels.map((level) => {
      const pts = angles.map((a) => `${cx + Math.cos(a) * r * level},${cy + Math.sin(a) * r * level}`).join(" ");
      return `<polygon points="${pts}" fill="none" stroke="var(--panel-edge)" stroke-width="1" opacity="${0.3 + level * 0.2}"/>`;
    }).join("");

    // Axis lines
    const axisLines = angles.map((a) =>
      `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}" stroke="var(--panel-edge)" stroke-width="1" opacity="0.3"/>`
    ).join("");

    // Fulfillment polygon
    const fulfillmentPts = tracks.map((track, i) => {
      const score = fs[track].score / 100;
      const a = angles[i];
      return `${cx + Math.cos(a) * r * score},${cy + Math.sin(a) * r * score}`;
    }).join(" ");

    // Detection polygon (lighter overlay)
    const detectionPts = tracks.map((track, i) => {
      const score = (fs.detectionScores[track] ?? 0) * 100 / 100;
      const a = angles[i];
      return `${cx + Math.cos(a) * r * score},${cy + Math.sin(a) * r * score}`;
    }).join(" ");

    // Labels
    const labels = tracks.map((track, i) => {
      const a = angles[i];
      const lx = cx + Math.cos(a) * (r + 18);
      const ly = cy + Math.sin(a) * (r + 18);
      const meta = TRACK_META[track];
      return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${meta.color}">${meta.icon}</text>`;
    }).join("");

    // Dominant track deep dive
    const dominantTrack = fs.dominant ?? "builder";
    const dominantMeta = TRACK_META[dominantTrack];
    const dominantData = fs[dominantTrack as keyof typeof fs] as { score: number; metrics: { label: string; value: string; raw: number; max: number }[]; trend: string; badge: string };
    const trendIcon = dominantData.trend === "improving" ? "📈" : dominantData.trend === "declining" ? "📉" : "➡️";

    const metricsHtml = dominantData.metrics.map((m) => {
      const pct = m.max > 0 ? Math.min(100, (m.raw / m.max) * 100) : 0;
      return `
        <div style="margin-bottom:6px;">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
            <span style="color:var(--dim);">${m.label}</span>
            <span style="color:var(--text);font-weight:600;">${m.value}</span>
          </div>
          <div style="height:4px;background:var(--panel-edge-soft);border-radius:2px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${dominantMeta.color};border-radius:2px;"></div>
          </div>
        </div>
      `;
    }).join("");

    // Gap analysis
    const topGaps = fs.gaps.slice(0, 3);
    const gapsHtml = topGaps.map((g) => {
      const meta = TRACK_META[g.track];
      const gapText = g.gap > 10
        ? `<span style="color:var(--green);">Living it up! +${g.gap}</span>`
        : g.gap < -10
        ? `<span style="color:var(--red);">Unfulfilled ${g.gap}</span>`
        : `<span style="color:var(--dim);">Balanced (${g.gap >= 0 ? "+" : ""}${g.gap})</span>`;
      return `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:3px;">
          <span>${meta.icon}</span>
          <span style="color:var(--text);width:90px;">${meta.label}</span>
          <span style="color:var(--dim);">Det: ${g.detection}%</span>
          <span style="color:var(--dim);">Ful: ${g.fulfillment}%</span>
          <span style="margin-left:auto;">${gapText}</span>
        </div>
      `;
    }).join("");

    // Activity feed
    const feedHtml = fs.activityFeed.slice(0, 10).map((a) => {
      const time = new Date(a.ts).toLocaleDateString([], { month: "short", day: "numeric" });
      return `
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:2px;">
          <span style="font-size:14px;">${a.icon}</span>
          <span style="color:var(--text);">${a.text.replace(/</g, "&lt;")}</span>
          <span style="color:var(--dim);margin-left:auto;">${time}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="dash-section">
        <div class="dash-section-title">🎯 Aspiration Fulfillment</div>
        <div class="dash-section-body">
          <div style="display:grid;grid-template-columns:260px 1fr;gap:16px;">
            <!-- Radar chart -->
            <div>
              <svg width="240" height="240" viewBox="0 0 240 240" style="max-width:100%;">
                ${gridPolys}
                ${axisLines}
                <polygon points="${detectionPts}" fill="rgba(91,155,245,0.1)" stroke="rgba(91,155,245,0.3)" stroke-width="1" stroke-dasharray="3,3"/>
                <polygon points="${fulfillmentPts}" fill="rgba(93,217,127,0.15)" stroke="var(--green)" stroke-width="2"/>
                ${labels}
              </svg>
              <div style="text-align:center;font-size:10px;color:var(--dim);margin-top:-4px;">
                <span style="color:var(--green);">━</span> Fulfillment &nbsp;
                <span style="color:var(--accent);">┄</span> Detection
              </div>
            </div>

            <!-- Dominant track deep dive -->
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <span style="font-size:20px;">${dominantMeta.icon}</span>
                <div>
                  <div style="font-size:14px;font-weight:700;color:${dominantMeta.color};">${dominantMeta.label} ${dominantData.badge}</div>
                  <div style="font-size:11px;color:var(--dim);">${dominantData.score}% fulfilled ${trendIcon}</div>
                </div>
              </div>
              ${metricsHtml}
            </div>
          </div>

          <!-- Gap analysis -->
          <div style="margin-top:12px;border-top:1px solid var(--panel-edge);padding-top:10px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">📊 Interest vs. Achievement</div>
            ${gapsHtml}
          </div>

          <!-- Activity feed -->
          <div style="margin-top:12px;border-top:1px solid var(--panel-edge);padding-top:10px;">
            <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px;">📜 Recent Aspiration Activity</div>
            ${feedHtml || '<div style="font-size:11px;color:var(--dim);">No recent activity</div>'}
          </div>

          <button class="btn" id="req-fulfillment-btn" style="font-size: 11px; padding: 3px 10px; margin-top: 8px;">Refresh Stats</button>
        </div>
      </div>
    `;
  }

  private showAwayReport(): void {
    const report = this.store.awayReport;
    if (!report) return;

    const modal = document.getElementById("away-report-modal")!;
    const eventList = report.events.length > 0
      ? report.events.map((e) => {
          const time = new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const icon = e.type === "task_complete" ? "✅" : e.type === "task_error" ? "⚠️" : e.type === "hire" ? "🤖" : e.type === "fuse" ? "🔀" : "📋";
          return `<div class="away-event"><span class="away-event-icon">${icon}</span><span class="away-event-time">${time}</span><span class="away-event-text">${e.text.replace(/</g, "&lt;")}</span></div>`;
        }).join("")
      : `<div class="away-empty">No notable events while you were away.</div>`;

    const stats: string[] = [];
    if (report.tasksCompleted > 0) stats.push(`<span class="away-stat"><span class="away-stat-num">${report.tasksCompleted}</span><span class="away-stat-label">tasks completed</span></span>`);
    if (report.tasksErrored > 0) stats.push(`<span class="away-stat"><span class="away-stat-num">${report.tasksErrored}</span><span class="away-stat-label">errors</span></span>`);
    if (report.agentsHired > 0) stats.push(`<span class="away-stat"><span class="away-stat-num">${report.agentsHired}</span><span class="away-stat-label">agents hired</span></span>`);
    stats.push(`<span class="away-stat"><span class="away-stat-num">${report.currentAgentCount}</span><span class="away-stat-label">agents now</span></span>`);
    stats.push(`<span class="away-stat"><span class="away-stat-num">${report.totalTasksDone}</span><span class="away-stat-label">total tasks</span></span>`);

    modal.innerHTML = `
      <div class="ach-modal-content" style="max-width: 520px;">
        <div class="ach-modal-header">
          <span class="ach-modal-title">📋 While You Were Away</span>
          <button class="x" id="away-close">✕</button>
        </div>
        <div style="padding: 16px 20px;">
          <div class="away-headline">${report.headline}</div>
          <div class="away-stats">${stats.join("")}</div>
          <div class="away-events-title">Recent activity</div>
          <div class="away-events">${eventList}</div>
        </div>
      </div>
    `;
    modal.hidden = false;

    document.getElementById("away-close")!.addEventListener("click", () => {
      modal.hidden = true;
      modal.innerHTML = "";
      this.store.awayReport = null;
    });
  }

  private showConciergeNudge(): void {
    const nudge = this.store.conciergeNudge;
    const bubble = document.getElementById("concierge-bubble")!;
    const textEl = document.getElementById("concierge-text")!;
    const actionBtn = document.getElementById("concierge-action")!;
    if (!nudge) {
      bubble.hidden = true;
      return;
    }
    textEl.textContent = nudge.text;
    if (nudge.actionLabel && nudge.actionType) {
      actionBtn.hidden = false;
      actionBtn.textContent = nudge.actionLabel;
      actionBtn.onclick = () => {
        this.handleConciergeAction(nudge.actionType!);
        this.dismissConcierge(nudge.nudgeId);
      };
    } else {
      actionBtn.hidden = true;
    }
    bubble.hidden = false;
    // Auto-hide after 15 seconds
    setTimeout(() => {
      if (this.store.conciergeNudge?.nudgeId === nudge.nudgeId) {
        this.dismissConcierge(nudge.nudgeId);
      }
    }, 15_000);
  }

  private dismissConcierge(nudgeId: string): void {
    const bubble = document.getElementById("concierge-bubble")!;
    bubble.hidden = true;
    this.store.conciergeNudge = null;
    this.net.send({ type: "dismiss_concierge", nudgeId });
  }

  private showAspirationQuiz(): void {
    if (!this.store.aspirationQuiz) return;

    const overlay = document.createElement("div");
    overlay.id = "aspiration-quiz-overlay";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); display: flex; align-items: center;
      justify-content: center; z-index: 10000; font-family: inherit;
    `;

    const panel = document.createElement("div");
    panel.style.cssText = `
      background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 12px;
      padding: 32px; max-width: 520px; width: 90%; color: var(--text);
      box-shadow: var(--shadow-lg);
    `;

    const QUESTIONS: { question: string; options: { label: string; aspiration: string }[] }[] = [
      {
        question: "What excites you most about having AI agents?",
        options: [
          { label: "Building automated workflows and pipelines", aspiration: "builder" },
          { label: "Exploring different models and capabilities", aspiration: "explorer" },
          { label: "Strategizing and growing a team of agents", aspiration: "strategist" },
        ],
      },
      {
        question: "When you get a new tool, you want to...",
        options: [
          { label: "Customize and personalize everything", aspiration: "creator" },
          { label: "Solve complex problems and optimize", aspiration: "puzzle_solver" },
          { label: "Compete and push it to its limits", aspiration: "warrior" },
        ],
      },
      {
        question: "Your ideal office vibe is...",
        options: [
          { label: "A well-oiled machine running on autopilot", aspiration: "builder" },
          { label: "A creative studio full of experiments", aspiration: "creator" },
          { label: "A command center with dashboards and metrics", aspiration: "strategist" },
        ],
      },
    ];

    const selected: Set<string> = new Set();
    let currentQ = 0;

    const renderQuestion = () => {
      panel.innerHTML = "";
      const q = QUESTIONS[currentQ];

      const title = document.createElement("h2");
      title.textContent = "Quick Setup";
      title.style.cssText = "margin: 0 0 8px 0; font-size: 20px; color: var(--green);";
      panel.appendChild(title);

      const subtitle = document.createElement("p");
      subtitle.textContent = `Question ${currentQ + 1} of ${QUESTIONS.length}`;
      subtitle.style.cssText = "margin: 0 0 20px 0; font-size: 13px; color: var(--dim);";
      panel.appendChild(subtitle);

      const questionEl = document.createElement("p");
      questionEl.textContent = q.question;
      questionEl.style.cssText = "margin: 0 0 16px 0; font-size: 16px; line-height: 1.5;";
      panel.appendChild(questionEl);

      for (const opt of q.options) {
        const btn = document.createElement("button");
        btn.textContent = opt.label;
        const isSelected = selected.has(opt.aspiration);
        btn.style.cssText = `
          display: block; width: 100%; padding: 12px 16px; margin-bottom: 8px;
          background: ${isSelected ? "rgba(93,217,127,0.12)" : "var(--panel-soft)"}; border: 1px solid ${isSelected ? "var(--green)" : "var(--panel-edge)"};
          border-radius: 8px; color: var(--text); font-size: 14px; cursor: pointer;
          text-align: left; transition: all 0.15s; font-family: inherit;
        `;
        btn.onmouseenter = () => { if (!isSelected) btn.style.background = "var(--panel)" };
        btn.onmouseleave = () => { if (!isSelected) btn.style.background = "var(--panel-soft)" };
        btn.onclick = () => {
          if (selected.has(opt.aspiration)) {
            selected.delete(opt.aspiration);
          } else {
            selected.add(opt.aspiration);
          }
          renderQuestion();
        };
        panel.appendChild(btn);
      }

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display: flex; gap: 8px; margin-top: 20px;";

      if (currentQ > 0) {
        const backBtn = document.createElement("button");
        backBtn.textContent = "Back";
        backBtn.style.cssText = `padding: 10px 20px; background: transparent; border: 1px solid var(--panel-edge); border-radius: 8px; color: var(--dim); cursor: pointer; font-family: inherit;`;
        backBtn.onclick = () => { currentQ--; renderQuestion(); };
        btnRow.appendChild(backBtn);
      }

      const nextBtn = document.createElement("button");
      nextBtn.textContent = currentQ < QUESTIONS.length - 1 ? "Next" : "Submit";
      nextBtn.style.cssText = `padding: 10px 24px; background: var(--green); border: none; border-radius: 8px; color: var(--bg); font-weight: 600; cursor: pointer; font-family: inherit; margin-left: auto;`;
      nextBtn.onclick = () => {
        if (currentQ < QUESTIONS.length - 1) {
          currentQ++;
          renderQuestion();
        } else {
          const aspirations = [...selected];
          if (aspirations.length > 0) {
            this.net.send({ type: "seed_aspirations", aspirations });
          }
          this.store.aspirationQuiz = false;
          overlay.remove();
        }
      };
      btnRow.appendChild(nextBtn);
      panel.appendChild(btnRow);

      const skip = document.createElement("button");
      skip.textContent = "Skip";
      skip.style.cssText = `margin-top: 12px; background: transparent; border: none; color: var(--dim); cursor: pointer; font-size: 12px; font-family: inherit;`;
      skip.onclick = () => {
        this.store.aspirationQuiz = false;
        overlay.remove();
      };
      panel.appendChild(skip);
    };

    renderQuestion();
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  private handleConciergeAction(actionType: string): void {
    switch (actionType) {
      case "open_market":
        document.getElementById("marketplace-btn")?.click();
        break;
      case "open_board":
        this.store.toggleBoard(true);
        break;
      case "open_settings":
        document.getElementById("settings-btn")?.click();
        break;
      case "open_achievements":
        this.store.toggleAchievements(true);
        break;
      case "open_leaderboards":
        this.store.toggleAchievements(true);
        // Switch to leaderboards tab
        const lbTab = document.querySelector("[data-ach-tab='leaderboards']") as HTMLElement;
        lbTab?.click();
        break;
      case "explore_world":
        document.getElementById("worlds-btn")?.click();
        break;
    }
  }

  private renderNextSteps(): void {
    const panel = document.getElementById("next-steps")!;
    const list = document.getElementById("next-steps-list")!;
    if (!panel || !list) return;

    const overlayOpen = ["detail", "board-panel", "gantt-panel", "vmodel-panel"].some(
      (id) => !(document.getElementById(id)?.hidden ?? true),
    );
    if (overlayOpen) {
      panel.hidden = true;
      return;
    }

    const suggestions = computeSuggestions(this.store);
    if (suggestions.length === 0) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    list.innerHTML = suggestions.map((s) =>
      `<div class="next-step-item" data-action="${s.action}"><span class="next-step-icon">${s.icon}</span><span class="next-step-label">${this.escape(s.label)}</span></div>`
    ).join("");

    list.querySelectorAll(".next-step-item").forEach((el) => {
      el.addEventListener("click", () => {
        const action = el.getAttribute("data-action") || "";
        this.handleConciergeAction(action);
      });
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
      html += `<p style="color:var(--dim);font-size:0.85rem;text-align:center;padding:2rem 0;">No MCP servers forged yet. Agents can build and register MCP servers using the <code>register_mcp_server</code> tool.</p>`;
    } else {
      for (const s of servers) {
        const statusColor = s.status === "running" ? "var(--green)" : s.status === "error" ? "var(--red)" : "var(--dim)";
        html += `<div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:0.5rem;padding:0.8rem;margin-bottom:0.6rem;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:start;">`;
        html += `<div><strong style="color:var(--text);">${s.name}</strong> <span style="color:${statusColor};font-size:0.75rem;">● ${s.status}</span></div>`;
        html += `<button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;" data-forge-unregister="${s.id}">Remove</button>`;
        html += `</div>`;
        if (s.description) {
          html += `<p style="color:var(--dim);font-size:0.78rem;margin:0.3rem 0;">${s.description}</p>`;
        }
        html += `<p style="color:var(--dim);font-size:0.72rem;margin:0.2rem 0;">Built by ${s.builtByName} · ${s.runtime} · ${s.entryFile}</p>`;
        if (s.error) {
          html += `<p style="color:var(--red);font-size:0.72rem;margin:0.2rem 0;">${s.error}</p>`;
        }
        if (s.tools.length > 0) {
          html += `<div style="margin-top:0.4rem;">`;
          for (const t of s.tools) {
            html += `<span style="display:inline-block;background:var(--accent-light);border:1px solid var(--panel-edge);border-radius:0.3rem;padding:0.15rem 0.5rem;margin:0.15rem 0.15rem 0 0;font-size:0.72rem;color:var(--accent);">${t.name}</span>`;
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
      html += `<div style="padding:8px 12px;color:var(--accent);font-size:13px;">Connected as <b>${esc(status.login ?? "unknown")}</b></div>`;

      const data = this.store.githubData;
      if (data?.error) {
        html += `<div class="railway-error"><div class="railway-error-text">${esc(data.error)}</div></div>`;
      }

      // Create new world fork
      html += `<div style="padding:8px 12px;border-bottom:1px solid var(--panel-edge);">`;
      html += `<div style="font-size:12px;color:var(--dim);margin-bottom:6px;">Create new world fork:</div>`;
      html += `<div style="display:flex;gap:6px;">`;
      html += `<input id="github-branch-name" placeholder="world-name" maxlength="40" style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--text);font-size:13px;" />`;
      html += `<button id="github-fork-btn" style="padding:6px 12px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:13px;">Fork & Create Branch</button>`;
      html += `</div>`;
      html += `</div>`;

      // List existing branches with deploy controls
      if (data && data.branches.length > 0) {
        html += `<div class="railway-projects">`;
        html += `<div style="padding:8px 12px;font-size:12px;color:var(--dim);">World branches (${data.branches.length}):</div>`;
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
              html += `<span style="font-size:11px;color:var(--amber);padding:3px 8px;">⏳ deploying...</span>`;
            } else if (existingDeploy) {
              const statusColor = existingDeploy.status.toLowerCase().includes("deploy") || existingDeploy.status.toLowerCase().includes("active") || existingDeploy.status.toLowerCase().includes("running") ? "var(--green)" : "var(--dim)";
              html += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">`;
              html += `<span style="font-size:11px;color:${statusColor};">● ${esc(existingDeploy.status)}</span>`;
              if (existingDeploy.railwayServiceUrl) {
                html += `<a href="${esc(existingDeploy.railwayServiceUrl)}" target="_blank" style="font-size:11px;color:var(--accent);">open ↗</a>`;
                html += `<button class="btn" id="github-enter-${esc(branch.name)}" style="font-size:10px;padding:2px 6px;margin-left:auto;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--accent);display:inline-flex;align-items:center;gap:3px;">${ICON.portal} Open Portal</button>`;
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

    let html = `<div style="width:90vw;max-width:1100px;height:85vh;background:var(--panel);border:1px solid var(--panel-edge);border-radius:10px;display:flex;flex-direction:column;overflow:hidden;">`;

    // Header
    html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--panel-edge);background:var(--panel-soft);">`;
    html += `<span style="color:var(--accent);font-size:14px;font-weight:bold;">📝 ${esc(branch)} — ${esc(file ? file.path : this.store.codeEditorPath || "/")}</span>`;
    html += `<div style="display:flex;gap:6px;">`;
    if (file) {
      html += `<button id="ce-save" style="padding:4px 10px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:12px;">💾 Save</button>`;
      html += `<button id="ce-delete" style="padding:4px 10px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--red);cursor:pointer;font-size:12px;">🗑 Delete</button>`;
    }
    html += `<button id="ce-new-file" style="padding:4px 10px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--text);cursor:pointer;font-size:12px;">+ New File</button>`;
    if (this.store.currentWorld) {
      html += `<button id="ce-redeploy" style="padding:4px 10px;border-radius:6px;border:1px solid var(--panel-edge);background:var(--panel-soft);color:var(--amber);cursor:pointer;font-size:12px;">🚀 Redeploy World</button>`;
    }
    html += `<button class="x" id="ce-close" style="margin-left:4px;">✕</button>`;
    html += `</div></div>`;

    // Body: file tree (left) + editor (right)
    html += `<div style="display:flex;flex:1;overflow:hidden;">`;

    // File tree sidebar
    html += `<div style="width:240px;border-right:1px solid var(--panel-edge);overflow-y:auto;padding:4px 0;">`;
    // Breadcrumb / back button
    if (this.store.codeEditorPath) {
      html += `<div id="ce-up" style="padding:4px 12px;cursor:pointer;color:var(--dim);font-size:12px;">📁 ../</div>`;
    }
    for (const entry of dir) {
      const icon = entry.type === "dir" ? "📁" : "📄";
      const name = entry.path.split("/").pop() ?? entry.path;
      html += `<div class="ce-entry" data-path="${esc(entry.path)}" data-type="${entry.type}" style="padding:3px 12px;cursor:pointer;color:var(--text);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${icon} ${esc(name)}</div>`;
    }
    if (dir.length === 0) {
      html += `<div style="padding:8px 12px;color:var(--dim);font-size:12px;">Loading...</div>`;
    }
    html += `</div>`;

    // Editor area
    html += `<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">`;
    if (file) {
      html += `<div id="ce-monaco" style="flex:1;overflow:hidden;"></div>`;
      // Commit message + save bar
      html += `<div style="padding:6px 8px;border-top:1px solid var(--panel-edge);display:flex;gap:6px;align-items:center;background:var(--panel-soft);">`;
      html += `<input id="ce-commit-msg" placeholder="Commit message..." maxlength="100" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--panel-edge);background:var(--panel);color:var(--text);font-size:12px;" value="Update ${esc(file.path.split("/").pop() ?? file.path)}" />`;
      html += `</div>`;
    } else {
      html += `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:14px;">Select a file to edit</div>`;
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
        this.store.toast("World themes are sandboxed — no redeploy needed.");
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

    let html = `<div class="railway-modal-content">`;
    html += `<div class="railway-modal-header">`;
    html += `<span class="railway-modal-title">${ICON.worlds} WORLDS</span>`;
    html += `<button class="x" id="worlds-close">✕</button>`;
    html += `</div>`;

    // ── Current World ──
    if (this.store.currentWorld) {
      html += `<div style="padding:8px 12px 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Current World</div>`;
      html += `<div class="railway-project" style="border:1px solid #3a5a3a;background:#1a2a1a;">`;
      html += `<div style="display:flex;align-items:center;gap:10px;padding:8px;">`;
      html += `<span style="line-height:1;color:#5ad6a0;display:flex;align-items:center;">${ICON.pin}</span>`;
      html += `<div style="flex:1;min-width:0;">`;
      html += `<div style="font-size:14px;font-weight:600;color:#5ad6a0;">${esc(this.store.currentWorld.themeName)}</div>`;
      html += `<div style="font-size:11px;color:#888;margin-top:2px;">You are here</div>`;
      html += `</div>`;
      html += `<button class="btn" id="worlds-return" style="font-size:11px;padding:4px 12px;border:1px solid #4a8a4a;background:#2a4a2a;color:#a0e0a0;white-space:nowrap;cursor:pointer;font-weight:600;">Return to HQ</button>`;
      html += `</div>`;
      html += `</div>`;
      html += `<div style="height:1px;background:#222;margin:8px 0;"></div>`;
    }

    // ── Available Worlds ──
    html += `<div style="padding:0 12px 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Available Worlds</div>`;
    for (const world of this.store.availableWorlds) {
      const isCurrent = this.store.currentWorld?.themeId === world.themeId;
      html += `<div class="railway-project" style="border:1px solid #333;background:#1a1a24;">`;
      html += `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px;">`;
      html += `<span style="line-height:1;color:#aaa;display:flex;align-items:center;">${(ICON as any)[world.icon] ?? ICON.worlds}</span>`;
      html += `<div style="flex:1;min-width:0;">`;
      html += `<div style="font-size:14px;font-weight:600;color:#e0e0e0;">${esc(world.name)}</div>`;
      html += `<div style="font-size:11px;color:#888;margin-top:2px;">${esc(world.description)}</div>`;
      html += `</div>`;
      if (isCurrent) {
        html += `<span style="font-size:11px;color:#5ad6a0;white-space:nowrap;">● here</span>`;
      } else {
        html += `<button class="btn" id="worlds-enter-${esc(world.themeId)}" style="font-size:11px;padding:4px 12px;border:1px solid #4a6a8a;background:#2a4a6a;color:#c0e0ff;white-space:nowrap;cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${ICON.portal} Enter</button>`;
      }
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`;
    modal.innerHTML = html;
    modal.hidden = false;

    // Wire close
    document.getElementById("worlds-close")!.addEventListener("click", () => {
      this.store.toggleWorldsPanel(false);
    });

    // Wire Return button
    const returnBtn = document.getElementById("worlds-return");
    if (returnBtn) {
      returnBtn.addEventListener("click", () => {
        const scene = this.store.sceneRef as any;
        if (scene?.exitWorld) scene.exitWorld();
      });
    }

    // Wire Enter buttons
    for (const world of this.store.availableWorlds) {
      if (this.store.currentWorld?.themeId === world.themeId) continue;
      const btn = document.getElementById(`worlds-enter-${world.themeId}`);
      if (btn) {
        btn.addEventListener("click", () => {
          const scene = this.store.sceneRef as any;
          if (scene?.enterWorldPortal) {
            scene.enterWorldPortal(world.themeId, world.name);
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

  private toast(text: string, icon?: string): void {
    const now = Date.now();
    if (text === this.lastToastText && now - this.lastToastTime < 2000) return;
    this.lastToastText = text;
    this.lastToastTime = now;
    const box = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = "toast";
    if (icon) {
      const iconSpan = document.createElement("span");
      iconSpan.className = "toast-icon";
      iconSpan.innerHTML = icon;
      el.appendChild(iconSpan);
    }
    const textSpan = document.createElement("span");
    textSpan.textContent = text;
    el.appendChild(textSpan);
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
      html += `<div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:var(--dim);">TOTAL COST</div><div style="font-size:1.1rem;font-weight:600;color:var(--text);">${fmtCost(data.totalCost)}</div></div>`;
      html += `<div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:var(--dim);">API CALLS</div><div style="font-size:1.1rem;font-weight:600;color:var(--text);">${data.totalCalls}</div></div>`;
      html += `<div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:var(--dim);">INPUT TOKENS</div><div style="font-size:1.1rem;font-weight:600;color:var(--text);">${fmtTokens(data.totalInputTokens)}</div></div>`;
      html += `<div style="background:var(--panel-soft);border:1px solid var(--panel-edge);border-radius:0.5rem;padding:0.6rem 0.8rem;min-width:100px;"><div style="font-size:0.7rem;color:var(--dim);">OUTPUT TOKENS</div><div style="font-size:1.1rem;font-weight:600;color:var(--text);">${fmtTokens(data.totalOutputTokens)}</div></div>`;
      html += `</div>`;

      // Monthly cap progress bar
      const currentMonth = new Date().toISOString().slice(0, 7);
      const monthSpend = (data.byDay ?? []).filter((d: any) => d.date.startsWith(currentMonth)).reduce((s: number, d: any) => s + d.cost, 0);
      const capPct = Math.min(100, (monthSpend / 30) * 100);
      const capColor = monthSpend >= 30 ? "var(--red)" : monthSpend >= 25 ? "var(--amber)" : "var(--green)";
      html += `<div class="sec">THIS MONTH — $${monthSpend.toFixed(2)} / $30.00</div>`;
      html += `<div style="background:var(--panel-soft);border-radius:0.4rem;height:20px;overflow:hidden;margin-bottom:1rem;border:1px solid var(--panel-edge);"><div style="width:${capPct}%;height:100%;background:${capColor};border-radius:0.4rem;transition:width 0.3s;"></div></div>`;


      if (data.byAgent?.length > 0) {
        html += `<div class="sec">BY AGENT</div><div style="display:flex;flex-direction:column;gap:0.3rem;margin-bottom:1rem;">`;
        for (const a of data.byAgent) {
          html += `<div style="display:flex;justify-content:space-between;font-size:0.82rem;padding:0.3rem 0.5rem;background:var(--panel-soft);border-radius:0.4rem;"><span style="color:var(--text);">${esc(a.agentName)}</span><span style="color:var(--dim);">${fmtCost(a.cost)} · ${a.calls} calls</span></div>`;
        }
        html += `</div>`;
      }

      if (data.byDay?.length > 0) {
        html += `<div class="sec">DAILY SPEND</div><div style="display:flex;flex-direction:column;gap:0.2rem;">`;
        const maxCost = Math.max(...data.byDay.map((d: any) => d.cost), 0.001);
        for (const d of data.byDay) {
          const barWidth = Math.max(2, (d.cost / maxCost) * 100);
          html += `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;"><span style="color:var(--dim);min-width:70px;">${d.date}</span><div style="flex:1;background:var(--panel-soft);border-radius:0.25rem;height:16px;overflow:hidden;"><div style="width:${barWidth}%;height:100%;background:var(--accent);border-radius:0.25rem;"></div></div><span style="color:var(--text);min-width:60px;text-align:right;">${fmtCost(d.cost)}</span></div>`;
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
