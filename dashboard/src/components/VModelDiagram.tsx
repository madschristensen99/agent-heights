import { useDashboard } from "../lib/store";
import type { TaskCard, TaskPhase } from "../../shared/types";
import { GitBranch } from "lucide-react";

const PHASES: TaskPhase[] = ["requirements", "design", "implementation", "verification", "done"];

const PHASE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  requirements: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "border-[#a78bfa]" },
  design: { color: "#f9ca24", bg: "rgba(249,202,36,0.1)", border: "border-[#f9ca24]" },
  implementation: { color: "#68a063", bg: "rgba(104,160,99,0.1)", border: "border-[#68a063]" },
  verification: { color: "#3a8cd4", bg: "rgba(58,140,212,0.1)", border: "border-[#3a8cd4]" },
  done: { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "border-[#3b82f6]" },
};

export function VModelDiagram() {
  const { board, agents } = useDashboard();

  const cards = [...board].sort((a, b) => a.createdAt - b.createdAt);
  const agentName = (id: string | null) => id ? agents.get(id)?.name ?? "?" : "—";

  const cardsByPhase = new Map<TaskPhase, TaskCard[]>();
  for (const p of PHASES) cardsByPhase.set(p, []);
  for (const c of cards) {
    const phase = c.phase ?? "implementation";
    if (cardsByPhase.has(phase)) cardsByPhase.get(phase)!.push(c);
    else cardsByPhase.get("implementation")!.push(c);
  }

  const renderCard = (c: TaskCard) => {
    const phase = c.phase ?? "implementation";
    const style = PHASE_STYLES[phase] ?? PHASE_STYLES.implementation;
    const isGoal = c.type === "goal";
    const gateIcon = c.status === "done" ? "✓" : c.status === "review_pending" ? "⊘" : "→";
    const gateColor = c.status === "done" ? "text-green-400" : c.status === "review_pending" ? "text-red-400" : "text-muted";

    return (
      <div
        key={c.id}
        className={`rounded-lg p-2.5 border-l-2 ${style.border} group cursor-pointer hover:bg-bg-hover transition-colors`}
        style={{ backgroundColor: style.bg }}
        title={c.description ?? c.title}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-200 flex-1 truncate">
            {isGoal && <span className="text-amber-400 mr-1">◆</span>}
            {c.title.slice(0, 50)}
          </span>
          <span className={`text-sm font-bold ${gateColor} flex-shrink-0`}>{gateIcon}</span>
        </div>
        <div className="text-[10px] text-muted mt-0.5">{agentName(c.assignedAgentId)}</div>
        {c.completionCriteria && c.completionCriteria.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {c.completionCriteria.map((cr) => (
              <div key={cr.id} className={`text-[10px] ${cr.checked ? "text-green-400 line-through opacity-70" : "text-gray-300"}`}>
                {cr.checked ? "✓" : "○"} {cr.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const count = (p: TaskPhase) => cardsByPhase.get(p)?.length ?? 0;

  const PhaseColumn = ({ phase, label }: { phase: TaskPhase; label: string }) => {
    const style = PHASE_STYLES[phase];
    const items = cardsByPhase.get(phase) ?? [];
    const active = count(phase) > 0;
    const borderClass = active ? style.border : "border-border";
    return (
      <div
        className={`w-full max-w-md rounded-lg border-2 ${borderClass} p-3 transition-opacity`}
        style={{ opacity: active ? 1 : 0.4 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: style.color }}>{label}</h3>
          <span className="text-[10px] bg-bg-hover px-2 py-0.5 rounded-full text-gray-300">{count(phase)}</span>
        </div>
        <div className="space-y-1.5">
          {items.length > 0 ? items.map(renderCard) : <div className="text-[10px] text-muted italic py-2">No tasks</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <GitBranch size={20} className="text-accent" />
        <h2 className="text-xl font-semibold text-gray-200">V-Model Lifecycle</h2>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-green-400"><span>✓</span> Gate Passed</span>
          <span className="flex items-center gap-1 text-red-400"><span>⊘</span> Gate Blocked</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="flex gap-10 min-h-full">
          {/* Left side: descending */}
          <div className="flex-1 flex flex-col items-center gap-0">
            <PhaseColumn phase="requirements" label="Requirements" />
            <div className="w-px h-5 bg-border" />
            <div className="text-[10px] text-muted -mt-2">▼</div>
            <PhaseColumn phase="design" label="Design" />
            <div className="w-px h-5 bg-border" />
            <div className="text-[10px] text-muted -mt-2">▼</div>
            <PhaseColumn phase="implementation" label="Implementation" />
          </div>

          {/* Bottom connector */}
          <div className="w-10 h-px bg-border self-end mb-16" />

          {/* Right side: ascending */}
          <div className="flex-1 flex flex-col items-center gap-0">
            <PhaseColumn phase="done" label="Done" />
            <div className="w-px h-5 bg-border" />
            <div className="text-[10px] text-muted -mt-2">▲</div>
            <PhaseColumn phase="verification" label="Verification" />
            <div className="w-px h-5 bg-border" />
            <div className="text-[10px] text-muted -mt-2">▲</div>
            <div className="w-full max-w-md rounded-lg border-2 border-border p-3 opacity-30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">↕ Implementation</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
