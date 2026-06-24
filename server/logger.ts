import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlayerInfo } from "../shared/types.js";

interface SessionEvent {
  ts: string;
  event: string;
  [key: string]: unknown;
}

/**
 * Persists every interaction of a play session to ag/logs/ as a single JSON
 * file named with the session start time and a UUID. Writes are debounced so
 * streaming agent logs don't hammer the disk.
 */
export class SessionLogger {
  readonly sessionId = randomUUID();
  readonly file: string;
  private startedAt = new Date().toISOString();
  private player: PlayerInfo | null = null;
  private events: SessionEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(rootDir: string) {
    const dir = join(rootDir, "ag", "logs");
    mkdirSync(dir, { recursive: true });
    const stamp = this.startedAt.replace(/[:.]/g, "-");
    this.file = join(dir, `${stamp}-${this.sessionId}.json`);
    this.flush();
  }

  setPlayer(player: PlayerInfo): void {
    this.player = player;
    this.record("setup", { player });
  }

  record(event: string, data: Record<string, unknown> = {}): void {
    this.events.push({ ts: new Date().toISOString(), event, ...data });
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, 300);
    }
  }

  private flush(): void {
    const doc = {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      player: this.player,
      events: this.events,
    };
    try {
      writeFileSync(this.file, JSON.stringify(doc, null, 2));
    } catch (err) {
      console.error("[logger] failed to write session log:", err);
    }
  }
}
