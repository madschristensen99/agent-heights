import type { MarketplaceAgent } from "../../../shared/marketplace";

export interface MarketplaceResult {
  agents?: MarketplaceAgent[];
  count: number;
}

const KNOWN_CATEGORIES = [
  "All",
  "Trading & Finance",
  "Development",
  "Research & Analysis",
  "Content & Writing",
  "DevOps",
  "Data",
];

function normalizeCategory(cat: string): string {
  const c = cat.toLowerCase().trim();
  if (["trading", "finance", "payments", "banking"].some((k) => c.includes(k))) return "Trading & Finance";
  if (["development", "git", "code", "devops", "infrastructure", "api"].some((k) => c.includes(k))) return "Development";
  if (["research", "analysis"].some((k) => c.includes(k))) return "Research & Analysis";
  if (["content", "writing", "marketing"].some((k) => c.includes(k))) return "Content & Writing";
  if (["data", "analytics", "database"].some((k) => c.includes(k))) return "Data";
  return cat.trim();
}

export class MarketplaceBrowser {
  private panel: HTMLDivElement;
  private content: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private categoryChips: HTMLDivElement;
  private currentCategory = "All";
  private allAgents: MarketplaceAgent[] = [];
  onHireAgent: (agent: MarketplaceAgent) => void = () => {};
  onSetMcpKey: (serverUrl: string, apiKey: string) => void = () => {};
  onCheckMcpKeys: (serverUrls: string[]) => void = () => {};
  onStartMcpOAuth: (serverUrl: string) => void = () => {};
  onMcpKeysStatusHandler: ((results: { serverUrl: string; hasKey: boolean }[]) => void) | null = null;

