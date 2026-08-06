import { useDashboard } from "../lib/store";
import type { TaskCard, TaskPhase } from "../../shared/types";
import { BarChart3 } from "lucide-react";

const PHASE_COLORS: Record<string, string> = {
  requirements: "#a78bfa",
  design: "#f9ca24",
  implementation: "#68a063",
  verification: "#3a8cd4",
  done: "#3b82f6",
};

export function GanttChart() {
  const { board, agents } = useDashboard();

  const cards = [...board].sort((a, b) => a.createdAt - b.createdAt);
  const now = Date.now();

  let minTime = now;
  let maxTime = now + 24 * 60 * 60 * 1000;
  for (const c of cards) {
    if (c.startedAt) minTime = Math.min(minTime, c.startedAt);
    if (c.dueDate) maxTime = Math.max(maxTime, c.dueDate);
    if (c.startedAt && c.estimatedMinutes) {
      maxTime = Math.max(maxTime, c.startedAt + c.estimatedMinutes * 60 * 1000);
    }
  }
  const span = Math.max(maxTime - minTime, 60 * 60 * 1000);

  const agentList = [...agents.values()].filter(
    (a) => a.id !== "agent-resources" && a.id !== "hermes" && a.id !== "wizard",
  );

  const goalCards = cards.filter((c) => c.type === "goal");

  const fmtTime = (t: number) => {
    const d = new Date(t);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const hourStep = span < 6 * 60 * 60 * 1000 ? 1 : span < 24 * 60 * 60 * 1000 ? 2 : 6;
  const timeMarks: number[] = [];
  for (let t = Math.floor(minTime / (hourStep * 60 * 60 * 1000)) * (hourStep * 60 * 60 * 1000); t <= maxTime; t += hourStep * 60 * 60 * 1000) {
    timeMarks.push(t);
  }

  const nowPct = ((now - minTime) / span) * 100;

  const renderBar = (c: TaskCard) => {
    const start = c.startedAt ?? now;
    const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
    const end = c.dueDate ?? start + duration;
    const left = ((start - minTime) / span) * 100;
    const width = Math.max(((end - start) / span) * 100, 2);
    const phase = c.phase ?? "implementation";
    const color = PHASE_COLORS[phase] ?? PHASE_COLORS.implementation;
    return (
      <div
        key={c.id}
        className="absolute top-1 h-5 rounded text-[10px] font-semibold text-white px-1.5 flex items-center overflow-hidden whitespace-nowrap cursor-pointer hover:z-10 hover:shadow-lg transition-shadow"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: `${color}40`, borderLeft: `3px solid ${color}` }}
        title={c.title}
      >
        {c.title.slice(0, 30)}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <BarChart3 size={20} className="text-accent" />
        <h2 className="text-xl font-semibold text-gray-200">Gantt Chart</h2>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs">
          {(Object.keys(PHASE_COLORS) as string[]).map((p) => (
            <span key={p} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: PHASE_COLORS[p] }} />
              <span className="text-muted capitalize">{p}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {/* Time axis */}
        <div className="relative h-6 mb-2 border-b border-border">
          {timeMarks.map((t) => {
            const pct = ((t - minTime) / span) * 100;
            return (
              <div key={t} className="absolute bottom-1 text-[10px] text-muted -translate-x-1/2" style={{ left: `${pct}%` }}>
                {fmtTime(t)}
              </div>
            );
          })}
          <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${nowPct}%` }}>
            <span className="absolute -top-0 -translate-x-1/2 text-[9px] font-bold text-red-500">NOW</span>
          </div>
        </div>

        {/* Agent rows */}
        <div className="space-y-1">
          {agentList.map((agent) => {
            const agentCards = cards.filter((c) => c.assignedAgentId === agent.id && c.type !== "goal" && c.type !== "chat");
            return (
              <div key={agent.id} className="flex items-center gap-2">
                <div className="w-24 text-xs font-medium text-gray-400 truncate text-right">{agent.name}</div>
                <div className="relative flex-1 h-7 bg-bg-card rounded border border-border">
                  {agentCards.map(renderBar)}
                </div>
              </div>
            );
          })}

          {/* Unassigned */}
          {cards.filter((c) => !c.assignedAgentId && c.type !== "goal" && c.type !== "chat" && c.status !== "done").length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 text-xs font-medium text-muted text-right">Unassigned</div>
              <div className="relative flex-1 h-7 bg-bg-card rounded border border-border border-dashed">
                {cards.filter((c) => !c.assignedAgentId && c.type !== "goal" && c.type !== "chat" && c.status !== "done").map(renderBar)}
              </div>
            </div>
          )}

          {/* Milestones */}
          {goalCards.length > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <div className="w-24 text-xs font-medium text-amber-400 text-right">Milestones</div>
              <div className="relative flex-1 h-7">
                {goalCards.map((c) => {
                  const pct = c.dueDate ? ((c.dueDate - minTime) / span) * 100 : ((c.createdAt - minTime) / span) * 100;
                  return (
                    <div key={c.id} className="absolute top-1 text-amber-400 -translate-x-1/2 cursor-pointer" style={{ left: `${pct}%` }} title={c.title}>
                      ◆
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
