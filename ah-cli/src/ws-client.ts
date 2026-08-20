import WebSocket from "ws";

export type ExternalTool = "vscode" | "cursor" | "windsurf" | "claude-code" | "codex" | "aider" | "unknown";

export interface ExternalEvent {
  type: "file_edit" | "file_save" | "git_commit" | "git_branch" | "test_run" | "test_result" | "command" | "ai_completion" | "ai_chat" | "session_start" | "session_end" | "error";
  timestamp: number;
  file?: string;
  linesAdded?: number;
  linesRemoved?: number;
  message?: string;
  success?: boolean;
}

export interface BridgeConfig {
  host: string;
  token: string;
  tool: ExternalTool;
  sessionId?: string;
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private config: BridgeConfig;
  private sessionId: string;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private pendingEvents: ExternalEvent[] = [];

  constructor(config: BridgeConfig) {
    this.config = config;
    this.sessionId = config.sessionId || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  connect(): void {
    const url = `${this.config.host}?token=${encodeURIComponent(this.config.token)}`;
    console.log(`[ah] Connecting to ${this.config.host}...`);
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      console.log(`[ah] Connected. Session: ${this.sessionId}`);
      this.connected = true;
      // Send external_connect now that WS is authenticated via token query param
      this.send({
        type: "external_connect",
        tool: this.config.tool,
        sessionId: this.sessionId,
        token: this.config.token,
      });
      this.startIdleCheck();
    });

    this.ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "auth_required") {
          // Server didn't get the token from URL — send it explicitly
          this.send({ type: "auth", token: this.config.token });
        } else if (msg.type === "toast" && msg.text?.startsWith("IDE Bridge:")) {
          console.error(`[ah] Server error: ${msg.text}`);
        }
      } catch { /* ignore */ }
    });

    this.ws.on("close", () => {
      this.connected = false;
      console.log("[ah] Disconnected. Reconnecting in 3s...");
      this.stopIdleCheck();
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err: Error) => {
      console.error(`[ah] WebSocket error: ${err.message}`);
    });
  }

  disconnect(): void {
    if (this.ws && this.connected) {
      this.send({ type: "external_disconnect", sessionId: this.sessionId });
    }
    this.stopIdleCheck();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  /** Send an activity update with optional events. */
  activity(state: "active" | "idle" | "error", opts?: {
    currentFile?: string;
    language?: string;
    gitBranch?: string;
    filesChanged?: number;
    linesAdded?: number;
    linesRemoved?: number;
    events?: ExternalEvent[];
  }): void {
    this.lastActivity = Date.now();
    this.send({
      type: "external_activity",
      sessionId: this.sessionId,
      state,
      ...opts,
    });
  }

  /** Queue an event to be flushed with the next activity update. */
  pushEvent(event: ExternalEvent): void {
    this.pendingEvents.push(event);
    this.lastActivity = Date.now();
  }

  /** Flush queued events in an activity update. */
  flushEvents(state: "active" | "idle" = "active"): void {
    if (this.pendingEvents.length === 0) return;
    this.activity(state, { events: this.pendingEvents });
    this.pendingEvents = [];
  }

  get isConnected(): boolean { return this.connected; }
  get currentSessionId(): string { return this.sessionId; }

  private send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private startIdleCheck(): void {
    this.activityTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs > 5000 && this.connected) {
        this.send({ type: "external_activity", sessionId: this.sessionId, state: "idle" });
        this.lastActivity = Date.now();
      }
    }, 2000);
  }

  private stopIdleCheck(): void {
    if (this.activityTimer) { clearInterval(this.activityTimer); this.activityTimer = null; }
  }
}
