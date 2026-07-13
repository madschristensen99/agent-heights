import type { MarketplaceAgent, MarketplacePrompt, MarketplaceTool, MarketplaceItemType } from "../../../shared/marketplace";
import type { MCPCatalogServer } from "../../../shared/mcp-catalog";

export interface MarketplaceResult {
  agents?: MarketplaceAgent[];
  prompts?: MarketplacePrompt[];
  tools?: MarketplaceTool[];
  count: number;
}

export interface CatalogResult {
  servers: MCPCatalogServer[];
  count: number;
  categories: string[];
}

export class MarketplaceBrowser {
  private panel: HTMLDivElement;
  private content: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private tabButtons: HTMLButtonElement[] = [];
  private currentTab: MarketplaceItemType = "agent";
  private items: MarketplaceAgent[] | MarketplacePrompt[] | MarketplaceTool[] = [];
  onHireAgent: (agent: MarketplaceAgent) => void = () => {};
  onSetMcpKey: (serverUrl: string, apiKey: string) => void = () => {};
  onCheckMcpKeys: (serverUrls: string[]) => void = () => {};
  onStartMcpOAuth: (serverUrl: string) => void = () => {};
  onInstallServer: (server: MCPCatalogServer) => void = () => {};
  /** Internal handler set by showAgentDetail to receive key status from store. */
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
        <div style="display:flex; gap:0.25rem; margin-bottom:0.5rem;">
          <button class="mq-tab" data-tab="agent" style="flex:1;padding:0.4rem;font-size:0.8rem;border:1px solid #222;background:#1a1a1a;color:#e0e0e0;border-radius:0.375rem;cursor:pointer;">Agents</button>
          <button class="mq-tab" data-tab="server" style="flex:1;padding:0.4rem;font-size:0.8rem;border:1px solid #222;background:#1a1a1a;color:#888;border-radius:0.375rem;cursor:pointer;">Servers</button>
          <button class="mq-tab" data-tab="prompt" style="flex:1;padding:0.4rem;font-size:0.8rem;border:1px solid #222;background:#1a1a1a;color:#888;border-radius:0.375rem;cursor:pointer;">Prompts</button>
          <button class="mq-tab" data-tab="tool" style="flex:1;padding:0.4rem;font-size:0.8rem;border:1px solid #222;background:#1a1a1a;color:#888;border-radius:0.375rem;cursor:pointer;">Tools</button>
        </div>
        <input id="mq-search" type="text" placeholder="Search…" style="width:100%;padding:0.5rem 0.75rem;border-radius:0.375rem;border:1px solid #222;background:#1a1a1a;color:#e0e0e0;font-size:0.85rem;outline:none;" />
      </div>
      <div id="mq-content" style="flex:1; overflow-y:auto; padding: 0.5rem;"></div>
    `;

    document.body.appendChild(this.panel);

    this.content = this.panel.querySelector("#mq-content") as HTMLDivElement;
    this.searchInput = this.panel.querySelector("#mq-search") as HTMLInputElement;
    this.tabButtons = [...this.panel.querySelectorAll(".mq-tab")] as HTMLButtonElement[];

    this.panel.querySelector("#mq-close")!.addEventListener("click", () => this.hide());

    for (const btn of this.tabButtons) {
      btn.addEventListener("click", () => {
        this.currentTab = btn.dataset.tab as MarketplaceItemType;
        this.updateTabStyles();
        void this.load();
      });
    }

    let searchTimer: ReturnType<typeof setTimeout> | null = null;
    this.searchInput.addEventListener("input", () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => void this.load(), 300);
    });
  }

  private updateTabStyles(): void {
    for (const btn of this.tabButtons) {
      const active = btn.dataset.tab === this.currentTab;
      btn.style.color = active ? "#e0e0e0" : "#888";
      btn.style.borderColor = active ? "#444" : "#222";
    }
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

    if (this.currentTab === "server") {
      await this.loadCatalog(search);
      return;
    }

    const params = new URLSearchParams({ type: this.currentTab });
    if (search) params.set("search", search);

    this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Loading…</div>`;

