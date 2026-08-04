import type { MarketplaceAgent } from "../../../shared/marketplace";
import type { MCPServerConfig } from "../../../shared/types";
import { getToken } from "../auth.js";

export interface MarketplaceResult {
  agents?: MarketplaceAgent[];
  count: number;
}

export interface CommunityMCPResult {
  name: string;
  description: string;
  source_code_url?: string;
  github_stars?: number;
  mcpConfig: MCPServerConfig;
}

const KNOWN_CATEGORIES = [
  "All",
  "Trading & Finance",
  "Development",
  "Data",
  "Productivity",
  "Communication",
  "Design",
  "Business",
  "AI & ML",
  "Lifestyle",
];

function normalizeCategory(cat: string): string {
  const c = cat.toLowerCase().trim();
  if (["trading", "finance", "payments", "banking", "crypto", "commerce", "defi", "wallet"].some((k) => c.includes(k))) return "Trading & Finance";
  if (["development", "git", "code", "infrastructure", "api", "debugging", "testing"].some((k) => c.includes(k))) return "Development";
  if (["data", "analytics", "database"].some((k) => c.includes(k))) return "Data";
  if (["productivity", "automation", "scheduling", "project-management", "project management"].some((k) => c.includes(k))) return "Productivity";
  if (["communication", "support", "crm", "email", "chat"].some((k) => c.includes(k))) return "Communication";
  if (["design", "ui", "ux", "browser", "media", "content", "writing", "cms"].some((k) => c.includes(k))) return "Design";
  if (["business", "sales", "marketing", "hr", "legal", "seo"].some((k) => c.includes(k))) return "Business";
  if (["ai", "ml", "machine learning", "reasoning", "memory", "search", "research", "documentation"].some((k) => c.includes(k))) return "AI & ML";
  if (["lifestyle", "travel", "transport", "health", "personal"].some((k) => c.includes(k))) return "Lifestyle";
  if (["devops", "cloud", "hosting", "monitoring"].some((k) => c.includes(k))) return "Development";
  if (["security", "utility"].some((k) => c.includes(k))) return "Development";
  return cat.trim();
}

export class MarketplaceBrowser {
  private panel: HTMLDivElement;
  private content: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private categoryChips: HTMLDivElement;
  private currentCategory = "All";
  private allAgents: MarketplaceAgent[] = [];
  private currentTab: "agents" | "community" | "premium" = "agents";
  onHireAgent: (agent: MarketplaceAgent) => void = () => {};
  onHireCommunityMCP: (name: string, mcpConfig: MCPServerConfig) => void = () => {};
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
      <div style="padding: 0.25rem 1rem; border-bottom: 1px solid #222; display:flex; gap:0.25rem;">
        <button id="mq-tab-agents" style="flex:1; padding:0.4rem; font-size:0.8rem; font-weight:600; border:none; border-radius:0.375rem 0.375rem 0 0; background:#2a2a2a; color:#e0e0e0; cursor:pointer;">Curated</button>
        <button id="mq-tab-premium" style="flex:1; padding:0.4rem; font-size:0.8rem; font-weight:600; border:none; border-radius:0.375rem 0.375rem 0 0; background:#1a1a1a; color:#888; cursor:pointer;">Premium</button>
        <button id="mq-tab-community" style="flex:1; padding:0.4rem; font-size:0.8rem; font-weight:600; border:none; border-radius:0.375rem 0.375rem 0 0; background:#1a1a1a; color:#888; cursor:pointer;">Community MCPs</button>
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

