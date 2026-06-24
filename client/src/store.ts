import type { AgentInfo, FiredAgent, GameSettings, LogEntry, PlayerInfo, ServerMsg, TaskCard } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";

type Listener = () => void;

export interface FeedItem {
  agentId: string;
  name: string;
  accent: string;
  entry: LogEntry;
  /** Monotonic id so the HUD can append only what's new. */
  seq: number;
}

const FEED_MAX = 300;

/** Client-side mirror of server state; HUD and the Phaser scene subscribe. */
export class Store {
  agents = new Map<string, AgentInfo>();
  logs = new Map<string, LogEntry[]>();
  board = new Map<string, TaskCard>();
  firedAgents = new Map<string, FiredAgent>();
  worldSeed = 0;
  /** Every agent's messages merged chronologically, for the office feed. */
  feed: FeedItem[] = [];
  /** Bumped when the feed is rebuilt or items vanish mid-list (not appended). */
  feedVersion = 0;
  private feedSeq = 0;
  player: PlayerInfo | null = null;
  settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  selectedId: string | null = null;
  connected = false;
  boardOpen = false;

  private listeners = new Set<Listener>();
  private toastListeners = new Set<(text: string) => void>();
  private huddleListeners = new Set<(agentIds: string[]) => void>();

  subscribe(fn: Listener): void {
    this.listeners.add(fn);
  }

  onToast(fn: (text: string) => void): void {
    this.toastListeners.add(fn);
  }

  onHuddle(fn: (agentIds: string[]) => void): void {
    this.huddleListeners.add(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.emit();
  }

  toggleBoard(open?: boolean): void {
    this.boardOpen = open ?? !this.boardOpen;
    this.emit();
  }

  toast(text: string): void {
    for (const fn of this.toastListeners) fn(text);
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.emit();
  }

  selected(): AgentInfo | null {
    return this.selectedId ? (this.agents.get(this.selectedId) ?? null) : null;
  }

  apply(msg: ServerMsg): void {
    switch (msg.type) {
      case "snapshot": {
        this.agents = new Map(msg.agents.map((a) => [a.id, a]));
        this.logs = new Map(Object.entries(msg.logs));
        this.board = new Map(msg.board.map((c) => [c.id, c]));
        this.player = msg.player;
        this.settings = msg.settings;
        if (msg.world) {
          this.worldSeed = msg.world.seed;
          this.firedAgents = new Map(msg.world.firedAgents.map((fa) => [fa.id, fa]));
        }
        if (this.selectedId && !this.agents.has(this.selectedId)) this.selectedId = null;
        // rebuild the feed from the per-agent logs
        this.feed = [];
        for (const [agentId, entries] of this.logs) {
          const a = this.agents.get(agentId);
          for (const entry of entries) {
            this.feed.push({
              agentId,
              name: a?.name ?? "?",
              accent: a?.accent ?? "#9aa0b0",
              entry,
              seq: 0,
            });
          }
        }
        this.feed.sort((a, b) => a.entry.ts - b.entry.ts);
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        for (const f of this.feed) f.seq = this.feedSeq++;
        this.feedVersion++;
        break;
      }
      case "player":
        this.player = msg.player;
        break;
      case "settings":
        this.settings = msg.settings;
        break;
      case "agent":
        this.agents.set(msg.agent.id, msg.agent);
        break;
      case "agent_removed":
        this.agents.delete(msg.agentId);
        this.logs.delete(msg.agentId);
        if (this.selectedId === msg.agentId) this.selectedId = null;
        break;
      case "chat_cleared":
        this.logs.set(msg.agentId, []);
        this.feed = this.feed.filter((f) => f.agentId !== msg.agentId);
        this.feedVersion++;
        break;
      case "log": {
        const list = this.logs.get(msg.agentId) ?? [];
        list.push(msg.entry);
        if (list.length > 500) list.splice(0, list.length - 500);
        this.logs.set(msg.agentId, list);
        const a = this.agents.get(msg.agentId);
        this.feed.push({
          agentId: msg.agentId,
          name: a?.name ?? "?",
          accent: a?.accent ?? "#9aa0b0",
          entry: msg.entry,
          seq: this.feedSeq++,
        });
        if (this.feed.length > FEED_MAX) this.feed.splice(0, this.feed.length - FEED_MAX);
        break;
      }
      case "toast":
        for (const fn of this.toastListeners) fn(msg.text);
        return;
      case "card":
        this.board.set(msg.card.id, msg.card);
        break;
      case "card_removed":
        this.board.delete(msg.cardId);
        break;
      case "world":
        this.worldSeed = msg.world.seed;
        this.firedAgents = new Map(msg.world.firedAgents.map((fa) => [fa.id, fa]));
        break;
      case "fired_agent":
        this.firedAgents.set(msg.agent.id, msg.agent);
        break;
      case "fired_agent_removed":
        this.firedAgents.delete(msg.agentId);
        break;
      case "huddle":
        for (const fn of this.huddleListeners) fn(msg.agentIds);
        return;
    }
    this.emit();
  }
}
