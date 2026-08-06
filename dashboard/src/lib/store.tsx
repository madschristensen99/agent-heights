import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type {
  AgentInfo, LogEntry, TaskCard, ServerMsg, ClientMsg, GameSettings, PlayerInfo,
  AgentSchedule, FiredAgent, VacationedAgent, OfficeMCPServer, WorldState,
} from "../../shared/types";
import { WSClient } from "./ws";
import * as authLib from "./auth";

interface FsEntry { name: string; isDir: boolean; size: number; mtime: number }

interface DashboardState {
  connected: boolean;
  agents: Map<string, AgentInfo>;
  logs: Map<string, LogEntry[]>;
  board: TaskCard[];
  settings: GameSettings | null;
  player: PlayerInfo | null;
  toasts: { id: number; text: string }[];
  schedules: AgentSchedule[];
  firedAgents: FiredAgent[];
  vacationedAgents: VacationedAgent[];
  world: WorldState | null;
  officeMcpServers: OfficeMCPServer[];
  agentMemory: Map<string, { role: string; content: string }[]>;
  agentFsListings: Map<string, { path: string; entries: FsEntry[] }>;
  agentFsContent: Map<string, { path: string; content: string; error?: string }>;
  walletData: Map<string, Record<string, unknown>>;
}

interface DashboardContextValue extends DashboardState {
  send: (msg: ClientMsg) => void;
  getAgentLogs: (agentId: string) => LogEntry[];
  dismissToast: (id: number) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}