    // Tab switching
    const tabAgents = this.panel.querySelector("#mq-tab-agents") as HTMLButtonElement;
    const tabPremium = this.panel.querySelector("#mq-tab-premium") as HTMLButtonElement;
    const tabCommunity = this.panel.querySelector("#mq-tab-community") as HTMLButtonElement;
    tabAgents.addEventListener("click", () => this.switchTab("agents"));
    tabPremium.addEventListener("click", () => this.switchTab("premium"));
    tabCommunity.addEventListener("click", () => this.switchTab("community"));

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    this.searchInput.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (this.currentTab === "agents" || this.currentTab === "premium") void this.renderAgents();
        else void this.renderCommunity();
      }, 300);
    });
  }

  private switchTab(tab: "agents" | "community" | "premium"): void {
    this.currentTab = tab;
    const tabAgents = this.panel.querySelector("#mq-tab-agents") as HTMLButtonElement;
    const tabPremium = this.panel.querySelector("#mq-tab-premium") as HTMLButtonElement;
    const tabCommunity = this.panel.querySelector("#mq-tab-community") as HTMLButtonElement;
    const categoryChips = this.panel.querySelector("#mq-categories") as HTMLDivElement;

    // Reset all tabs to inactive
    const inactiveStyle = (btn: HTMLButtonElement) => { btn.style.background = "#1a1a1a"; btn.style.color = "#888"; };
    const activeStyle = (btn: HTMLButtonElement) => { btn.style.background = "#2a2a2a"; btn.style.color = "#e0e0e0"; };
    inactiveStyle(tabAgents); inactiveStyle(tabPremium); inactiveStyle(tabCommunity);

    if (tab === "agents") {
      activeStyle(tabAgents);
      this.searchInput.placeholder = "Search agents…";
      categoryChips.style.display = "flex";
      void this.load();
    } else if (tab === "premium") {
      activeStyle(tabPremium);
      this.searchInput.placeholder = "Search premium agents…";
      categoryChips.style.display = "flex";
      void this.loadPremium();
    } else {
      activeStyle(tabCommunity);
      this.searchInput.placeholder = "Search 22k+ community MCPs…";
      categoryChips.style.display = "none";
      void this.renderCommunity();
    }
  }

  show(): void {
    this.panel.style.display = "flex";
    if (this.currentTab === "agents") void this.load();
    else if (this.currentTab === "premium") void this.loadPremium();
    else void this.renderCommunity();
    if (!localStorage.getItem("agent-heights-market-seen")) {
      localStorage.setItem("agent-heights-market-seen", "1");
      this.showWelcomeBanner();
    }
  }

  hide(): void {
    this.panel.style.display = "none";
  }

  toggle(): void {
    if (this.panel.style.display === "flex") this.hide();
    else this.show();
  }

  private showWelcomeBanner(): void {
    const banner = document.createElement("div");
    banner.style.cssText = `
      padding: 0.75rem 1rem; border-bottom: 1px solid #333;
      background: linear-gradient(135deg, #1a2a1a, #0d1d0d);
      font-size: 0.8rem; color: #aaa; line-height: 1.5;
    `;
    banner.innerHTML = `
      <div style="font-weight:700; color:#53b86b; font-size:0.85rem; margin-bottom:0.3rem;">🛒 Welcome to the Marketplace</div>
      <div style="margin-bottom:0.4rem;"><strong>Agents</strong> — Browse curated, ready-to-hire AI agents. Click a card for details, then hit <strong>Hire into HQ</strong> to add them to your office.</div>
      <div style="margin-bottom:0.4rem;"><strong>Premium</strong> — Agents with paid data APIs (Reddit, crypto, stocks, etc.). Each call costs a few cents, billed to your subscription. No crypto wallet needed.</div>
      <div><strong>Community MCPs</strong> — Search 22,000+ MCP servers. Hiring one gives your agent those tools instantly.</div>
    `;
    const close = document.createElement("button");
    close.textContent = "×";
    close.style.cssText = "position:absolute;right:0.5rem;top:0.5rem;background:none;border:none;color:#666;font-size:1rem;cursor:pointer;";
    close.addEventListener("click", () => banner.remove());
    banner.style.position = "relative";
    banner.appendChild(close);

    const header = this.panel.querySelector("div");
    header?.after(banner);
    setTimeout(() => banner.remove(), 15000);
  }

  private async load(): Promise<void> {
    const search = this.searchInput.value.trim();
    const params = new URLSearchParams({ type: "agent", premium: "false" });
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

  private async loadPremium(): Promise<void> {
    const search = this.searchInput.value.trim();
    const params = new URLSearchParams({ type: "agent", premium: "true" });
    if (search) params.set("search", search);

    this.content.innerHTML = `
      <div style="text-align:center;color:#666;padding:2rem;">
        <div style="font-size:0.85rem; margin-bottom:0.5rem;">Loading premium agents…</div>
      </div>`;

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
      const isPremium = agent.is_premium;

      // Parse circleServices to show per-call price on the card
      let premiumPriceLabel = "";
      if (isPremium && agent.agent) {
        try {
          const cfg = JSON.parse(agent.agent);
          const services: { pricePerCall: number }[] = cfg.circleServices ?? [];
          if (services.length > 0) {
            const minPrice = Math.min(...services.map((s) => s.pricePerCall));
            const maxPrice = Math.max(...services.map((s) => s.pricePerCall));
            premiumPriceLabel = minPrice === maxPrice
              ? `$${minPrice.toFixed(2)}/call`
              : `$${minPrice.toFixed(2)}–$${maxPrice.toFixed(2)}/call`;
          }
        } catch { /* not JSON */ }
      }

      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
          ${agent.image_url ? `<img src="${agent.image_url}" style="width:40px;height:40px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" onerror="this.onerror=null;this.src='${this.letterAvatar(name, 40)}'" />` : `<img src="${this.letterAvatar(name, 40)}" style="width:40px;height:40px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" />`}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.15rem; display:flex; align-items:center; gap:0.3rem;">
              ${this.escape(name)}
              ${isPremium ? `<span style="font-size:0.6rem; padding:0.1rem 0.3rem; background:#2a1a3a; color:#b388ff; border-radius:0.25rem; font-weight:600;">PREMIUM</span>` : ""}
            </div>
            <div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(summary.slice(0, 80))}</div>
            <div style="display:flex; gap:0.25rem; margin-top:0.35rem; flex-wrap:wrap;">
              ${tags.map((t: string) => `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a1a1a; border-radius:0.25rem; color:#888;">${this.escape(t.trim())}</span>`).join("")}
              ${price ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a2a1a; border-radius:0.25rem; color:#53b86b;">${price}</span>` : ""}
              ${premiumPriceLabel ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#2a1a3a; border-radius:0.25rem; color:#b388ff;">${premiumPriceLabel}</span>` : ""}
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

    // Parse agent config to detect MCP servers that need auth + premium services
    let mcpServers: { url?: string; name?: string; authType?: "oauth" | "apikey"; keyLabel?: string; keyPlaceholder?: string; keyHelpUrl?: string; urlPlaceholder?: string; envVars?: { name: string; description: string; isRequired: boolean }[] }[] = [];
    let circleServices: { name: string; pricePerCall: number; description: string; tools: { name: string; description: string }[] }[] = [];
    try {
      const config = agent.agent ? JSON.parse(agent.agent) : {};
      if (config.mcpServers && Array.isArray(config.mcpServers)) {
        mcpServers = config.mcpServers;
      }
      if (config.circleServices && Array.isArray(config.circleServices)) {
        circleServices = config.circleServices;
      }
    } catch { /* not JSON */ }

    // Only show auth UI for servers that actually require it (oauth or apikey).
    // Servers without authType (open/no-auth) are ready to use immediately.
    const authRequiredServers = mcpServers.filter((s) => s.authType === "oauth" || s.authType === "apikey");

    const mcpKeyHtml = authRequiredServers.length > 0
      ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #333; border-radius:0.5rem; background:#1a1a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#c9852c; margin-bottom:0.5rem;">⚠ AUTHENTICATION REQUIRED</div>
          <div id="mq-mcp-warning" style="font-size:0.75rem; color:#e05d5d; margin-bottom:0.5rem;">Connect each service before hiring.</div>
          ${authRequiredServers.map((s, i) => {
            const isOAuth = s.authType === "oauth";
            const kLabel = s.keyLabel ?? "API Key";
            const kPlaceholder = s.keyPlaceholder ?? "Paste API key...";
            const kHelpHtml = s.keyHelpUrl
              ? `<a href="${s.keyHelpUrl}" target="_blank" style="font-size:0.65rem; color:#4f9dde; text-decoration:none; margin-left:0.4rem;">Get key →</a>`
              : "";
            const hasEnvVars = s.envVars && s.envVars.length > 0;
            const hasUrlInput = !!s.urlPlaceholder;
            const urlInputHtml = hasUrlInput
              ? `<div style="margin-bottom:0.35rem;">
                  <input id="mq-mcp-url-${i}" type="text" placeholder="${this.escape(s.urlPlaceholder ?? "")}" autocomplete="off"
                    style="width:100%; padding:0.4rem 0.6rem; border-radius:0.375rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.8rem; box-sizing:border-box;" />
                </div>`
              : "";
            const inputsHtml = hasEnvVars
              ? s.envVars!.map((ev, j) => `
                  <div style="margin-bottom:0.35rem;">
                    <div style="font-size:0.65rem; color:#666; margin-bottom:0.15rem;">${this.escape(ev.name)}${ev.isRequired ? ' <span style="color:#e05d5d;">*</span>' : ''} — ${this.escape(ev.description)}</div>
                    <input id="mq-mcp-env-${i}-${j}" type="password" placeholder="${this.escape(ev.name)}" autocomplete="off"
                      style="width:100%; padding:0.35rem 0.5rem; border-radius:0.375rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.78rem; box-sizing:border-box;" />
                  </div>`).join("")
                : `<input id="mq-mcp-key-${i}" type="password" placeholder="${this.escape(kPlaceholder)}" autocomplete="off"
                    style="flex:1; padding:0.4rem 0.6rem; border-radius:0.375rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.8rem;" />`;
            return `
            <div style="margin-bottom:0.5rem;">
              <div style="font-size:0.75rem; color:#888; margin-bottom:0.25rem;">${this.escape(s.name ?? s.url ?? "MCP Server")} ${isOAuth ? '<span style="color:#4f9dde;font-size:0.65rem;">OAuth</span>' : `<span style="color:#666;font-size:0.65rem;">${this.escape(kLabel)}</span>${kHelpHtml}`}</div>
              ${isOAuth
                ? `<div style="display:flex; gap:0.25rem; align-items:center;">
                    <button id="mq-mcp-connect-${i}" style="flex:1; padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#2a4a6a; color:#e0e0e0; font-size:0.8rem; cursor:pointer;">🔗 Connect via OAuth</button>
                    <span id="mq-mcp-status-${i}" style="font-size:0.7rem; color:#888; min-width:1.5rem;"></span>
                  </div>`
                : hasEnvVars
                  ? `${inputsHtml}
                    <div style="display:flex; gap:0.25rem; align-items:center; margin-top:0.35rem;">
                      <button id="mq-mcp-save-${i}" style="padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#333; color:#e0e0e0; font-size:0.75rem; cursor:pointer;">Save Credentials</button>
                      <span id="mq-mcp-status-${i}" style="font-size:0.7rem; color:#888; min-width:1.5rem;"></span>
                    </div>`
                  : `${urlInputHtml}
                    <div style="display:flex; gap:0.25rem; align-items:center;">
                      ${inputsHtml}
                      <button id="mq-mcp-save-${i}" style="padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#333; color:#e0e0e0; font-size:0.75rem; cursor:pointer;">Save</button>
                      <span id="mq-mcp-status-${i}" style="font-size:0.7rem; color:#888; min-width:1.5rem;"></span>
                    </div>`
              }
            </div>`;
          }).join("")}
        </div>`
      : "";

    modal.innerHTML = `
      <div style="background:#111; border:1px solid #222; border-radius:0.75rem; max-width:520px; max-height:85vh; width:90vw; overflow-y:auto; padding:1.5rem; color:#e0e0e0; font-family:'M PLUS Rounded 1c',system-ui,sans-serif;">
        <div style="display:flex; align-items:flex-start; gap:0.75rem; margin-bottom:1rem;">
          ${agent.image_url ? `<img src="${agent.image_url}" style="width:56px;height:56px;border-radius:0.5rem;object-fit:cover;" onerror="this.onerror=null;this.src='${this.letterAvatar(agent.name, 56)}'" />` : `<img src="${this.letterAvatar(agent.name, 56)}" style="width:56px;height:56px;border-radius:0.5rem;object-fit:cover;" />`}
          <div style="flex:1;">
            <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 0.25rem;">${this.escape(agent.name)}</h3>
            <div style="font-size:0.8rem; color:#888;">${this.escape(agent.summary)}</div>
            <div style="margin-top:0.35rem;">
              <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; ${agent.is_free ? "background:#1a2a1a; color:#53b86b;" : "background:#2a2a1a; color:#c9852c;"}">${agent.is_free ? "Free" : agent.price_usd ? `$${agent.price_usd}` : "Paid"}</span>
              ${agent.is_premium ? `<span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; background:#2a1a3a; color:#b388ff; margin-left:0.25rem;">Premium</span>` : ""}
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
        ${agent.is_premium && circleServices.length > 0 ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #2a1a3a; border-radius:0.5rem; background:#1a1525;">
          <div style="font-size:0.75rem; font-weight:600; color:#b388ff; margin-bottom:0.4rem;">⚡ PREMIUM AGENT — Paid API Services</div>
          <div style="font-size:0.72rem; color:#aaa; line-height:1.4; margin-bottom:0.5rem;">This agent can call paid data APIs (StableSocial, CoinGecko, etc.). Each call costs a small amount, billed to your subscription — no crypto wallet needed.</div>
          <div style="font-size:0.7rem; font-weight:600; color:#888; margin-bottom:0.25rem;">SERVICES & PRICING</div>
          <div style="display:flex; flex-direction:column; gap:0.35rem;">
            ${circleServices.map((s) => {
              const toolNames = s.tools.map((t) => t.name).join(", ");
              return `<div style="padding:0.4rem 0.5rem; border:1px solid #2a1a3a; border-radius:0.375rem; background:#120d1a;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:0.75rem; font-weight:600; color:#ccc;">${this.escape(s.name)}</span>
                  <span style="font-size:0.7rem; font-weight:600; color:#b388ff;">$${s.pricePerCall.toFixed(2)}/call</span>
                </div>
                <div style="font-size:0.68rem; color:#777; margin-top:0.15rem;">${this.escape(s.description.slice(0, 100))}</div>
                ${toolNames ? `<div style="font-size:0.62rem; color:#555; margin-top:0.2rem;">Tools: ${this.escape(toolNames)}</div>` : ""}
              </div>`;
            }).join("")}
          </div>
          <div style="font-size:0.68rem; color:#666; margin-top:0.5rem; line-height:1.4;">
            <strong style="color:#888;">Your premium allowance:</strong> Starter $0.50/mo · Pro $3.00/mo · Business $12.00/mo (separate from your AI inference budget).
          </div>
        </div>` : agent.is_premium ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #2a1a3a; border-radius:0.5rem; background:#1a1525;">
          <div style="font-size:0.75rem; font-weight:600; color:#b388ff; margin-bottom:0.3rem;">⚡ Premium Agent</div>
          <div style="font-size:0.75rem; color:#aaa; line-height:1.4;">This agent uses paid API services. Costs are billed through your subscription — no crypto wallet needed. Your monthly premium allowance applies (Starter $0.50 · Pro $3.00 · Business $12.00).</div>
        </div>` : ""}
        <div style="display:flex; gap:0.5rem;">
          <button id="mq-hire" style="flex:1; padding:0.6rem; border:none; border-radius:0.5rem; background:#e0e0e0; color:#0d0d0d; font-size:0.9rem; font-weight:600; cursor:pointer;"${authRequiredServers.length > 0 ? " disabled" : ""}>Hire into HQ</button>
          <button id="mq-cancel" style="padding:0.6rem 1rem; border:1px solid #222; border-radius:0.5rem; background:#1a1a1a; color:#888; font-size:0.9rem; cursor:pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#mq-cancel")!.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    // Track which MCP servers have keys saved
    // Use url for remote servers, name for stdio servers (no url)
    const mcpKeyState: Record<string, boolean> = {};
    const serverKeys = authRequiredServers.map((s) => s.url ?? s.name).filter((k): k is string => !!k);

    const updateHireButton = () => {
      const hireBtn = modal.querySelector("#mq-hire") as HTMLButtonElement | null;
      const warning = modal.querySelector("#mq-mcp-warning") as HTMLDivElement | null;
      if (!hireBtn) return;
      const allHaveKeys = serverKeys.every((k) => mcpKeyState[k]);
      hireBtn.disabled = !allHaveKeys;
      hireBtn.style.opacity = allHaveKeys ? "1" : "0.4";
      hireBtn.style.cursor = allHaveKeys ? "pointer" : "not-allowed";
      if (warning) {
        warning.style.display = allHaveKeys ? "none" : "block";
        if (!allHaveKeys) {
          const missing = serverKeys.filter((k) => !mcpKeyState[k]).length;
          warning.textContent = `${missing} service(s) still need authentication before you can hire.`;
        }
      }
    };

    // Ask server which MCP servers already have keys
    if (serverKeys.length > 0) {
      this.onCheckMcpKeys(serverKeys);
    }

    // Wire up MCP key save buttons (API key auth)
    authRequiredServers.forEach((s, i) => {
      const saveBtn = modal.querySelector(`#mq-mcp-save-${i}`) as HTMLButtonElement | null;
      const keyId = s.url ?? s.name;
      if (saveBtn && keyId) {
        saveBtn.addEventListener("click", () => {
          const hasEnvVars = s.envVars && s.envVars.length > 0;
          if (hasEnvVars) {
            // Collect multiple env var inputs into a JSON blob
            const envBlob: Record<string, string> = {};
            let allFilled = true;
            s.envVars!.forEach((ev, j) => {
              const input = modal.querySelector(`#mq-mcp-env-${i}-${j}`) as HTMLInputElement | null;
              if (input) {
                const val = input.value.trim();
                if (ev.isRequired && !val) allFilled = false;
                if (val) envBlob[ev.name] = val;
              }
            });
            if (!allFilled) { saveBtn.focus(); return; }
            this.onSetMcpKey(keyId, JSON.stringify(envBlob));
            s.envVars!.forEach((_, j) => {
              const input = modal.querySelector(`#mq-mcp-env-${i}-${j}`) as HTMLInputElement | null;
              if (input) input.value = "";
            });
          } else {
            // Single key input (possibly with a URL input for per-instance servers like n8n)
            const hasUrlInput = !!s.urlPlaceholder;
            if (hasUrlInput) {
              const urlInput = modal.querySelector(`#mq-mcp-url-${i}`) as HTMLInputElement | null;
              const keyInput = modal.querySelector(`#mq-mcp-key-${i}`) as HTMLInputElement | null;
              if (!urlInput || !keyInput) return;
              const url = urlInput.value.trim();
              const key = keyInput.value.trim();
              if (!url || !key) { (!url ? urlInput : keyInput).focus(); return; }
              this.onSetMcpKey(keyId, JSON.stringify({ url, token: key }));
              urlInput.value = "";
              keyInput.value = "";
            } else {
              const input = modal.querySelector(`#mq-mcp-key-${i}`) as HTMLInputElement | null;
              if (!input) return;
              const key = input.value.trim();
              if (!key) { input.focus(); return; }
              this.onSetMcpKey(keyId, key);
              input.value = "";
            }
          }
          saveBtn.textContent = "✓ Saved";
          setTimeout(() => { saveBtn.textContent = hasEnvVars ? "Save Credentials" : "Save"; }, 2000);
          mcpKeyState[keyId] = true;
          const statusEl = modal.querySelector(`#mq-mcp-status-${i}`) as HTMLSpanElement | null;
          if (statusEl) { statusEl.textContent = "✓"; statusEl.style.color = "#53b86b"; }
          updateHireButton();
        });
      }
    });

    // Wire up OAuth connect buttons (only for remote servers with URL)
    authRequiredServers.forEach((s, i) => {
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
        const idx = serverKeys.indexOf(r.serverUrl);
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
      const btn = modal.querySelector("#mq-hire") as HTMLButtonElement;
      btn.textContent = "Hired! 🚁";
      btn.style.background = "#53b86b";
      btn.style.color = "#fff";
      btn.disabled = true;
      setTimeout(() => modal.remove(), 1500);
    });
  }

  private async renderCommunity(): Promise<void> {
    const search = this.searchInput.value.trim();

    if (!search) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">
        <div style="font-size:0.9rem; margin-bottom:0.5rem;">🔍 Search 22,000+ community MCP servers</div>
        <div style="font-size:0.75rem; color:#888;">Type a keyword like "hyperliquid", "trading", "database"…</div>
      </div>`;
      return;
    }

    this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Searching PulseMCP for "${this.escape(search)}"…</div>`;

    try {
      const token = getToken();
      if (!token) {
        this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Sign in to search community MCP servers.</div>`;
        return;
      }
      const res = await fetch(`/api/pulsemcp-search?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { results: CommunityMCPResult[]; count: number } = await res.json();

      if (!data.results || data.results.length === 0) {
        this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">No community MCPs found for "${this.escape(search)}".</div>`;
        return;
      }

      this.content.innerHTML = "";
      for (const mcp of data.results) {
        const card = document.createElement("div");
        card.style.cssText = `
          padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid #1a1a1a;
          border-radius: 0.5rem; background: #0d0d0d;
          transition: border-color 0.15s;
        `;
        card.addEventListener("mouseenter", () => { card.style.borderColor = "#333"; });
        card.addEventListener("mouseleave", () => { card.style.borderColor = "#1a1a1a"; });

        const stars = mcp.github_stars ? ` (${mcp.github_stars}★)` : "";
        const sourceLink = mcp.source_code_url
          ? `<a href="${mcp.source_code_url}" target="_blank" style="font-size:0.65rem; color:#4f9dde; text-decoration:none;">source →</a>`
          : "";
        const transport = mcp.mcpConfig.url
          ? `<span style="font-size:0.6rem; padding:0.1rem 0.3rem; background:#1a2a1a; border-radius:0.25rem; color:#53b86b;">remote</span>`
          : mcp.mcpConfig.command
            ? `<span style="font-size:0.6rem; padding:0.1rem 0.3rem; background:#1a1a2a; border-radius:0.25rem; color:#6b8acf;">stdio</span>`
            : mcp.mcpConfig.sourceUrl
              ? `<span style="font-size:0.6rem; padding:0.1rem 0.3rem; background:#2a1a1a; border-radius:0.25rem; color:#cf9b6b;">self-setup</span>`
              : "";

        const hasInstall = !!(mcp.mcpConfig.url || mcp.mcpConfig.command);
        const hasSourceUrl = !!mcp.mcpConfig.sourceUrl;
        const canHire = hasInstall || hasSourceUrl;
        const needsSetup = hasSourceUrl && !hasInstall;

        card.innerHTML = `
          <div style="display:flex; align-items:flex-start; gap:0.5rem;">
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.15rem;">${this.escape(mcp.name)}${stars}</div>
              <div style="font-size:0.75rem; color:#888; margin-bottom:0.35rem;">${this.escape(mcp.description.slice(0, 100))}</div>
              <div style="display:flex; gap:0.25rem; align-items:center; flex-wrap:wrap;">
                ${transport}
                ${sourceLink}
              </div>
            </div>
          </div>
          <button style="margin-top:0.5rem; width:100%; padding:0.4rem; border:none; border-radius:0.375rem; background:${canHire ? (needsSetup ? "#1a2a1a" : "#e0e0e0") : "#333"}; color:${canHire ? (needsSetup ? "#53b86b" : "#0d0d0d") : "#666"}; font-size:0.8rem; font-weight:600; cursor:${canHire ? "pointer" : "not-allowed"};" ${canHire ? "" : "disabled"}>
            ${canHire ? (needsSetup ? "� Hire & Setup" : "�� Hire into HQ") : "No source available"}
          </button>
        `;

        if (canHire) {
          const hireBtn = card.querySelector("button")!;
          hireBtn.addEventListener("click", () => {
            this.onHireCommunityMCP(mcp.name, mcp.mcpConfig);
            hireBtn.textContent = "Hired! 🚁";
            hireBtn.style.background = "#53b86b";
            hireBtn.style.color = "#fff";
            hireBtn.disabled = true;
          });
        }

        this.content.appendChild(card);
      }
    } catch {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Unable to search PulseMCP. Please try again later.</div>`;
    }
  }

  private escape(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  private letterAvatar(name: string, size: number): string {
    const letter = (name || "?").charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="6" fill="#2a2a2a"/><text x="${size / 2}" y="${Math.round(size * 0.67)}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(size * 0.45)}" font-weight="bold" fill="#e0e0e0">${letter}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
}
