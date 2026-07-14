import type { Net } from "../net";
import type { FeedItem, PendingInvite, Store } from "../store";
import type { AgentRole, CardStatus, LogEntry, OfficeTheme, Provider, TaskCard, CharAppearance, MCPServerConfig, PersonalityTraits } from "../../../shared/types";
import { SWARMS_MODELS, OFFICE_THEMES, YUKI_ID, HERMES_ID,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES,
  ACCENT_COLOR_OPTIONS, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
  randomAppearance, DEFAULT_APPEARANCE, isValidAppearance, randomPersonality,
} from "../../../shared/types";
import { md } from "./md";
import { achievements, ACHIEVEMENTS } from "../game/achievements";
import { touchInput, isTouchDevice } from "../touch";
import { generateCharPreviewDataURL } from "../game/chargen";
import { MarketplaceBrowser } from "./marketplace";
import type { MarketplaceAgent } from "../../../shared/marketplace";
import type { MCPCatalogServer } from "../../../shared/mcp-catalog";
import { toMCPServerConfig } from "../../../shared/mcp-catalog";
import { getToken, getUserEmail, signOut, isAuthEnabled, onAuthChange } from "../auth";
import { startSubscriptionCheckout, openCustomerPortal } from "../payment";

const NAME_POOL = [
  "Pixel", "Mocha", "Byte", "Clippy", "Turbo", "Wren", "Dot", "Gizmo",
  "Nova", "Patch", "Echo", "Quill", "Zippy", "Lumen", "Socket", "Beep",
];

const PLAYER_KEY = "agent-hq-player";

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

// ----------------------------------------------------------- saved outfits

const OUTFITS_KEY = "agent-hq-outfits";

interface SavedOutfit {
  id: string;
  name: string;
  appearance: CharAppearance;
  createdAt: number;
}

function loadOutfits(): SavedOutfit[] {
  try {
    const raw = localStorage.getItem(OUTFITS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedOutfit[];
    return arr.filter((o) => isValidAppearance(o.appearance));
  } catch {
    return [];
  }
}

function saveOutfits(outfits: SavedOutfit[]): void {
  localStorage.setItem(OUTFITS_KEY, JSON.stringify(outfits));
}

function addOutfit(name: string, appearance: CharAppearance): SavedOutfit {
  const outfits = loadOutfits();
  const outfit: SavedOutfit = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 24) || "Outfit",
    appearance,
    createdAt: Date.now(),
  };
  outfits.unshift(outfit);
  saveOutfits(outfits);
  return outfit;
}

