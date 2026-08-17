import { useState, useEffect } from "react";
import { useDashboard } from "../lib/store";
import type { MarketplaceAgent } from "../../shared/marketplace";
import { Search, Download, ExternalLink, Tag } from "lucide-react";

export function MarketplaceView() {
  const { send } = useDashboard();
  const [agents, setAgents] = useState<MarketplaceAgent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({ type: "agent", limit: "50", premium: "false" });
    if (search) params.set("search", search);
    fetch(`/api/marketplace?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [search]);

  const handleHire = (agent: MarketplaceAgent) => {
    let config: Record<string, unknown> = {};
    try {
      if (agent.agent) config = JSON.parse(agent.agent);
    } catch { /* ignore */ }

    const systemPrompt = String(config.systemPrompt || agent.description || "").slice(0, 4000);
    const model = String(config.model || "claude-sonnet-4-20250514");
    const mcpServers = config.mcpServers as { url?: string; command?: string; name?: string }[] | undefined;
    const cdpSolana = Boolean(config.cdpSolana);
    const crossmintWallet = Boolean(config.crossmintWallet);
    const isPremium = Boolean(config.isPremium);
    const circleServices = config.circleServices as { name: string; endpoint: string; pricePerCall: number; description: string; tools: { name: string; description: string; inputSchema: object }[] }[] | undefined;

    send({
      type: "hire",
      name: agent.name.slice(0, 24) || "Agent",
      provider: "cline",
      model,
      systemPrompt,
      mcpServers: mcpServers as never,
      cdpSolana,
      crossmintWallet,
      isPremium,
      circleServices: circleServices as never,
    });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-200">Marketplace</h2>
        <div className="flex-1" />
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent w-64"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mr-3" />
            Loading marketplace...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-status-error">{error}</div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Search size={48} className="mb-4 opacity-50" />
            <p>No agents found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.id} className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-colors">
                <div className="flex items-start gap-3">
                  {agent.image_url ? (
                    <img src={agent.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-bg-hover flex items-center justify-center text-lg font-bold text-accent">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-200 truncate">{agent.name}</h3>
                    <p className="text-xs text-muted mt-0.5">{agent.language}</p>
                  </div>
                  {!agent.is_premium && (agent.is_free ? (
                    <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">Free</span>
                  ) : agent.price_usd != null ? (
                    <span className="text-xs bg-bg-hover text-gray-300 px-2 py-0.5 rounded-full">${agent.price_usd}</span>
                  ) : null)}
                  {agent.is_premium && (
                    <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Premium</span>
                  )}
                </div>

                <p className="text-sm text-gray-400 mt-3 line-clamp-3">{agent.description}</p>

                {agent.is_premium && (() => {
                  try {
                    const cfg = agent.agent ? JSON.parse(agent.agent) : {};
                    const services: { name: string; pricePerCall: number; description: string }[] = cfg.circleServices ?? [];
                    if (services.length === 0) return null;
                    const minPrice = Math.min(...services.map((s) => s.pricePerCall));
                    const maxPrice = Math.max(...services.map((s) => s.pricePerCall));
                    const priceLabel = minPrice === maxPrice
                      ? `$${minPrice.toFixed(4)}/call`
                      : `$${minPrice.toFixed(4)}–$${maxPrice.toFixed(4)}/call`;
                    return (
                      <div className="mt-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <div className="text-xs text-purple-400 font-medium mb-1">⚡ {priceLabel}</div>
                        <div className="flex flex-wrap gap-1">
                          {services.slice(0, 4).map((s, i) => (
                            <span key={i} className="text-xs text-purple-300/70 bg-purple-500/10 px-1.5 py-0.5 rounded">
                              {s.name} · ${s.pricePerCall.toFixed(4)}
                            </span>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Allowance: Starter $0.50 · Pro $3.00 · Business $12.00/mo
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}

                {agent.use_cases.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {agent.use_cases.slice(0, 3).map((uc, i) => (
                      <span key={i} className="text-xs text-muted bg-bg-hover px-2 py-0.5 rounded flex items-center gap-1">
                        <Tag size={10} /> {uc}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => handleHire(agent)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
                  >
                    <Download size={14} /> Hire
                  </button>
                  {agent.links.length > 0 && (
                    <a
                      href={agent.links[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg bg-bg-input border border-border text-muted hover:text-accent"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
