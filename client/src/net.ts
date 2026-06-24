import type { ClientMsg, ServerMsg } from "../../shared/types";
import { SERVER_PORT } from "../../shared/types";

export class Net {
  private ws: WebSocket | null = null;
  private retryMs = 500;
  private queue: ClientMsg[] = [];
  onMessage: (msg: ServerMsg) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  connect(): void {
    const url = `ws://${location.hostname}:${SERVER_PORT}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryMs = 500;
      this.onStatus(true);
      for (const msg of this.queue.splice(0)) {
        ws.send(JSON.stringify(msg));
      }
    };
    ws.onmessage = (ev) => {
      try {
        this.onMessage(JSON.parse(ev.data) as ServerMsg);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      this.retryMs = Math.min(this.retryMs * 2, 8000);
      setTimeout(() => this.connect(), this.retryMs);
    };
    ws.onerror = () => ws.close();
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // hold it until the socket (re)connects
      this.queue.push(msg);
    }
  }
}