function removeOutfit(id: string): void {
  const outfits = loadOutfits().filter((o) => o.id !== id);
  saveOutfits(outfits);
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
  private feedCollapsed = false;
  private feedExpanded = false;
  private rosterCollapsed = false;
  private renderQueued = false;
  private perfVisible = false;
  private voiceBtn: HTMLButtonElement | null = null;

  constructor(
    private store: Store,
    private net: Net,
  ) {
    const root = document.getElementById("hud")!;
    root.innerHTML = `
      <div class="topbar">
        <span class="logo">AGENT&nbsp;HQ</span>
        <span id="workspace-name"></span>
        <button class="btn mini" id="marketplace-btn">🛒 MARKET</button>
        <button class="btn mini" id="rooms-btn">🚪 ROOMS</button>
        <button class="btn mini" id="voice-btn" title="Toggle voice chat">🎤</button>
        <button class="btn mini" id="settings-btn">⚙ SETTINGS</button>
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
        <div class="logs" id="logs"></div>
        <div class="row chat-row">
          <input id="d-chat" placeholder="Say something… (chat, not a task)" />
          <button class="btn" id="d-say">SAY</button>
        </div>
        <div class="handoff">WHEN DONE, HAND OFF TO
          <select id="d-handoff"><option value="">— nobody —</option></select>
        </div>
        <textarea id="task-input" rows="3" placeholder="Give them a task…"></textarea>
        <div class="row">
          <button class="btn primary" id="d-assign">ASSIGN ▶</button>
          <button class="btn" id="d-stop">STOP</button>
          <button class="btn" id="d-clear">NEW CHAT</button>
          <button class="btn" id="d-publish">📤 PUBLISH</button>
          <button class="btn danger" id="d-fire">FIRE</button>
        </div>
      </div>
      <div class="modal-backdrop" id="publish-modal" hidden></div>
      <div class="modal-backdrop" id="hire-modal" hidden></div>
      <div class="modal-backdrop" id="settings-modal" hidden></div>
      <div class="modal-backdrop" id="onboard-modal" hidden></div>
      <div class="modal-backdrop" id="achievements-modal" hidden></div>
      <div class="modal-backdrop" id="hall-of-fame-modal" hidden></div>
      <div class="modal-backdrop" id="railway-modal" hidden></div>
      <div class="modal-backdrop" id="wardrobe-modal" hidden></div>
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
      <div class="toasts" id="toasts"></div>
      <div class="hint">WASD/arrows move · E talk/board · H hire · F feed · B board · V voice · click an agent · ESC close</div>
      <div class="hint touch">Tap an agent · Use joystick to move · Tap action buttons</div>
      <div class="mobile-panel-backdrop" id="mobile-backdrop"></div>
      <div class="mobile-panel-toggles">
        <button class="mpt-btn" id="mpt-roster" title="Roster">👥</button>
        <button class="mpt-btn" id="mpt-feed" title="Feed">💬</button>
        <button class="mpt-btn" id="mpt-hire" title="Hire">➕</button>
        <button class="mpt-btn" id="mpt-board" title="Board">📋</button>
      </div>
      <div class="touch-controls">
        <div class="joystick-base" id="joystick-base">
          <div class="joystick-knob" id="joystick-knob"></div>
        </div>
        <div class="mobile-actions">
          <button class="mobile-action-btn primary" id="ma-interact" title="Interact / Talk">E</button>
          <button class="mobile-action-btn" id="ma-voice" title="Voice chat">🎤</button>
          <button class="mobile-action-btn" id="ma-teleport" title="Teleport">Q</button>
        </div>
      </div>
    `;

    document.getElementById("hire-btn")!.addEventListener("click", () => this.openHireModal());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());
    document.getElementById("rooms-btn")!.addEventListener("click", () => {
      this.net.send({ type: "list_orgs" });
      this.openRoomsPanel();
    });

    // ── Voice chat toggle ──────────────────────────────────────────────
    const voiceBtn = document.getElementById("voice-btn")! as HTMLButtonElement;
    voiceBtn.addEventListener("click", () => this.toggleVoice());
    this.voiceBtn = voiceBtn;

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
    mqBrowser.onSetMcpKey = (serverUrl: string, apiKey: string) => {
      this.net.send({ type: "set_mcp_key", serverUrl, apiKey });
    };
    mqBrowser.onCheckMcpKeys = (serverUrls: string[]) => {
      this.net.send({ type: "check_mcp_keys", serverUrls });
    };
    mqBrowser.onStartMcpOAuth = (serverUrl: string) => {
      this.net.send({ type: "start_mcp_oauth", serverUrl });
    };
    mqBrowser.onInstallServer = (server: MCPCatalogServer) => {
      const config = toMCPServerConfig(server);
      const installed = this.getInstalledMcpServers();
      installed.push(config);
      localStorage.setItem("agent-hq-installed-mcp", JSON.stringify(installed));
      this.store.toast(`${server.name} installed — assign it when hiring a new agent.`);
    };
    const mcpKeysListener = (results: { serverUrl: string; hasKey: boolean }[]) => {
      if (mqBrowser.onMcpKeysStatusHandler) mqBrowser.onMcpKeysStatusHandler(results);
    };
    this.store.mcpKeysStatusListeners.push(mcpKeysListener);
    document.getElementById("marketplace-btn")!.addEventListener("click", () => mqBrowser.toggle());

    document.getElementById("d-publish")!.addEventListener("click", () => this.openPublishModal());
    this.bindDetail();
    this.bindFeed();
    this.bindBoard();
    this.bindHallOfFame();
    this.bindRailwayPanel();
    this.bindShortcuts();
    this.bindMobileControls();
    // agents stream many messages per second — coalesce to one render per frame
    // so DOM work never starves the game loop
    store.subscribe(() => this.scheduleRender());
    store.onToast((text) => this.toast(text));
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

    this.maybeOnboard();
  }

  // ---------------------------------------------------------- static wiring

  private bindDetail(): void {
    const input = document.getElementById("task-input") as HTMLTextAreaElement;
    document.getElementById("d-close")!.addEventListener("click", () => this.store.select(null));
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
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        (document.getElementById("d-assign") as HTMLButtonElement).click();
      }
    });
    document.getElementById("d-stop")!.addEventListener("click", () => {
      if (this.store.selectedId) this.net.send({ type: "stop", agentId: this.store.selectedId });
    });
    document.getElementById("d-clear")!.addEventListener("click", () => {
      const agent = this.store.selected();
      if (
        agent &&
        confirm(`Clear ${agent.name}'s chat and wipe their memory? They'll forget every previous order. Files in their workspace stay.`)
      ) {
        this.net.send({ type: "clear", agentId: agent.id });
      }
    });
    document.getElementById("d-fire")!.addEventListener("click", () => {
      if (this.store.selectedId) this.net.send({ type: "fire", agentId: this.store.selectedId });
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
      voice.stop();
      if (this.voiceBtn) {
        this.voiceBtn.textContent = "🎤";
        this.voiceBtn.style.color = "";
      }
      const maVoice = document.getElementById("ma-voice");
      if (maVoice) { maVoice.textContent = "🎤"; maVoice.classList.remove("primary"); }
    } else {
      voice.start().then(() => {
        if (this.voiceBtn) {
          this.voiceBtn.textContent = "🎙";
          this.voiceBtn.style.color = "#4caf50";
        }
        const maVoice = document.getElementById("ma-voice");
        if (maVoice) { maVoice.textContent = "🎙"; maVoice.classList.add("primary"); }
      }).catch(() => {
        this.store.toast("Microphone access denied — check browser settings.");
      });
    }
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
      const wardrobe = document.getElementById("wardrobe-modal")!;
      if (e.key === "Escape") {
        hire.hidden = true;
        settings.hidden = true;
        ach.hidden = true;
        hof.hidden = true;
        railway.hidden = true;
        wardrobe.hidden = true;
        this.store.toggleAchievements(false);
        this.store.toggleHallOfFame(false);
        this.store.toggleWardrobe(false);
        return;
      }
      // never steal keystrokes from a form field or while a modal is up
      const active = document.activeElement?.tagName;
      if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
      if (!hire.hidden || !settings.hidden || !onboard.hidden || !ach.hidden || !hof.hidden || !wardrobe.hidden) return;
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

    // ── Virtual joystick ──
    const base = document.getElementById("joystick-base")!;
    const knob = document.getElementById("joystick-knob")!;
    const baseRect = () => base.getBoundingClientRect();
    const maxDist = 40;
    let active = false;

    const setKnob = (dx: number, dy: number) => {
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, maxDist);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
      touchInput.moveX = clamped / maxDist * (dx / (dist || 1));
      touchInput.moveY = clamped / maxDist * (dy / (dist || 1));
    };

    const resetKnob = () => {
      knob.style.transform = "translate(-50%, -50%)";
      touchInput.moveX = 0;
      touchInput.moveY = 0;
    };

    base.addEventListener("touchstart", (e) => {
      e.preventDefault();
      active = true;
      const r = baseRect();
      const t = e.touches[0];
      setKnob(t.clientX - r.left - r.width / 2, t.clientY - r.top - r.height / 2);
    }, { passive: false });

    base.addEventListener("touchmove", (e) => {
      if (!active) return;
      e.preventDefault();
      const r = baseRect();
      const t = e.touches[0];
      setKnob(t.clientX - r.left - r.width / 2, t.clientY - r.top - r.height / 2);
    }, { passive: false });

    const endTouch = () => {
      active = false;
      resetKnob();
    };
    base.addEventListener("touchend", endTouch);
    base.addEventListener("touchcancel", endTouch);

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
        <h1>AGENT&nbsp;HQ</h1>
        <p class="sub">— FIRST DAY ON THE JOB —</p>
        <div class="onboard-layout">
          <div class="onboard-form">
            <label>YOUR NAME
              <input id="ob-name" maxlength="24" placeholder="e.g. Kye" autofocus />
            </label>
            <label>WORKSPACE NAME
              <input id="ob-workspace" maxlength="32" placeholder="e.g. Swarms HQ" />
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
    };
    document.getElementById("ob-go")!.addEventListener("click", go);
    modal.querySelectorAll("input").forEach((el) =>
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") go();
      }),
    );
  }

  // --------------------------------------------------------------- rooms

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
            <button class="btn ${isHq2 ? 'primary' : ''}" id="room-hq2-btn" style="font-size:0.8rem;${isHq2 ? 'opacity:0.6;pointer-events:none;' : ''}">🌐 AGENT HQ HQ</button>
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
            <input id="room-invite-input" placeholder="User ID…" style="flex:1;padding:0.5rem;background:#222;border:1px solid #444;border-radius:6px;color:#e0e0e0;font-size:0.85rem;" />
            <button class="btn" id="room-invite-btn" style="font-size:0.8rem;">INVITE</button>
          </div>
          <div style="font-size:0.7rem;color:#666;margin-top:0.3rem;">Tip: Find user IDs of players in the room from the player list above.</div>
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
      this.net.send({ type: "invite_to_room", roomId: this.store.roomId, userId, role: "member" });
      this.toast(`Invite sent to ${userId}`);
      close();
    });

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
          <button class="tab" data-tab="billing">BILLING</button>
          <button class="tab" data-tab="controls">CONTROLS</button>
          <button class="tab" data-tab="data">DATA</button>
        </div>
        <div class="tabpanel" data-panel="agents">
          <div class="sec">CLINE AGENT</div>
          <label>MAX ITERATIONS PER TASK
            <input id="s-turns" type="number" min="1" max="500" value="${s.cline.maxIterations}" />
          </label>
          <label class="chk">
            <input type="checkbox" id="s-auto-cmd" ${s.cline.autoApproveCommands ? "checked" : ""} />
            <span>AUTO-APPROVE SHELL COMMANDS (unattended execution)</span>
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
          <div class="sec">SWARMS API KEY</div>
          <p style="font-size:0.8rem;color:#888;margin-bottom:0.5rem;">Bring your own key — your agents will use it instead of the server's shared key. Get one at <a href="https://swarms.world/platform/api-keys" target="_blank" style="color:#4f9dde;">swarms.world</a>.</p>
          <div id="api-key-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.hasApiKey ? "#53b86b" : "#e05d5d"};">
            ${this.store.hasApiKey ? "✓ You have a personal API key set." : "⚠ No personal API key — using the server's shared key."}
          </div>
          <label>SWARMS API KEY
            <input id="s-api-key" type="password" placeholder="sk-..." autocomplete="off"
              style="width:100%;padding:0.6rem 0.8rem;border-radius:0.5rem;border:1px solid #333;background:#1a1a1a;color:#e0e0e0;font-size:0.9rem;" />
          </label>
          <div class="row" style="margin-top:0.75rem;">
            <button class="btn primary" id="s-save-key">SAVE KEY</button>
            <button class="btn danger" id="s-clear-key" ${this.store.hasApiKey ? "" : "disabled"}>CLEAR KEY</button>
          </div>
        </div>
        <div class="tabpanel" data-panel="billing" hidden>
          <div class="sec">SUBSCRIPTION</div>
          <div id="sub-status" style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.subscriptionActive ? "#53b86b" : "#e05d5d"};">
            ${this.store.subscriptionActive ? "✓ Active — you can hire agents." : "⚠ No active subscription — $20/month to hire agents."}
          </div>
          ${this.store.subscriptionActive
            ? `<button class="btn" id="s-manage-sub">MANAGE SUBSCRIPTION</button>`
            : `<button class="btn primary" id="s-subscribe">SUBSCRIBE — $20/MONTH</button>`}
          <div class="sec" style="margin-top:1rem;">ENTRANCE FEE</div>
          <div style="font-size:0.85rem;margin-bottom:0.5rem;color:${this.store.entrancePaid ? "#53b86b" : "#e05d5d"};">
            ${this.store.entrancePaid ? "✓ Paid — you have access to the world." : "⚠ Not paid — $1 one-time fee required."}
          </div>
        </div>
        <div class="tabpanel" data-panel="controls" hidden>
          <div class="sec">QUICK COMMANDS</div>
          <div class="row">
            <button class="btn" id="s-hire">+ HIRE AGENT…</button>
            <button class="btn" id="s-feed">${this.feedCollapsed ? "OPEN" : "CLOSE"} OFFICE FEED</button>
          </div>
          <div class="row">
            <button class="btn" id="s-board">📋 TASK BOARD</button>
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
            <div><kbd>,</kbd><span>open settings</span></div>
            <div><kbd>P</kbd><span>show FPS overlay</span></div>
            <div><kbd>ESC</kbd><span>close panels &amp; modals</span></div>
            <div><kbd>⌘/CTRL</kbd>+<kbd>ENTER</kbd><span>assign the task you're typing</span></div>
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
      if (!confirm("Remove your stored API key? Your agents will fall back to the server's shared key.")) return;
      this.net.send({ type: "set_api_key", apiKey: "" });
      modal.hidden = true;
    });
    const subscribeBtn = document.getElementById("s-subscribe");
    if (subscribeBtn) {
      subscribeBtn.addEventListener("click", () => void startSubscriptionCheckout());
    }
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
          },
          game: {
            idleWander: (document.getElementById("s-wander") as HTMLInputElement).checked,
            theme: (document.getElementById("s-theme") as HTMLSelectElement).value as OfficeTheme,
          },
          railway: {
            enabled: (document.getElementById("s-railway") as HTMLInputElement)?.checked ?? false,
          },
        },
      });
      modal.hidden = true;
      this.toast("Settings saved.");
    });
    document.getElementById("s-export")!.addEventListener("click", () => this.exportAll());
    document.getElementById("s-clear-all")!.addEventListener("click", () => {
      if (
        confirm(
          "Clear every agent's chat and wipe their memories? They'll all forget previous orders (busy agents are skipped). Workspace files stay.",
        )
      ) {
        this.net.send({ type: "clear_all" });
        modal.hidden = true;
      }
    });
    document.getElementById("s-reset")!.addEventListener("click", () => {
      if (confirm("Reset your boss profile? You'll go through onboarding again. Agents and logs are kept.")) {
        localStorage.removeItem(PLAYER_KEY);
        location.reload();
      }
    });
  }

  /** One-click hire: random name, default model, worker role. */
  private quickHire(provider: Provider): void {
    const name = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
    const model = SWARMS_MODELS[0];
    this.net.send({
      type: "hire",
      name,
      provider,
      model: model.id,
      systemPrompt: "",
      role: "worker",
    });
    this.toast(`${name} is on the way in (${model.label}).`);
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
    a.download = `agent-hq-export-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast("Export downloaded.");
  }

  // ------------------------------------------------------------- hire modal

  private openHireModal(): void {
    const modal = document.getElementById("hire-modal")!;
    const suggested = NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)];
    const modelOptions = () =>
      SWARMS_MODELS
        .map((m, i) => `<option value="${m.id}"${i === 0 ? ' selected' : ''}>${m.label}</option>`)
        .join("");

    const builder = new CharBuilder("h", randomAppearance(), () => {});
    const personality = randomPersonality();

    modal.hidden = false;
    const subNotice = this.store.subscriptionActive ? "" : `
      <div style="margin-bottom:0.8rem;padding:0.6rem 0.8rem;border-radius:8px;background:rgba(229,93,93,0.15);border:1px solid rgba(229,93,93,0.3);color:#e05d5d;font-size:0.82rem;line-height:1.3;">
        <strong>Subscription required.</strong> You need a $20/month subscription to hire agents.
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
              <button class="btn" id="h-save-outfit" style="font-size:0.7rem;padding:0.3rem 0.5rem;">💾 SAVE OUTFIT</button>
              <select class="outfit-select" id="h-load-outfit">
                <option value="">Load outfit…</option>
                ${loadOutfits().map((o) => `<option value="${o.id}">${o.name}</option>`).join("")}
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
            <label>MODEL <select id="h-model">${modelOptions()}</select></label>
            <label>SYSTEM PROMPT <span class="opt">(optional)</span>
              <textarea id="h-prompt" rows="3"
                placeholder="Standing instructions for this agent, e.g. 'You are a senior TypeScript reviewer. Always write tests first.'"></textarea>
            </label>
            <div class="sec" style="margin-top:0.3rem;font-size:0.8rem;color:#888;">PERSONALITY</div>
            <div id="h-traits" style="padding:0.4rem 0;">
              ${traitSliders}
              <button class="btn" id="h-rand-personality" style="font-size:0.75rem;padding:0.3rem 0.6rem;margin-top:0.3rem;">🎲 RANDOMIZE</button>
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

    const modelSel = document.getElementById("h-model") as HTMLSelectElement;
    modelSel.selectedIndex = 0;
    document.getElementById("h-cancel")!.addEventListener("click", () => (modal.hidden = true));
    const subscribeBtn = document.getElementById("h-subscribe");
    if (subscribeBtn) {
      subscribeBtn.addEventListener("click", () => void startSubscriptionCheckout());
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
    document.getElementById("h-save-outfit")!.addEventListener("click", () => {
      const name = prompt("Name this outfit:", "");
      if (name === null) return;
      addOutfit(name, builder.getAppearance());
      // Refresh the load dropdown
      const sel = document.getElementById("h-load-outfit") as HTMLSelectElement;
      sel.innerHTML = `<option value="">Load outfit…</option>` +
        loadOutfits().map((o) => `<option value="${o.id}">${o.name}</option>`).join("");
      this.toast("Outfit saved!");
    });

    // Load a saved outfit into the builder
    document.getElementById("h-load-outfit")!.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (!id) return;
      const outfit = loadOutfits().find((o) => o.id === id);
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
      const installedMcp = this.getInstalledMcpServers();
      this.net.send({
        type: "hire",
        name,
        provider: "cline",
        model: modelSel.value,
        systemPrompt: (document.getElementById("h-prompt") as HTMLTextAreaElement).value,
        role: (document.getElementById("h-role") as HTMLSelectElement).value as AgentRole,
        appearance: builder.getAppearance(),
        personality: traits,
        mcpServers: installedMcp.length > 0 ? installedMcp : undefined,
      });
      modal.hidden = true;
    });
  }

  private hireFromMarketplace(agent: MarketplaceAgent): void {
    // Parse the agent config JSON — may contain a custom appearance, model,
    // and systemPrompt for premium/curated marketplace agents.
    let config: { model?: string; systemPrompt?: string; appearance?: CharAppearance; mcpServers?: MCPServerConfig[] } = {};
    try {
      if (agent.agent) config = JSON.parse(agent.agent);
    } catch { /* not JSON or missing — fall back to defaults */ }

    const systemPrompt = [
      config.systemPrompt || (agent.description ? agent.description : ""),
      agent.use_cases.length > 0 ? `\nUse cases:\n${agent.use_cases.map((u) => `- ${u}`).join("\n")}` : "",
      agent.requirements.length > 0 ? `\nRequirements:\n${agent.requirements.map((r) => `- ${r}`).join("\n")}` : "",
      agent.language ? `\nLanguage: ${agent.language}` : "",
    ].filter(Boolean).join("\n").slice(0, 4000);

    const model = SWARMS_MODELS.find((m) => m.id === config.model) ?? SWARMS_MODELS[0];

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
    };

    // Trigger the helicopter delivery animation. The hire WS message is
    // sent from the scene when the agent emerges from the elevator, so the
    // server creates the agent at the right moment and syncAgents() replaces
    // the cosmetic sprite with the real NPC.
    this.store.triggerHelicopter(delivery);
  }

  private getInstalledMcpServers(): MCPServerConfig[] {
    try {
      const raw = localStorage.getItem("agent-hq-installed-mcp");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private openPublishModal(): void {
    const agent = this.store.selected();
    if (!agent || agent.id === YUKI_ID) return;

    const modal = document.getElementById("publish-modal")!;
    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal hire-modal">
        <h2>PUBLISH TO MARKETPLACE</h2>
        <p style="font-size:0.8rem;color:#888;margin-bottom:0.75rem;">
          Publish <span style="color:${agent.accent}">${esc(agent.name)}</span> to the Swarms Marketplace.
          Other users will be able to discover and hire this agent.
        </p>
        <div class="hire-form">
          <label>SUMMARY <span class="opt">(shown in browse list)</span>
            <input id="p-summary" maxlength="120" placeholder="A brief one-line summary of what this agent does" />
          </label>
          <label>DESCRIPTION <span class="opt">(full detail page)</span>
            <textarea id="p-desc" rows="4" placeholder="Detailed description of the agent's capabilities, approach, and best use cases."></textarea>
          </label>
          <label>TAGS <span class="opt">(comma-separated)</span>
            <input id="p-tags" placeholder="typescript, testing, review" />
          </label>
          <label>PRICE <span class="opt">(USD, 0 = free)</span>
            <input id="p-price" type="number" min="0" step="0.01" value="0" style="width:80px;" />
          </label>
        </div>
        <div class="row">
          <button class="btn" id="p-cancel">CANCEL</button>
          <button class="btn primary" id="p-ok">PUBLISH ▶</button>
        </div>
        <div id="p-status" style="font-size:0.8rem;margin-top:0.5rem;min-height:1.2em;"></div>
      </div>
    `;

    const statusEl = modal.querySelector("#p-status") as HTMLDivElement;

    modal.querySelector("#p-cancel")!.addEventListener("click", () => { modal.hidden = true; });
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

    modal.querySelector("#p-ok")!.addEventListener("click", async () => {
      const summary = (modal.querySelector("#p-summary") as HTMLInputElement).value.trim();
      const description = (modal.querySelector("#p-desc") as HTMLTextAreaElement).value.trim();
      const tags = (modal.querySelector("#p-tags") as HTMLInputElement).value.trim();
      const price = parseFloat((modal.querySelector("#p-price") as HTMLInputElement).value) || 0;

      if (!summary) {
        statusEl.textContent = "Summary is required.";
        statusEl.style.color = "#e05d5d";
        return;
      }

      statusEl.textContent = "Publishing…";
      statusEl.style.color = "#888";

      try {
        const res = await fetch("/api/publish-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({
            agentId: agent.id,
            name: agent.name,
            summary,
            description,
            tags,
            price,
            model: agent.model,
            systemPrompt: agent.systemPrompt ?? "",
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error ?? res.statusText);
        }

        statusEl.textContent = "Published! Your agent is now pending approval on the marketplace.";
        statusEl.style.color = "#53b86b";
        this.toast(`${agent.name} published to the marketplace!`);
        setTimeout(() => { modal.hidden = true; }, 2000);
      } catch (err) {
        statusEl.textContent = `Error: ${err instanceof Error ? err.message : "unknown"}`;
        statusEl.style.color = "#e05d5d";
      }
    });
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
    document.getElementById("conn")!.classList.toggle("ok", this.store.connected);

    this.renderRoster();
    this.renderDetail();
    this.renderFeed();
    this.renderBoard();
    this.renderAchievements();
    this.renderHallOfFame();
    this.renderRailwayPanel();
    this.renderWardrobe();
  }

  private renderRoster(): void {
    // rebuilding the list (and re-binding clicks) is wasteful on every log line —
    // skip unless something the roster actually shows has changed
    const sig =
      `${this.rosterCollapsed}|${this.store.selectedId}|` +
      [...this.store.agents.values()]
        .map((a) => a.id + a.name + a.status + a.accent + a.role)
        .join(",");
    if (sig === this.lastRosterSig) return;
    this.lastRosterSig = sig;

    const roster = document.getElementById("roster")!;
    roster.classList.toggle("collapsed", this.rosterCollapsed);
    const rows = [...this.store.agents.values()]
      .sort((a, b) => {
        const perm = (id: string) => id === YUKI_ID ? 0 : id === HERMES_ID ? 1 : 2;
        const pa = perm(a.id), pb = perm(b.id);
        return pa !== pb ? pa - pb : a.name.localeCompare(b.name);
      })
      .map(
        (a) => `
        <div class="agent-row ${a.id === this.store.selectedId ? "selected" : ""}" data-id="${a.id}">
          <span class="dot ${a.status}"></span>
          <span class="name" style="color:${a.accent}">${esc(a.name)}${a.role === "manager" ? " 👔" : a.role === "devops" ? " 🚂" : ""}</span>
          <span class="status">${a.status}</span>
        </div>`,
      )
      .join("");
    const title = `<div class="panel-title">STAFF (${this.store.agents.size})
      <button class="icon-btn" id="roster-toggle" title="${this.rosterCollapsed ? "Open staff" : "Collapse"}">
        ${this.rosterCollapsed ? ICON.open : ICON.collapse}</button></div>`;
    roster.innerHTML = this.rosterCollapsed
      ? title
      : title + (rows || `<div class="empty">nobody here yet…</div>`);
    document.getElementById("roster-toggle")!.addEventListener("click", () => {
      this.rosterCollapsed = !this.rosterCollapsed;
      this.renderRoster();
    });
    roster.querySelectorAll<HTMLElement>(".agent-row").forEach((el) =>
      el.addEventListener("click", () => this.store.select(el.dataset.id!)),
    );
  }

  private renderDetail(): void {
    const panel = document.getElementById("detail")!;
    const agent = this.store.selected();
    if (!agent) {
      panel.hidden = true;
      this.lastSelected = null;
      return;
    }
    panel.hidden = false;

    document.getElementById("d-title")!.innerHTML =
      `<span style="color:${agent.accent}">${esc(agent.name)}</span> · ${esc(agent.title)}`;
    document.getElementById("d-titlebar")!.style.borderColor = agent.accent;
    document.getElementById("d-meta")!.innerHTML = `
      <span class="dot ${agent.status}"></span> ${agent.status.toUpperCase()}
      ${agent.role === "manager" ? "· 👔 MANAGER " : ""}· ${agent.provider} / ${esc(agent.model)}
      · ${agent.id === YUKI_ID ? "own office" : agent.id === HERMES_ID ? "mail room" : `desk ${agent.deskIndex + 1}`} · ${agent.tasksDone} done`;

    // Yuki and Hermes can't be fired
    const fireBtn = document.getElementById("d-fire") as HTMLButtonElement | null;
    if (fireBtn) fireBtn.hidden = agent.id === YUKI_ID || agent.id === HERMES_ID;

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
      mcpSection.hidden = false;
      const serverUrls = mcpServers.map((s) => s.url).filter((u): u is string => !!u);
      mcpSection.innerHTML = `
        <div style="margin:0.5rem 0; padding:0.6rem; border:1px solid #333; border-radius:0.5rem; background:#1a1a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#c9852c; margin-bottom:0.4rem;">MCP SERVER AUTH</div>
          ${mcpServers.map((s, i) => {
            const isOAuth = s.authType === "oauth";
            return `
            <div style="margin-bottom:0.4rem;">
              <div style="font-size:0.7rem; color:#888; margin-bottom:0.2rem;">${esc(s.name ?? s.url ?? "MCP Server")} ${isOAuth ? '<span style="color:#4f9dde;font-size:0.6rem;">OAuth</span>' : '<span style="color:#666;font-size:0.6rem;">API Key</span>'}</div>
              <div style="display:flex; gap:0.25rem; align-items:center;">
                ${isOAuth
                  ? `<button id="d-mcp-connect-${i}" style="flex:1; padding:0.35rem 0.5rem; border:none; border-radius:0.3rem; background:#2a4a6a; color:#e0e0e0; font-size:0.7rem; cursor:pointer;">🔗 Reconnect via OAuth</button>`
                  : `<input id="d-mcp-key-${i}" type="password" placeholder="Paste new API key..." autocomplete="off"
                      style="flex:1; padding:0.35rem 0.5rem; border-radius:0.3rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.75rem;" />
                    <button id="d-mcp-save-${i}" style="padding:0.35rem 0.5rem; border:none; border-radius:0.3rem; background:#333; color:#e0e0e0; font-size:0.7rem; cursor:pointer;">Save</button>`
                }
                <span id="d-mcp-status-${i}" style="font-size:0.65rem; color:#888; min-width:1.5rem;"></span>
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
            this.net.send({ type: "start_mcp_oauth", serverUrl: s.url! });
            connectBtn.textContent = "Opening login...";
            connectBtn.disabled = true;
            setTimeout(() => { connectBtn.textContent = "🔗 Reconnect via OAuth"; connectBtn.disabled = false; }, 5000);
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
              statusEl.style.color = r.hasKey ? "#53b86b" : "#e05d5d";
            }
          }
        }
      };
      this.store.mcpKeysStatusListeners.push(this.detailMcpListener);
    } else {
      mcpSection.hidden = true;
      mcpSection.innerHTML = "";
    }

    const logs = this.store.logs.get(agent.id) ?? [];
    const logsEl = document.getElementById("logs")!;
    const logHtml = (l: LogEntry) => `<div class="log ${l.kind}">${renderEntry(l)}</div>`;
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
    this.lastSelected = agent.id;
    this.lastLogCount = logs.length;
    this.lastLogTail = logs.length ? logs[logs.length - 1] : null;

    // Disable chat input when agent is busy — prevents rate-limit toast spam
    const chatInput = document.getElementById("d-chat") as HTMLInputElement | null;
    const sayBtn = document.getElementById("d-say") as HTMLButtonElement | null;
    const isBusy = agent.status === "thinking" || agent.status === "working";
    if (chatInput) {
      chatInput.disabled = isBusy;
      chatInput.placeholder = isBusy ? `${agent.name} is busy…` : "Say something… (chat, not a task)";
    }
    if (sayBtn) sayBtn.disabled = isBusy;
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
      cards.map((c) => c.id + c.status + c.assignedAgentId + c.title).join(",") + "|" +
      agents.map((a) => a.id + a.name + a.status).join(",");
    if (sig === this.lastBoardSig) return;
    this.lastBoardSig = sig;

    const cols: Record<CardStatus, TaskCard[]> = { backlog: [], in_progress: [], done: [] };
    for (const c of cards) cols[c.status].push(c);

    const colLabels: Record<CardStatus, string> = {
      backlog: "BACKLOG",
      in_progress: "IN PROGRESS",
      done: "DONE",
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
          ? `<button class="btn mini" data-move="${c.id}" data-status="done">✓ DONE</button>`
          : "";

      return `
        <div class="board-card" data-card-id="${c.id}">
          <div class="card-title">${esc(c.title)}</div>
          ${c.description ? `<div class="card-desc">${esc(c.description)}</div>` : ""}
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
      (["backlog", "in_progress", "done"] as CardStatus[]).map(colHtml).join("");

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

    const agents = [...this.store.agents.values()].filter((a) => a.id !== YUKI_ID);
    const fired = [...this.store.firedAgents.values()];

    const allAgents = [
      ...agents.map((a) => ({
        id: a.id,
        name: a.name,
        title: a.title,
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
        title: a.title,
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
      html += `<span class="hof-spotlight-title">${esc(topAgent.title)}</span>`;
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
        html += `<span class="hof-title">${esc(a.title)}</span>`;
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

  private renderWardrobe(): void {
    const modal = document.getElementById("wardrobe-modal")!;
    if (!this.store.wardrobeOpen) {
      modal.hidden = true;
      modal.innerHTML = "";
      return;
    }

    const current = this.store.player?.appearance ?? DEFAULT_APPEARANCE;
    const builder = new CharBuilder("wd", current, () => {});

    const renderOutfitList = (): string => {
      const outfits = loadOutfits();
      if (outfits.length === 0) {
        return `<p class="outfit-empty">No saved outfits yet. Randomize and save one!</p>`;
      }
      return outfits.map((o) => `
        <div class="outfit-item" data-id="${o.id}">
          <div class="outfit-thumb" style="background-image:url('${generateCharPreviewDataURL(o.appearance, 2)}')"></div>
          <span class="outfit-name">${o.name}</span>
          <button class="outfit-delete" data-id="${o.id}" title="Delete">✕</button>
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
              <button class="btn outfit-save-btn" id="wd-save-outfit">💾 SAVE CURRENT</button>
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

    const refreshOutfitList = (): void => {
      const listEl = document.getElementById("wd-outfit-list");
      if (listEl) listEl.innerHTML = renderOutfitList();
      wireOutfitItems();
    };

    const wireOutfitItems = (): void => {
      document.querySelectorAll<HTMLElement>(".outfit-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          if ((e.target as HTMLElement).classList.contains("outfit-delete")) return;
          const id = item.dataset.id;
          const outfit = loadOutfits().find((o) => o.id === id);
          if (outfit) builder.setAppearance(outfit.appearance);
        });
      });
      document.querySelectorAll<HTMLElement>(".outfit-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeOutfit(btn.dataset.id!);
          refreshOutfitList();
        });
      });
    };

    wireOutfitItems();

    document.getElementById("wd-save-outfit")!.addEventListener("click", () => {
      const name = prompt("Name this outfit:", "");
      if (name === null) return;
      addOutfit(name, builder.getAppearance());
      refreshOutfitList();
      this.toast("Outfit saved!");
    });

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

  private toast(text: string): void {
    const box = document.getElementById("toasts")!;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 4000);
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
