import type { ClientMsg, ServerMsg } from "../../shared/types";

export class Net {
  private ws: WebSocket | null = null;
  private retryMs = 500;
  private queue: ClientMsg[] = [];
  private token: string | null = null;
  private manuallyDisconnected = false;
  private _spectator = false;
  private customHost: string | null = null;
  onMessage: (msg: ServerMsg) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};
  onRefreshToken: () => Promise<string | null> = async () => null;

  setToken(token: string | null): void {
    this.token = token;
  }

  setSpectator(value: boolean): void {
    this._spectator = value;
  }

  get spectator(): boolean { return this._spectator; }

  connect(): void {
    this.manuallyDisconnected = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const runtimeEnv = (typeof window !== "undefined" && (window as any).__ENV__) || {};
    const wsHost = (runtimeEnv.VITE_WS_HOST ?? import.meta.env.VITE_WS_HOST) as string | undefined;
    // When VITE_WS_HOST isn't loaded (e.g. Vite root mismatch), fall back to
    // the backend port directly.  The Vite dev server doesn't proxy WS, so
    // any localhost port that isn't 3001 needs to be redirected there.
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    // Ignore wsHost that points to localhost when we're in production
    const effectiveWsHost = wsHost && (!wsHost.includes("localhost") || isLocal) ? wsHost : undefined;
    const fallback = effectiveWsHost || (isLocal && location.port !== "3001"
      ? "localhost:3001"
      : location.host);
    const host = this.customHost ?? fallback;
    const url = this._spectator
      ? `${proto}://${host}/?spectator=1`
      : this.token
        ? `${proto}://${host}/?token=${encodeURIComponent(this.token)}`
        : `${proto}://${host}`;
    console.log(`[net] connecting to ${url} (host=${host}, customHost=${this.customHost})`);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      console.log(`[net] WebSocket OPEN — flushing ${this.queue.length} queued messages`);
      this.retryMs = 500;
      this.onStatus(true);
      for (const msg of this.queue.splice(0)) {
        ws.send(JSON.stringify(msg));
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMsg;
        console.log(`[net] received: type=${msg.type}`);
        if (msg.type === "refresh_token") {
          void this.handleRefreshToken();
          return;
        }
        this.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (ev) => {
      console.log(`[net] WebSocket CLOSED: code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} — retrying in ${this.retryMs}ms`);
      this.onStatus(false);
      if (this.manuallyDisconnected) return;
      // On 4003 (expired token), refresh the session before reconnecting
      if (ev.code === 4003) {
        void this.onRefreshToken().then((newToken) => {
          if (newToken) {
            this.token = newToken;
            this.retryMs = 500;
            setTimeout(() => this.connect(), this.retryMs);
          } else {
            // No fresh token — reload to show login overlay
            location.reload();
          }
        });
        return;
      }
      this.retryMs = Math.min(this.retryMs * 2, 8000);
      setTimeout(() => this.connect(), this.retryMs);
    };
    ws.onerror = (ev) => {
      console.error(`[net] WebSocket ERROR:`, ev);
      ws.close();
    };
  }

  private async handleRefreshToken(): Promise<void> {
    const newToken = await this.onRefreshToken();
    if (newToken && this.ws?.readyState === WebSocket.OPEN) {
      this.token = newToken;
      this.send({ type: "renew_token", token: newToken });
    }
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
      this.onStatus(false);
    }
  }

  /** Reconnect to a different WebSocket host (e.g. a deployed world instance). */
  reconnectToHost(host: string): void {
    this.customHost = host;
    this.disconnect();
    this.manuallyDisconnected = false;
    this.retryMs = 500;
    setTimeout(() => this.connect(), 100);
  }

  /** Reset back to the default host and reconnect. */
  resetHost(): void {
    this.customHost = null;
    this.disconnect();
    this.manuallyDisconnected = false;
    this.retryMs = 500;
    setTimeout(() => this.connect(), 100);
  }

  /** Whether currently connected to a custom (world) host. */
  get isOnCustomHost(): boolean {
    return this.customHost !== null;
  }

  /** The current custom host, or null if on default. */
  get currentHost(): string | null {
    return this.customHost;
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log(`[net] WebSocket not open — queuing message. readyState=${this.ws?.readyState}`);
      this.queue.push(msg);
    }
  }
}
