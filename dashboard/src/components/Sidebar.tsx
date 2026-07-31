import { LayoutGrid, Users, KanbanSquare, Settings, Power, Clock, Store, Server, Skull } from "lucide-react";

export type View = "fleet" | "agent" | "board" | "settings" | "schedules" | "marketplace" | "mcp" | "fired" | "files" | "memory" | "wallet";

interface SidebarProps {
  view: View;
  onViewChange: (v: View) => void;
  agentCount: number;
  boardCount: number;
  scheduleCount: number;
  mcpCount: number;
  firedCount: number;
  connected: boolean;
  bossName: string;
}

export function Sidebar({ view, onViewChange, agentCount, boardCount, scheduleCount, mcpCount, firedCount, connected, bossName }: SidebarProps) {
  const navItems = [
    { id: "fleet" as View, icon: Users, label: "Fleet", badge: agentCount },
    { id: "board" as View, icon: KanbanSquare, label: "Task Board", badge: boardCount },
    { id: "schedules" as View, icon: Clock, label: "Schedules", badge: scheduleCount },
    { id: "marketplace" as View, icon: Store, label: "Marketplace", badge: undefined },
    { id: "mcp" as View, icon: Server, label: "MCP Servers", badge: mcpCount },
    { id: "fired" as View, icon: Skull, label: "Fired / Vacation", badge: firedCount },
    { id: "settings" as View, icon: Settings, label: "Settings", badge: undefined },
  ];

  return (
    <div className="w-56 bg-bg-card border-r border-border flex flex-col h-screen">
      <div className="px-4 py-5 border-b border-border">
        <h1 className="text-lg font-bold text-accent tracking-wide">Agent Heights</h1>
        <p className="text-xs text-muted mt-0.5">Fleet Dashboard</p>
      </div>

      <nav className="flex-1 py-3 space-y-1 overflow-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id || (view === "agent" && item.id === "fleet") ||
            (view === "files" && item.id === "fleet") || (view === "memory" && item.id === "fleet") ||
            (view === "wallet" && item.id === "fleet");
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-bg-hover text-accent border-r-2 border-accent"
                  : "text-gray-400 hover:text-gray-200 hover:bg-bg-hover"
              }`}
            >
              <Icon size={18} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="text-xs bg-bg-hover px-2 py-0.5 rounded-full text-muted">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${connected ? "bg-accent" : "bg-status-error"}`} />
          <span className="text-muted">{connected ? "Connected" : "Disconnected"}</span>
        </div>
        <div className="text-xs text-muted truncate">
          <Power size={12} className="inline mr-1" />
          {bossName}
        </div>
        <a
          href="/"
          className="block text-xs text-muted hover:text-accent transition-colors"
        >
          ← Back to Game
        </a>
      </div>
    </div>
  );
}
