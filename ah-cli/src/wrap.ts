import { spawn } from "node:child_process";
import type { BridgeClient, ExternalEvent } from "./ws-client.js";

export function wrapCommand(
  bridge: BridgeClient,
  command: string,
  args: string[] = [],
  opts?: { cwd?: string },
): Promise<number> {
  const startTime = Date.now();

  bridge.activity("active", {
    events: [{
      type: "command",
      timestamp: startTime,
      message: `${command} ${args.join(" ")}`,
    }],
  });

  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: opts?.cwd ?? process.cwd(),
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      const duration = Date.now() - startTime;
      const ev: ExternalEvent = {
        type: "command",
        timestamp: Date.now(),
        message: `Exit code ${code} after ${(duration / 1000).toFixed(1)}s`,
        success: code === 0,
      };
      bridge.pushEvent(ev);
      bridge.activity(code === 0 ? "idle" : "error", {
        events: [ev],
      });
      bridge.flushEvents();
      resolve(code ?? 1);
    });

    proc.on("error", (err) => {
      bridge.pushEvent({
        type: "error",
        timestamp: Date.now(),
        message: err.message,
      });
      bridge.activity("error");
      bridge.flushEvents();
      resolve(1);
    });
  });
}
