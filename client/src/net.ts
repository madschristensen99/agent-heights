import type { ClientMsg, ServerMsg } from "../../shared/types";

export class Net {
  private ws: WebSocket | null = null;
  private retryMs = 500;
  private queue: ClientMsg[] = [];
  private token: string | null = null;
  onMessage: (msg: ServerMsg) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  setToken(token: string | null): void {
    this.token = token;
  }

  connect(): void {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const wsHost = import.meta.env.VITE_WS_HOST as string | undefined;
    // When VITE_WS_HOST isn't loaded (e.g. Vite root mismatch), fall back to
    // the backend port directly.  The Vite dev server doesn't proxy WS, so
    // any localhost port that isn't 3001 needs to be redirected there.
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    const fallback = wsHost || (isLocal && location.port !== "3001"
      ? "localhost:3001"
      : location.host);
    const url = this.token
      ? `${proto}://${fallback}/?token=${encodeURIComponent(this.token)}`
      : `${proto}://${fallback}`;
    console.log(`[net] connecting to ${url} (wsHost=${wsHost}, location.host=${location.host}, location.port=${location.port})`);
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
        this.onMessage(msg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (ev) => {
      console.log(`[net] WebSocket CLOSED: code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean} — retrying in ${this.retryMs}ms`);
      this.onStatus(false);
      this.retryMs = Math.min(this.retryMs * 2, 8000);
      setTimeout(() => this.connect(), this.retryMs);
    };
    ws.onerror = (ev) => {
      console.error(`[net] WebSocket ERROR:`, ev);
      ws.close();
    };
  }

  send(msg: ClientMsg): void {
    console.log(`[net] sending: type=${msg.type} name=${(msg as any).name ?? ""}`);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log(`[net] WebSocket not open — queuing message. readyState=${this.ws?.readyState}`);
      this.queue.push(msg);
    }
  }
}
