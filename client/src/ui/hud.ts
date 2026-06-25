import type { Net } from "../net";
import type { FeedItem, Store } from "../store";
import type { AgentRole, CardStatus, LogEntry, OfficeTheme, Provider, TaskCard, CharAppearance } from "../../../shared/types";
import { SWARMS_MODELS, OFFICE_THEMES, YUKI_ID,
  SKIN_TONES, HAIR_STYLES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, ACCESSORIES,
  ACCENT_COLOR_OPTIONS, DEFAULT_APPEARANCE,
} from "../../../shared/types";
import { md } from "./md";
import { achievements, ACHIEVEMENTS } from "../game/achievements";
import { generateCharPreviewDataURL } from "../game/chargen";

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
  { key: "shirt",     label: "SHIRT",     options: SHIRT_COLORS,        max: SHIRT_COLORS.length },
  { key: "pants",     label: "PANTS",     options: PANTS_COLORS,        max: PANTS_COLORS.length },
  { key: "accessory", label: "ACCESSORY", options: ACCESSORIES,         max: ACCESSORIES.length },
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
      const isColor = part.key !== "hairStyle" && part.key !== "accessory";
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
    const isColor = part.key !== "hairStyle" && part.key !== "accessory";
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
        <button class="btn mini" id="settings-btn">⚙ SETTINGS</button>
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
          <button class="btn danger" id="d-fire">FIRE</button>
        </div>
      </div>
      <div class="modal-backdrop" id="hire-modal" hidden></div>
      <div class="modal-backdrop" id="settings-modal" hidden></div>
      <div class="modal-backdrop" id="onboard-modal" hidden></div>
      <div class="modal-backdrop" id="achievements-modal" hidden></div>
      <div class="modal-backdrop" id="hall-of-fame-modal" hidden></div>
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
    `;

    document.getElementById("hire-btn")!.addEventListener("click", () => this.openHireModal());
    document.getElementById("settings-btn")!.addEventListener("click", () => this.openSettings());
    this.bindDetail();
    this.bindFeed();
    this.bindBoard();
    this.bindHallOfFame();
    this.bindShortcuts();
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
      const agent = this.store.selected();
      if (agent && confirm(`Fire ${agent.name}? Their workspace folder stays on disk.`)) {
        this.net.send({ type: "fire", agentId: agent.id });
      }
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
      if (e.key === "Escape") {
        hire.hidden = true;
        settings.hidden = true;
        ach.hidden = true;
        hof.hidden = true;
        this.store.toggleAchievements(false);
        this.store.toggleHallOfFame(false);
        return;
      }
      // never steal keystrokes from a form field or while a modal is up
      const active = document.activeElement?.tagName;
      if (active === "INPUT" || active === "TEXTAREA" || active === "SELECT") return;
      if (!hire.hidden || !settings.hidden || !onboard.hidden || !ach.hidden || !hof.hidden) return;
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
    this.net.send({
      type: "hire",
      name,
      provider,
      model: models[0].id,
      systemPrompt: "",
      role: "worker",
    });
    this.toast(`${name} is on the way in (${models[0].label}).`);
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
        .map((m) => `<option value="${m.id}">${m.label}</option>`)
        .join("");

    const builder = new CharBuilder("h", DEFAULT_APPEARANCE, () => {});

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

  // ----------------------------------------------------------------- render

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
      .sort((a, b) => (a.name === "Yuki" ? -1 : b.name === "Yuki" ? 1 : 0))
      .map(
        (a) => `
        <div class="agent-row ${a.id === this.store.selectedId ? "selected" : ""}" data-id="${a.id}">
          <span class="dot ${a.status}"></span>
          <span class="name" style="color:${a.accent}">${esc(a.name)}${a.role === "manager" ? " 👔" : ""}</span>
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
      · ${agent.id === YUKI_ID ? "own office" : `desk ${agent.deskIndex + 1}`} · ${agent.tasksDone} done`;

    // Yuki can't be fired
    const fireBtn = document.getElementById("d-fire") as HTMLButtonElement | null;
    if (fireBtn) fireBtn.hidden = agent.id === YUKI_ID;

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