let toastId = 0;

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState<Map<string, AgentInfo>>(new Map());
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const [board, setBoard] = useState<TaskCard[]>([]);
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const [player, setPlayer] = useState<PlayerInfo | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [firedAgents, setFiredAgents] = useState<FiredAgent[]>([]);
  const [vacationedAgents, setVacationedAgents] = useState<VacationedAgent[]>([]);
  const [world, setWorld] = useState<WorldState | null>(null);
  const [officeMcpServers, setOfficeMcpServers] = useState<OfficeMCPServer[]>([]);
  const [agentMemory, setAgentMemory] = useState<Map<string, { role: string; content: string }[]>>(new Map());
  const [agentFsListings, setAgentFsListings] = useState<Map<string, { path: string; entries: FsEntry[] }>>(new Map());
  const [agentFsContent, setAgentFsContent] = useState<Map<string, { path: string; content: string; error?: string }>>(new Map());
  const [walletData, setWalletData] = useState<Map<string, Record<string, unknown>>>(new Map());
  const wsRef = useState(() => new WSClient())[0];

  const pushToast = useCallback((text: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const ws = wsRef;
    ws.onStatus = setConnected;
    ws.onRefreshToken = async () => {
      return await authLib.refreshSession();
    };
    ws.onMessage = (msg: ServerMsg) => {
      switch (msg.type) {
        case "snapshot": {
          const agentMap = new Map<string, AgentInfo>();
          for (const a of msg.agents) agentMap.set(a.id, a);
          const logMap = new Map<string, LogEntry[]>();
          for (const [id, entries] of Object.entries(msg.logs)) logMap.set(id, entries);
          setAgents(agentMap);
          setLogs(logMap);
          setBoard(msg.board ?? []);
          setSettings(msg.settings ?? null);
          setPlayer(msg.player ?? null);
          setSchedules(msg.schedules ?? []);
          if (msg.world) {
            setWorld(msg.world);
            setFiredAgents(msg.world.firedAgents ?? []);
            setVacationedAgents(msg.world.vacationedAgents ?? []);
          }
          break;
        }
        case "agent": {
          setAgents((prev) => {
            const next = new Map(prev);
            next.set(msg.agent.id, msg.agent);
            return next;
          });
          break;
        }
        case "agent_removed": {
          setAgents((prev) => {
            const next = new Map(prev);
            next.delete(msg.agentId);
            return next;
          });
          break;
        }
        case "log": {
          setLogs((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.agentId) ?? [];
            next.set(msg.agentId, [...existing, msg.entry].slice(-500));
            return next;
          });
          break;
        }
        case "card": {
          setBoard((prev) => {
            const idx = prev.findIndex((c) => c.id === msg.card.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg.card;
              return next;
            }
            return [...prev, msg.card];
          });
          break;
        }
        case "card_removed": {
          setBoard((prev) => prev.filter((c) => c.id !== msg.cardId));
          break;
        }
        case "gantt_update": {
          setBoard(msg.cards);
          break;
        }
        case "phase_gate":
        case "capability_gap":
          // These are handled by listeners in Phase 5 dashboard views
          break;
        case "settings": {
          setSettings(msg.settings);
          break;
        }
        case "player": {
          setPlayer(msg.player);
          break;
        }
        case "toast": {
          pushToast(msg.text);
          break;
        }
        case "schedules": {
          setSchedules(msg.schedules);
          break;
        }
        case "schedule": {
          setSchedules((prev) => {
            const idx = prev.findIndex((s) => s.id === msg.schedule.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg.schedule;
              return next;
            }
            return [...prev, msg.schedule];
          });
          break;
        }
        case "schedule_removed": {
          setSchedules((prev) => prev.filter((s) => s.id !== msg.scheduleId));
          break;
        }
        case "world": {
          setWorld(msg.world);
          setFiredAgents(msg.world.firedAgents ?? []);
          setVacationedAgents(msg.world.vacationedAgents ?? []);
          break;
        }
        case "fired_agent": {
          setFiredAgents((prev) => {
            const idx = prev.findIndex((a) => a.id === msg.agent.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg.agent;
              return next;
            }
            return [...prev, msg.agent];
          });
          break;
        }
        case "fired_agent_removed": {
          setFiredAgents((prev) => prev.filter((a) => a.id !== msg.agentId));
          break;
        }
        case "vacationed_agent": {
          setVacationedAgents((prev) => {
            const idx = prev.findIndex((a) => a.id === msg.agent.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg.agent;
              return next;
            }
            return [...prev, msg.agent];
          });
          break;
        }
        case "vacationed_agent_removed": {
          setVacationedAgents((prev) => prev.filter((a) => a.id !== msg.agentId));
          break;
        }
        case "office_mcp_list": {
          setOfficeMcpServers(msg.servers);
          break;
        }
        case "office_mcp_update": {
          setOfficeMcpServers((prev) => {
            const idx = prev.findIndex((s) => s.id === msg.server.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = msg.server;
              return next;
            }
            return [...prev, msg.server];
          });
          break;
        }
        case "office_mcp_removed": {
          setOfficeMcpServers((prev) => prev.filter((s) => s.id !== msg.serverId));
          break;
        }
        case "agent_memory": {
          setAgentMemory((prev) => {
            const next = new Map(prev);
            next.set(msg.agentId, msg.messages);
            return next;
          });
          break;
        }
        case "agent_fs_listing": {
          setAgentFsListings((prev) => {
            const next = new Map(prev);
            next.set(msg.agentId, { path: msg.path, entries: msg.entries });
            return next;
          });
          break;
        }
        case "agent_fs_content": {
          setAgentFsContent((prev) => {
            const next = new Map(prev);
            next.set(msg.agentId, { path: msg.path, content: msg.content, error: msg.error });
            return next;
          });
          break;
        }
        case "cdp_wallet_status":
        case "cdp_policy_status":
        case "cdp_tx_history":
        case "crossmint_wallet_status":
        case "crossmint_policy_status":
        case "crossmint_tx_history": {
          const agentId = (msg as { agentId: string }).agentId;
          setWalletData((prev) => {
            const next = new Map(prev);
            const existing = next.get(agentId) ?? {};
            next.set(agentId, { ...existing, [msg.type]: msg });
            return next;
          });
          break;
        }
        case "auth_required": {
          break;
        }
        default:
          break;
      }
    };

    const unsub = authLib.onAuthChange((state) => {
      if (state.session) {
        ws.setToken(state.session.access_token);
        ws.connect();
      } else if (!state.loading) {
        ws.disconnect();
      }
    });

    void authLib.initAuth();

    return () => {
      unsub();
      ws.disconnect();
    };
  }, [wsRef, pushToast]);

  const send = useCallback((msg: ClientMsg) => {
    wsRef.send(msg);
  }, [wsRef]);

  const getAgentLogs = useCallback((agentId: string): LogEntry[] => {
    return logs.get(agentId) ?? [];
  }, [logs]);

  const value: DashboardContextValue = {
    connected,
    agents,
    logs,
    board,
    settings,
    player,
    toasts,
    schedules,
    firedAgents,
    vacationedAgents,
    world,
    officeMcpServers,
    agentMemory,
    agentFsListings,
    agentFsContent,
    walletData,
    send,
    getAgentLogs,
    dismissToast,
  };

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