  constructor() {
    this.panel = document.createElement("div");
    this.panel.id = "marketplace-panel";
    this.panel.style.cssText = `
      position: fixed; top: 0; right: 0; bottom: 0;
      width: 420px; max-width: 100vw; z-index: 8000;
      background: #111; border-left: 1px solid #222;
      display: none; flex-direction: column;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
      color: #e0e0e0;
    `;

    this.panel.innerHTML = `
      <div style="padding: 0.75rem 1rem; border-bottom: 1px solid #222; display: flex; align-items: center; gap: 0.5rem;">
        <h2 style="font-size: 1rem; font-weight: 700; margin: 0; flex: 1;">Marketplace</h2>
        <button id="mq-close" style="background:none;border:none;color:#666;font-size:1.2rem;cursor:pointer;">×</button>
      </div>
      <div style="padding: 0.5rem 1rem; border-bottom: 1px solid #222;">
        <div id="mq-categories" style="display:flex; gap:0.25rem; margin-bottom:0.5rem; flex-wrap:wrap;"></div>
        <input id="mq-search" type="text" placeholder="Search agents…" style="width:100%;padding:0.5rem 0.75rem;border-radius:0.375rem;border:1px solid #222;background:#1a1a1a;color:#e0e0e0;font-size:0.85rem;outline:none;" />
      </div>
      <div id="mq-content" style="flex:1; overflow-y:auto; padding: 0.5rem;"></div>
    `;

    document.body.appendChild(this.panel);

    this.content = this.panel.querySelector("#mq-content") as HTMLDivElement;
    this.searchInput = this.panel.querySelector("#mq-search") as HTMLInputElement;
    this.categoryChips = this.panel.querySelector("#mq-categories") as HTMLDivElement;

    this.panel.querySelector("#mq-close")!.addEventListener("click", () => this.hide());

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    this.searchInput.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void this.renderAgents(), 300);
    });
  }

  show(): void {
    this.panel.style.display = "flex";
    void this.load();
  }

  hide(): void {
    this.panel.style.display = "none";
  }

  toggle(): void {
    if (this.panel.style.display === "flex") this.hide();
    else this.show();
  }

  private async load(): Promise<void> {
    const search = this.searchInput.value.trim();
    const params = new URLSearchParams({ type: "agent" });
    if (search) params.set("search", search);

    this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Loading…</div>`;

    try {
      const res = await fetch(`/api/marketplace?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MarketplaceResult = await res.json();
      this.allAgents = data.agents ?? [];
      this.renderCategoryChips();
      this.renderAgents();
    } catch {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Unable to reach the marketplace. Please try again later.</div>`;
    }
  }

  private renderCategoryChips(): void {
    const found = new Set<string>();
    for (const a of this.allAgents) {
      for (const c of a.category ?? []) {
        found.add(normalizeCategory(c));
      }
    }
    const cats = ["All", ...KNOWN_CATEGORIES.filter((c) => c !== "All" && found.has(c))];
    // Add any categories from agents that didn't match known ones
    for (const c of found) {
      if (!cats.includes(c)) cats.push(c);
    }

    this.categoryChips.innerHTML = "";
    for (const cat of cats) {
      const chip = document.createElement("button");
      chip.textContent = cat;
      chip.style.cssText = `
        padding: 0.25rem 0.6rem; font-size: 0.72rem; border: 1px solid #222;
        background: ${cat === this.currentCategory ? "#2a2a2a" : "#1a1a1a"};
        color: ${cat === this.currentCategory ? "#e0e0e0" : "#888"};
        border-radius: 0.375rem; cursor: pointer; white-space: nowrap;
      `;
      chip.addEventListener("click", () => {
        this.currentCategory = cat;
        this.renderCategoryChips();
        this.renderAgents();
      });
      this.categoryChips.appendChild(chip);
    }
  }

  private renderAgents(): void {
    const search = this.searchInput.value.trim().toLowerCase();
    let agents = this.allAgents;

    if (this.currentCategory !== "All") {
      agents = agents.filter((a) =>
        (a.category ?? []).some((c) => normalizeCategory(c) === this.currentCategory)
      );
    }

    if (search) {
      agents = agents.filter((a) =>
        a.name.toLowerCase().includes(search) ||
        a.summary.toLowerCase().includes(search) ||
        a.tags.toLowerCase().includes(search)
      );
    }

    if (agents.length === 0) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">No agents found.</div>`;
      return;
    }

    this.content.innerHTML = "";
    for (const agent of agents) {
      const card = document.createElement("div");
      card.style.cssText = `
        padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid #1a1a1a;
        border-radius: 0.5rem; background: #0d0d0d; cursor: pointer;
        transition: border-color 0.15s;
      `;
      card.addEventListener("mouseenter", () => { card.style.borderColor = "#333"; });
      card.addEventListener("mouseleave", () => { card.style.borderColor = "#1a1a1a"; });

      const name = agent.name || "Untitled";
      const summary = agent.summary || "";
      const tags = (agent.tags || "").split(",").filter(Boolean).slice(0, 4);
      const price = agent.is_free ? "Free" : agent.price_usd ? `$${agent.price_usd}` : "";

      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
          ${agent.image_url ? `<img src="${agent.image_url}" style="width:40px;height:40px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" />` : ""}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.15rem;">${this.escape(name)}</div>
            <div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(summary.slice(0, 80))}</div>
            <div style="display:flex; gap:0.25rem; margin-top:0.35rem; flex-wrap:wrap;">
              ${tags.map((t: string) => `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a1a1a; border-radius:0.25rem; color:#888;">${this.escape(t.trim())}</span>`).join("")}
              ${price ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a2a1a; border-radius:0.25rem; color:#53b86b;">${price}</span>` : ""}
            </div>
          </div>
        </div>
      `;

      card.addEventListener("click", () => this.showAgentDetail(agent));
      this.content.appendChild(card);
    }
  }

  private showAgentDetail(agent: MarketplaceAgent): void {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 9000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7);
    `;

    const useCases = agent.use_cases.length > 0
      ? agent.use_cases.map((u: string) => `• ${u}`).join("\n")
      : "No use cases listed.";

    const requirements = agent.requirements.length > 0
      ? agent.requirements.map((r: string) => `• ${r}`).join("\n")
      : "None";

    // Parse agent config to detect MCP servers that need auth
    let mcpServers: { url?: string; name?: string; authType?: "oauth" | "apikey"; keyLabel?: string; keyPlaceholder?: string; keyHelpUrl?: string }[] = [];
    try {
      const config = agent.agent ? JSON.parse(agent.agent) : {};
      if (config.mcpServers && Array.isArray(config.mcpServers)) {
        mcpServers = config.mcpServers;
      }
    } catch { /* not JSON */ }

    const mcpKeyHtml = mcpServers.length > 0
      ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #333; border-radius:0.5rem; background:#1a1a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#c9852c; margin-bottom:0.5rem;">⚠ AUTHENTICATION REQUIRED</div>
          <div id="mq-mcp-warning" style="font-size:0.75rem; color:#e05d5d; margin-bottom:0.5rem;">Connect each service before hiring.</div>
          ${mcpServers.map((s, i) => {
            const isOAuth = s.authType === "oauth";
            const kLabel = s.keyLabel ?? "API Key";
            const kPlaceholder = s.keyPlaceholder ?? "Paste API key...";
            const kHelpHtml = s.keyHelpUrl
              ? `<a href="${s.keyHelpUrl}" target="_blank" style="font-size:0.65rem; color:#4f9dde; text-decoration:none; margin-left:0.4rem;">Get key →</a>`
              : "";
            return `
            <div style="margin-bottom:0.5rem;">
              <div style="font-size:0.75rem; color:#888; margin-bottom:0.25rem;">${this.escape(s.name ?? s.url ?? "MCP Server")} ${isOAuth ? '<span style="color:#4f9dde;font-size:0.65rem;">OAuth</span>' : `<span style="color:#666;font-size:0.65rem;">${this.escape(kLabel)}</span>${kHelpHtml}`}</div>
              <div style="display:flex; gap:0.25rem; align-items:center;">
                ${isOAuth
                  ? `<button id="mq-mcp-connect-${i}" style="flex:1; padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#2a4a6a; color:#e0e0e0; font-size:0.8rem; cursor:pointer;">🔗 Connect via OAuth</button>`
                  : `<input id="mq-mcp-key-${i}" type="password" placeholder="${this.escape(kPlaceholder)}" autocomplete="off"
                      style="flex:1; padding:0.4rem 0.6rem; border-radius:0.375rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.8rem;" />
                    <button id="mq-mcp-save-${i}" style="padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#333; color:#e0e0e0; font-size:0.75rem; cursor:pointer;">Save</button>`
                }
                <span id="mq-mcp-status-${i}" style="font-size:0.7rem; color:#888; min-width:1.5rem;"></span>
              </div>
            </div>`;
          }).join("")}
        </div>`
      : "";

    modal.innerHTML = `
      <div style="background:#111; border:1px solid #222; border-radius:0.75rem; max-width:520px; max-height:85vh; width:90vw; overflow-y:auto; padding:1.5rem; color:#e0e0e0; font-family:'M PLUS Rounded 1c',system-ui,sans-serif;">
        <div style="display:flex; align-items:flex-start; gap:0.75rem; margin-bottom:1rem;">
          ${agent.image_url ? `<img src="${agent.image_url}" style="width:56px;height:56px;border-radius:0.5rem;object-fit:cover;" />` : ""}
          <div style="flex:1;">
            <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 0.25rem;">${this.escape(agent.name)}</h3>
            <div style="font-size:0.8rem; color:#888;">${this.escape(agent.summary)}</div>
            <div style="margin-top:0.35rem;">
              <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; ${agent.is_free ? "background:#1a2a1a; color:#53b86b;" : "background:#2a2a1a; color:#c9852c;"}">${agent.is_free ? "Free" : agent.price_usd ? `$${agent.price_usd}` : "Paid"}</span>
              ${agent.language ? `<span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; background:#1a1a2a; color:#6b8acf; margin-left:0.25rem;">${this.escape(agent.language)}</span>` : ""}
            </div>
          </div>
        </div>
        <div style="font-size:0.85rem; color:#aaa; margin-bottom:1rem; white-space:pre-wrap;">${this.escape(agent.description)}</div>
        <div style="margin-bottom:0.75rem;">
          <div style="font-size:0.75rem; font-weight:600; color:#666; margin-bottom:0.25rem;">USE CASES</div>
          <div style="font-size:0.8rem; color:#aaa; white-space:pre-wrap;">${this.escape(useCases)}</div>
        </div>
        <div style="margin-bottom:1rem;">
          <div style="font-size:0.75rem; font-weight:600; color:#666; margin-bottom:0.25rem;">REQUIREMENTS</div>
          <div style="font-size:0.8rem; color:#aaa; white-space:pre-wrap;">${this.escape(requirements)}</div>
        </div>
        ${mcpKeyHtml}
        <div style="display:flex; gap:0.5rem;">
          <button id="mq-hire" style="flex:1; padding:0.6rem; border:none; border-radius:0.5rem; background:#e0e0e0; color:#0d0d0d; font-size:0.9rem; font-weight:600; cursor:pointer;"${mcpServers.length > 0 ? " disabled" : ""}>Hire into HQ</button>
          <button id="mq-cancel" style="padding:0.6rem 1rem; border:1px solid #222; border-radius:0.5rem; background:#1a1a1a; color:#888; font-size:0.9rem; cursor:pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#mq-cancel")!.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    // Track which MCP servers have keys saved
    const mcpKeyState: Record<string, boolean> = {};
    const serverUrls = mcpServers.map((s) => s.url).filter((u): u is string => !!u);

    const updateHireButton = () => {
      const hireBtn = modal.querySelector("#mq-hire") as HTMLButtonElement | null;
      const warning = modal.querySelector("#mq-mcp-warning") as HTMLDivElement | null;
      if (!hireBtn) return;
      const allHaveKeys = serverUrls.every((u) => mcpKeyState[u]);
      hireBtn.disabled = !allHaveKeys;
      hireBtn.style.opacity = allHaveKeys ? "1" : "0.4";
      hireBtn.style.cursor = allHaveKeys ? "pointer" : "not-allowed";
      if (warning) {
        warning.style.display = allHaveKeys ? "none" : "block";
        if (!allHaveKeys) {
          const missing = serverUrls.filter((u) => !mcpKeyState[u]).length;
          warning.textContent = `${missing} service(s) still need authentication before you can hire.`;
        }
      }
    };

    // Ask server which MCP servers already have keys
    if (serverUrls.length > 0) {
      this.onCheckMcpKeys(serverUrls);
    }

    // Wire up MCP key save buttons (API key auth)
    mcpServers.forEach((s, i) => {
      const saveBtn = modal.querySelector(`#mq-mcp-save-${i}`) as HTMLButtonElement | null;
      if (saveBtn && s.url) {
        saveBtn.addEventListener("click", () => {
          const input = modal.querySelector(`#mq-mcp-key-${i}`) as HTMLInputElement | null;
          if (!input) return;
          const key = input.value.trim();
          if (!key) { input.focus(); return; }
          this.onSetMcpKey(s.url!, key);
          input.value = "";
          saveBtn.textContent = "✓ Saved";
          setTimeout(() => { saveBtn.textContent = "Save"; }, 2000);
          mcpKeyState[s.url!] = true;
          const statusEl = modal.querySelector(`#mq-mcp-status-${i}`) as HTMLSpanElement | null;
          if (statusEl) { statusEl.textContent = "✓"; statusEl.style.color = "#53b86b"; }
          updateHireButton();
        });
      }
    });

    // Wire up OAuth connect buttons
    mcpServers.forEach((s, i) => {
      const connectBtn = modal.querySelector(`#mq-mcp-connect-${i}`) as HTMLButtonElement | null;
      if (connectBtn && s.url) {
        connectBtn.addEventListener("click", () => {
          this.onStartMcpOAuth(s.url!);
          connectBtn.textContent = "Opening login...";
          connectBtn.disabled = true;
          setTimeout(() => { connectBtn.textContent = "🔗 Connect via OAuth"; connectBtn.disabled = false; }, 5000);
        });
      }
    });

    // Listen for server response about existing keys
    const origCallback = this.onMcpKeysStatusHandler;
    this.onMcpKeysStatusHandler = (results: { serverUrl: string; hasKey: boolean }[]) => {
      for (const r of results) {
        mcpKeyState[r.serverUrl] = r.hasKey;
        const idx = serverUrls.indexOf(r.serverUrl);
        if (idx >= 0) {
          const statusEl = modal.querySelector(`#mq-mcp-status-${idx}`) as HTMLSpanElement | null;
          if (statusEl) {
            statusEl.textContent = r.hasKey ? "✓" : "✗";
            statusEl.style.color = r.hasKey ? "#53b86b" : "#e05d5d";
          }
        }
      }
      updateHireButton();
    };

    modal.addEventListener("remove", () => {
      this.onMcpKeysStatusHandler = origCallback;
    });

    updateHireButton();

    modal.querySelector("#mq-hire")!.addEventListener("click", () => {
      this.onHireAgent(agent);
      modal.remove();
    });
  }

  private escape(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
}