    try {
      const res = await fetch(`/api/marketplace?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MarketplaceResult = await res.json();
      this.render(data);
    } catch (err) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Unable to reach the marketplace. Please try again later.</div>`;
    }
  }

  private async loadCatalog(search: string): Promise<void> {
    this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Loading…</div>`;
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/mcp-catalog?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CatalogResult = await res.json();
      this.renderCatalog(data.servers);
    } catch (err) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">Unable to load MCP catalog. Please try again later.</div>`;
    }
  }

  private renderCatalog(servers: MCPCatalogServer[]): void {
    if (servers.length === 0) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">No servers found.</div>`;
      return;
    }

    this.content.innerHTML = "";
    for (const server of servers) {
      const card = document.createElement("div");
      card.style.cssText = `
        padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid #1a1a1a;
        border-radius: 0.5rem; background: #0d0d0d; cursor: pointer;
        transition: border-color 0.15s;
      `;
      card.addEventListener("mouseenter", () => { card.style.borderColor = "#333"; });
      card.addEventListener("mouseleave", () => { card.style.borderColor = "#1a1a1a"; });

      const transportBadge = server.transport === "remote"
        ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a2a3a; border-radius:0.25rem; color:#4f9dde;">Remote</span>`
        : `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#2a3a1a; border-radius:0.25rem; color:#8bc34a;">Local</span>`;

      const authBadge = server.authType === "open"
        ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a2a1a; border-radius:0.25rem; color:#53b86b;">Open</span>`
        : server.authType === "oauth"
          ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#2a1a3a; border-radius:0.25rem; color:#9c6ade;">OAuth</span>`
          : `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#3a2a1a; border-radius:0.25rem; color:#c9852c;">API Key</span>`;

      const officialBadge = server.isOfficial
        ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a1a2a; border-radius:0.25rem; color:#6b8acf;">Official</span>`
        : "";

      const nativeBadge = server.nativeIntegration
        ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#2a1a2a; border-radius:0.25rem; color:#de6acf;">Native</span>`
        : "";

      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
          <div style="font-size:1.5rem; flex-shrink:0; width:40px; height:40px; display:flex; align-items:center; justify-content:center; background:#1a1a1a; border-radius:0.375rem;">${this.renderIcon(server.icon, 24)}</div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.15rem;">${this.escape(server.name)}</div>
            <div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(server.summary.slice(0, 80))}</div>
            <div style="display:flex; gap:0.25rem; margin-top:0.35rem; flex-wrap:wrap;">
              ${transportBadge} ${authBadge} ${officialBadge} ${nativeBadge}
              ${server.visitorsPerWeek && server.visitorsPerWeek !== "—" ? `<span style="font-size:0.65rem; padding:0.1rem 0.35rem; background:#1a1a1a; border-radius:0.25rem; color:#666;">${server.visitorsPerWeek}/wk</span>` : ""}
            </div>
          </div>
        </div>
      `;

      card.addEventListener("click", () => this.showServerDetail(server));
      this.content.appendChild(card);
    }
  }

  private render(data: MarketplaceResult): void {
    if (this.currentTab === "agent") {
      this.items = data.agents ?? [];
    } else if (this.currentTab === "prompt") {
      this.items = data.prompts ?? [];
    } else {
      this.items = data.tools ?? [];
    }

    if (this.items.length === 0) {
      this.content.innerHTML = `<div style="text-align:center;color:#666;padding:2rem;">No items found.</div>`;
      return;
    }

    this.content.innerHTML = "";
    for (const item of this.items) {
      const card = document.createElement("div");
      card.style.cssText = `
        padding: 0.75rem; margin-bottom: 0.5rem; border: 1px solid #1a1a1a;
        border-radius: 0.5rem; background: #0d0d0d; cursor: pointer;
        transition: border-color 0.15s;
      `;
      card.addEventListener("mouseenter", () => { card.style.borderColor = "#333"; });
      card.addEventListener("mouseleave", () => { card.style.borderColor = "#1a1a1a"; });

      const name = item.name || "Untitled";
      const summary = item.summary || item.description || "";
      const tags = (item.tags || "").split(",").filter(Boolean).slice(0, 4);
      const price = item.is_free ? "Free" : item.price_usd ? `$${item.price_usd}` : "";

      card.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:0.5rem;">
          ${item.image_url ? `<img src="${item.image_url}" style="width:40px;height:40px;border-radius:0.375rem;object-fit:cover;flex-shrink:0;" />` : ""}
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

      if (this.currentTab === "agent") {
        const agent = item as MarketplaceAgent;
        card.addEventListener("click", () => this.showAgentDetail(agent));
      } else {
        card.addEventListener("click", () => {
          // For prompts/tools, just expand the summary inline for now
          const detail = card.querySelector(".mq-detail") as HTMLDivElement | null;
          if (detail) {
            detail.style.display = detail.style.display === "none" ? "block" : "none";
          } else {
            const d = document.createElement("div");
            d.className = "mq-detail";
            d.style.cssText = "margin-top:0.5rem; font-size:0.78rem; color:#aaa; white-space:pre-wrap;";
            d.textContent = item.description || item.summary || "No description available.";
            card.appendChild(d);
          }
        });
      }

      this.content.appendChild(card);
    }
  }

  private showServerDetail(server: MCPCatalogServer): void {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 9000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.7);
    `;

    const transportLabel = server.transport === "remote" ? "Remote (HTTP/SSE)" : "Local (stdio)";
    const authLabel = server.authType === "open" ? "No auth required" : server.authType === "oauth" ? "OAuth 2.0" : "API Key required";

    const envVarsHtml = server.envVars && server.envVars.length > 0
      ? `<div style="margin-bottom:1rem;">
          <div style="font-size:0.75rem; font-weight:600; color:#666; margin-bottom:0.25rem;">ENVIRONMENT VARIABLES</div>
          ${server.envVars.map((v) => `
            <div style="font-size:0.8rem; color:#aaa; margin-bottom:0.25rem;">
              <code style="background:#1a1a1a; padding:0.1rem 0.3rem; border-radius:0.25rem; color:#c9852c;">${this.escape(v.name)}</code>
              ${v.isRequired ? '<span style="color:#e05d5d; font-size:0.7rem;"> *required</span>' : ""}
              — ${this.escape(v.description)}
            </div>
          `).join("")}
        </div>`
      : "";

    const nativeHtml = server.nativeIntegration && server.nativeIntegrationNote
      ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #2a1a2a; border-radius:0.5rem; background:#1a0a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#de6acf; margin-bottom:0.35rem;">🎮 NATIVE GAME INTEGRATION</div>
          <div style="font-size:0.8rem; color:#aaa;">${this.escape(server.nativeIntegrationNote)}</div>
        </div>`
      : "";

    // Auth section for remote servers that need authentication
    const authHtml = server.transport === "remote" && server.authType !== "open" && server.url
      ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #333; border-radius:0.5rem; background:#1a1a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#c9852c; margin-bottom:0.5rem;">⚠ AUTHENTICATION REQUIRED</div>
          <div id="mq-srv-auth-warning" style="font-size:0.75rem; color:#e05d5d; margin-bottom:0.5rem;">Authenticate before installing.</div>
          <div style="display:flex; gap:0.25rem; align-items:center;">
            ${server.authType === "oauth"
              ? `<button id="mq-srv-oauth" style="flex:1; padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#2a4a6a; color:#e0e0e0; font-size:0.8rem; cursor:pointer;">🔗 Connect via OAuth</button>`
              : `<input id="mq-srv-apikey" type="password" placeholder="Paste API key..." autocomplete="off"
                  style="flex:1; padding:0.4rem 0.6rem; border-radius:0.375rem; border:1px solid #333; background:#111; color:#e0e0e0; font-size:0.8rem;" />
                <button id="mq-srv-save-key" style="padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#333; color:#e0e0e0; font-size:0.75rem; cursor:pointer;">Save</button>`
            }
            <span id="mq-srv-auth-status" style="font-size:0.7rem; color:#888; min-width:1.5rem;"></span>
          </div>
        </div>`
      : "";

    const serverUrl = server.url;
    let authed = server.authType === "open" || !serverUrl;

    modal.innerHTML = `
      <div style="background:#111; border:1px solid #222; border-radius:0.75rem; max-width:520px; max-height:85vh; width:90vw; overflow-y:auto; padding:1.5rem; color:#e0e0e0; font-family:'M PLUS Rounded 1c',system-ui,sans-serif;">
        <div style="display:flex; align-items:flex-start; gap:0.75rem; margin-bottom:1rem;">
          <div style="font-size:2rem; flex-shrink:0; width:56px; height:56px; display:flex; align-items:center; justify-content:center; background:#1a1a1a; border-radius:0.5rem;">${this.renderIcon(server.icon, 32)}</div>
          <div style="flex:1;">
            <h3 style="font-size:1.1rem; font-weight:700; margin:0 0 0.25rem;">${this.escape(server.name)}</h3>
            <div style="font-size:0.8rem; color:#888;">${this.escape(server.summary)}</div>
            <div style="margin-top:0.35rem; display:flex; gap:0.25rem; flex-wrap:wrap;">
              <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; background:#1a1a1a; color:#888;">${transportLabel}</span>
              <span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; background:#1a1a1a; color:#888;">${authLabel}</span>
              ${server.isOfficial ? '<span style="font-size:0.7rem; padding:0.15rem 0.5rem; border-radius:0.25rem; background:#1a1a2a; color:#6b8acf;">Official</span>' : ""}
            </div>
          </div>
        </div>
        <div style="font-size:0.85rem; color:#aaa; margin-bottom:1rem; white-space:pre-wrap;">${this.escape(server.description)}</div>
        <div style="margin-bottom:0.75rem;">
          <div style="font-size:0.75rem; font-weight:600; color:#666; margin-bottom:0.25rem;">CATEGORIES</div>
          <div style="display:flex; gap:0.25rem; flex-wrap:wrap;">
            ${server.category.map((c) => `<span style="font-size:0.7rem; padding:0.1rem 0.35rem; background:#1a1a1a; border-radius:0.25rem; color:#888;">${this.escape(c)}</span>`).join("")}
          </div>
        </div>
        ${envVarsHtml}
        ${nativeHtml}
        ${authHtml}
        <div style="display:flex; gap:0.5rem;">
          <button id="mq-srv-install" style="flex:1; padding:0.6rem; border:none; border-radius:0.5rem; background:#e0e0e0; color:#0d0d0d; font-size:0.9rem; font-weight:600; cursor:pointer;${!authed ? " opacity:0.4; cursor:not-allowed;" : ""}"${!authed ? " disabled" : ""}>Install Server</button>
          <button id="mq-srv-cancel" style="padding:0.6rem 1rem; border:1px solid #222; border-radius:0.5rem; background:#1a1a1a; color:#888; font-size:0.9rem; cursor:pointer;">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector("#mq-srv-cancel")!.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

    const updateInstallButton = () => {
      const btn = modal.querySelector("#mq-srv-install") as HTMLButtonElement | null;
      const warning = modal.querySelector("#mq-srv-auth-warning") as HTMLDivElement | null;
      if (!btn) return;
      btn.disabled = !authed;
      btn.style.opacity = authed ? "1" : "0.4";
      btn.style.cursor = authed ? "pointer" : "not-allowed";
      if (warning) {
        warning.style.display = authed ? "none" : "block";
      }
    };

    // Wire up API key save
    const saveKeyBtn = modal.querySelector("#mq-srv-save-key") as HTMLButtonElement | null;
    if (saveKeyBtn && serverUrl) {
      saveKeyBtn.addEventListener("click", () => {
        const input = modal.querySelector("#mq-srv-apikey") as HTMLInputElement | null;
        if (!input) return;
        const key = input.value.trim();
        if (!key) { input.focus(); return; }
        this.onSetMcpKey(serverUrl!, key);
        input.value = "";
        saveKeyBtn.textContent = "✓ Saved";
        setTimeout(() => { saveKeyBtn.textContent = "Save"; }, 2000);
        authed = true;
        const statusEl = modal.querySelector("#mq-srv-auth-status") as HTMLSpanElement | null;
        if (statusEl) { statusEl.textContent = "✓"; statusEl.style.color = "#53b86b"; }
        updateInstallButton();
      });
    }

    // Wire up OAuth connect
    const oauthBtn = modal.querySelector("#mq-srv-oauth") as HTMLButtonElement | null;
    if (oauthBtn && serverUrl) {
      oauthBtn.addEventListener("click", () => {
        this.onStartMcpOAuth(serverUrl!);
        oauthBtn.textContent = "Opening login...";
        oauthBtn.disabled = true;
        setTimeout(() => { oauthBtn.textContent = "🔗 Connect via OAuth"; oauthBtn.disabled = false; }, 5000);
      });
    }

    // Check if we already have a key for this server
    if (serverUrl && server.authType !== "open") {
      this.onCheckMcpKeys([serverUrl]);
      const origCallback = this.onMcpKeysStatusHandler;
      this.onMcpKeysStatusHandler = (results: { serverUrl: string; hasKey: boolean }[]) => {
        for (const r of results) {
          if (r.serverUrl === serverUrl) {
            authed = r.hasKey;
            const statusEl = modal.querySelector("#mq-srv-auth-status") as HTMLSpanElement | null;
            if (statusEl) {
              statusEl.textContent = r.hasKey ? "✓" : "✗";
              statusEl.style.color = r.hasKey ? "#53b86b" : "#e05d5d";
            }
            updateInstallButton();
          }
        }
      };
      modal.addEventListener("remove", () => {
        this.onMcpKeysStatusHandler = origCallback;
      });
    }

    // Install button
    modal.querySelector("#mq-srv-install")!.addEventListener("click", () => {
      this.onInstallServer(server);
      modal.remove();
    });

    updateInstallButton();
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
    let mcpServers: { url?: string; name?: string; authType?: "oauth" | "apikey" }[] = [];
    try {
      const config = agent.agent ? JSON.parse(agent.agent) : {};
      if (config.mcpServers && Array.isArray(config.mcpServers)) {
        mcpServers = config.mcpServers;
      }
    } catch { /* not JSON */ }

    const mcpKeyHtml = mcpServers.length > 0
      ? `<div style="margin-bottom:1rem; padding:0.75rem; border:1px solid #333; border-radius:0.5rem; background:#1a1a1a;">
          <div style="font-size:0.75rem; font-weight:600; color:#c9852c; margin-bottom:0.5rem;">⚠ MCP SERVER AUTH REQUIRED</div>
          <div id="mq-mcp-warning" style="font-size:0.75rem; color:#e05d5d; margin-bottom:0.5rem;">Connect each server before hiring.</div>
          ${mcpServers.map((s, i) => {
            const isOAuth = s.authType === "oauth";
            return `
            <div style="margin-bottom:0.5rem;">
              <div style="font-size:0.75rem; color:#888; margin-bottom:0.25rem;">${this.escape(s.name ?? s.url ?? "MCP Server")} ${isOAuth ? '<span style="color:#4f9dde;font-size:0.65rem;">OAuth</span>' : '<span style="color:#666;font-size:0.65rem;">API Key</span>'}</div>
              <div style="display:flex; gap:0.25rem; align-items:center;">
                ${isOAuth
                  ? `<button id="mq-mcp-connect-${i}" style="flex:1; padding:0.4rem 0.6rem; border:none; border-radius:0.375rem; background:#2a4a6a; color:#e0e0e0; font-size:0.8rem; cursor:pointer;">🔗 Connect via OAuth</button>`
                  : `<input id="mq-mcp-key-${i}" type="password" placeholder="Paste API key..." autocomplete="off"
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
          warning.textContent = `${missing} server(s) still need authentication before you can hire.`;
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
          // Optimistically mark as having a key
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

    // Restore callback when modal closes
    modal.addEventListener("remove", () => {
      this.onMcpKeysStatusHandler = origCallback;
    });

    updateHireButton();

    modal.querySelector("#mq-hire")!.addEventListener("click", () => {
      this.onHireAgent(agent);
      modal.remove();
    });
  }

  private renderIcon(icon: string, size: number): string {
    if (icon.startsWith("http")) {
      return `<img src="${icon}" width="${size}" height="${size}" alt="" style="display:block;" />`;
    }
    if (icon.startsWith("<svg")) {
      return icon.replace(/<svg/, `<svg width="${size}" height="${size}"`);
    }
    return this.escape(icon);
  }

  private escape(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
}
