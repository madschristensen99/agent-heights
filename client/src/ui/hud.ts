import type { Net } from "../net";
import type { FeedItem, Store } from "../store";
import type { AgentRole, CardStatus, LogEntry, OfficeTheme, Provider, TaskCard, CharAppearance } from "../../../shared/types";
import { SWARMS_MODELS, OFFICE_THEMES, YUKI_ID, HERMES_ID,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES,
  ACCENT_COLOR_OPTIONS, BEARD_STYLES, EYE_COLORS, HEAD_FEATURES,
  randomAppearance, DEFAULT_APPEARANCE,
} from "../../../shared/types";
import { md } from "./md";
import { achievements, ACHIEVEMENTS } from "../game/achievements";
import { touchInput, isTouchDevice } from "../touch";
import { generateCharPreviewDataURL } from "../game/chargen";
import { MarketplaceBrowser } from "./marketplace";
import type { MarketplaceAgent } from "../../../shared/marketplace";
import { getToken, getUserEmail, signOut, isAuthEnabled, onAuthChange } from "../auth";

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
  private feedCollapsed = false;
  private feedExpanded = false;
  private rosterCollapsed = false;
  private renderQueued = false;
  private perfVisible = false;

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
      <div class="hint">WASD/arrows move · E talk/board · H hire · F feed · B board · click an agent · ESC close</div>
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
          <button class="mobile-action-btn" id="ma-teleport" title="Teleport">Q</button>
        </div>
      </div>
    `;

    document.getElementById("hire-btn")!.addEventListener("click", () => this.openHireModal());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());

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
      }
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
    const models = SWARMS_MODELS;
    const model = models[Math.floor(Math.random() * models.length)];
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
    const randomModelIdx = Math.floor(Math.random() * SWARMS_MODELS.length);
    const modelOptions = () =>
      SWARMS_MODELS
        .map((m, i) => `<option value="${m.id}"${i === randomModelIdx ? ' selected' : ''}>${m.label}</option>`)
        .join("");

    const builder = new CharBuilder("h", randomAppearance(), () => {});

    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal hire-modal">
        <h2>HIRE AGENT</h2>
        <div class="hire-layout">
          <div class="hire-appearance">
            ${builder.html()}
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
              <textarea id="h-prompt" rows="4"
                placeholder="Standing instructions for this agent, e.g. 'You are a senior TypeScript reviewer. Always write tests first.'"></textarea>
            </label>
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
    modelSel.selectedIndex = randomModelIdx;
    document.getElementById("h-cancel")!.addEventListener("click", () => (modal.hidden = true));
    document.getElementById("h-ok")!.addEventListener("click", () => {
      const name = (document.getElementById("h-name") as HTMLInputElement).value.trim();
      if (!name) return;
      this.net.send({
        type: "hire",
        name,
        provider: "cline",
        model: modelSel.value,
        systemPrompt: (document.getElementById("h-prompt") as HTMLTextAreaElement).value,
        role: (document.getElementById("h-role") as HTMLSelectElement).value as AgentRole,
        appearance: builder.getAppearance(),
      });
      modal.hidden = true;
    });
  }

  private hireFromMarketplace(agent: MarketplaceAgent): void {
    const systemPrompt = [
      agent.description ? agent.description : "",
      agent.use_cases.length > 0 ? `\nUse cases:\n${agent.use_cases.map((u) => `- ${u}`).join("\n")}` : "",
      agent.requirements.length > 0 ? `\nRequirements:\n${agent.requirements.map((r) => `- ${r}`).join("\n")}` : "",
      agent.language ? `\nLanguage: ${agent.language}` : "",
    ].filter(Boolean).join("\n").slice(0, 4000);

    const models = SWARMS_MODELS;
    const model = models[Math.floor(Math.random() * models.length)];

    const delivery = {
      name: agent.name.slice(0, 24) || "Agent",
      systemPrompt,
      model: model.id,
      provider: "cline",
      appearance: randomAppearance(),
    };

    // Trigger the helicopter delivery animation. The hire WS message is
    // sent from the scene when the agent emerges from the elevator, so the
    // server creates the agent at the right moment and syncAgents() replaces
    // the cosmetic sprite with the real NPC.
    this.store.triggerHelicopter(delivery);
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

    modal.innerHTML = `
      <div class="modal wardrobe-modal">
        <h2>WARDROBE</h2>
        <p class="sub" style="margin-bottom:12px;">Change your look anytime.</p>
        <div class="wardrobe-layout">
          <div class="wardrobe-builder">
            ${builder.html()}
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
