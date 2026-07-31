export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    idle: "text-status-idle",
    thinking: "text-status-thinking",
    working: "text-status-working",
    done: "text-status-done",
    error: "text-status-error",
    waiting: "text-status-waiting",
  };
  return map[status] ?? "text-muted";
}

export function statusBg(status: string): string {
  const map: Record<string, string> = {
    idle: "bg-status-idle/20",
    thinking: "bg-status-thinking/20",
    working: "bg-status-working/20",
    done: "bg-status-done/20",
    error: "bg-status-error/20",
    waiting: "bg-status-waiting/20",
  };
  return map[status] ?? "bg-muted/20";
}

export function logKindColor(kind: string): string {
  const map: Record<string, string> = {
    status: "text-blue-400",
    text: "text-gray-300",
    tool: "text-purple-400",
    result: "text-green-400",
    error: "text-red-400",
    boss: "text-yellow-400",
  };
  return map[kind] ?? "text-gray-400";
}
