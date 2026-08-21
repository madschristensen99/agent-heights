import { useDashboard } from "../lib/store";
import type { TaskCard, TaskPhase } from "../../shared/types";
import { GitBranch, ChevronRight, AlertTriangle } from "lucide-react";
import { IconCheck, IconCross, IconBlocked, IconArrowRight, IconArrowUpDown, IconTriangleUp, IconCircle } from "./Icons";

const PHASES: TaskPhase[] = ["requirements", "design", "implementation", "verification", "done"];

const PHASE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  requirements: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "border-[#a78bfa]" },
  design: { color: "#f9ca24", bg: "rgba(249,202,36,0.1)", border: "border-[#f9ca24]" },
  implementation: { color: "#68a063", bg: "rgba(104,160,99,0.1)", border: "border-[#68a063]" },
  verification: { color: "#3a8cd4", bg: "rgba(58,140,212,0.1)", border: "border-[#3a8cd4]" },
  done: { color: "#3b82f6", bg: "rgba(59,130,246,0.1)", border: "border-[#3b82f6]" },
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-amber-400", A: "text-green-400", B: "text-blue-400", C: "text-yellow-400", D: "text-red-400",
};

interface VModelDiagramProps {
  onSelectCard?: (id: string) => void;
}

export function VModelDiagram({ onSelectCard }: VModelDiagramProps) {
  const { board, agents, phaseGates, capabilityGaps, decompositionScores, send } = useDashboard();

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
    const gateIcon = c.status === "done" ? <IconCheck size={14} className="inline-block" /> : c.status === "review_pending" ? <IconBlocked size={14} className="inline-block" /> : <IconArrowRight size={14} className="inline-block" />;
    const gateColor = c.status === "done" ? "text-green-400" : c.status === "review_pending" ? "text-red-400" : "text-muted";
    const score = decompositionScores.get(c.id) ?? c.decompositionScore;
    const cardPhaseGates = phaseGates.filter((g) => g.cardId === c.id);
    const lastGate = cardPhaseGates[cardPhaseGates.length - 1];

    return (
      <div
        key={c.id}
        className={`rounded-lg p-2.5 border-l-2 ${style.border} group cursor-pointer hover:bg-bg-hover transition-colors`}
        style={{ backgroundColor: style.bg }}
        title={c.description ?? c.title}
        onClick={() => onSelectCard?.(c.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-200 flex-1 truncate">
            {isGoal && <span className="text-amber-400 mr-1">◆</span>}
            {c.title.slice(0, 50)}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {score && (
              <span className={`text-[10px] font-bold ${GRADE_COLORS[score.grade] ?? "text-gray-300"}`} title={`Score: ${score.overall}/100`}>
                {score.grade}
              </span>
            )}
            {lastGate && (
              <span
                className={`text-[10px] ${lastGate.approved ? "text-green-400" : "text-red-400"}`}
                title={`Gate ${lastGate.approved ? "approved" : "blocked"} by ${lastGate.reviewerName}`}
              >
                {lastGate.approved ? <IconCheck size={12} className="inline-block" /> : <IconCross size={12} className="inline-block" />}
              </span>
            )}
            <span className={`text-sm font-bold ${gateColor}`}>{gateIcon}</span>
          </div>
        </div>
        <div className="text-[10px] text-muted mt-0.5 flex items-center gap-2">
          <span>{agentName(c.assignedAgentId)}</span>
          {c.progress != null && c.progress > 0 && <span>{c.progress}%</span>}
        </div>
        {c.completionCriteria && c.completionCriteria.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {c.completionCriteria.slice(0, 3).map((cr) => (
              <div key={cr.id} className={`text-[10px] ${cr.checked ? "text-green-400 line-through opacity-70" : "text-gray-300"}`}>
                {cr.checked ? <IconCheck size={10} className="inline-block" /> : <IconCircle size={10} className="inline-block" />} {cr.text}
              </div>
            ))}
            {c.completionCriteria.length > 3 && (
              <div className="text-[10px] text-muted">+{c.completionCriteria.length - 3} more</div>
            )}
          </div>
        )}
        {c.status !== "done" && phase !== "done" && (
          <button
            onClick={(e) => { e.stopPropagation(); send({ type: "advance_phase", cardId: c.id }); }}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-muted hover:text-accent opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight size={10} /> Advance Phase
          </button>
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
          <span className="flex items-center gap-1 text-green-400"><IconCheck size={12} className="inline-block" /> Gate Passed</span>
          <span className="flex items-center gap-1 text-red-400"><IconBlocked size={12} className="inline-block" /> Gate Blocked</span>
          {capabilityGaps.length > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              <AlertTriangle size={12} /> {capabilityGaps.length} Gap{capabilityGaps.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {capabilityGaps.length > 0 && (
        <div className="px-6 py-2 bg-yellow-500/5 border-b border-yellow-500/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">Capability Gaps</span>
          </div>
          <div className="space-y-1">
            {capabilityGaps.map((gap, i) => (
              <div key={i} className="text-xs text-gray-400">
                <span className="text-yellow-400 font-medium">{gap.skill}</span>
                <span className="text-muted mx-1">·</span>
                <span>required by {gap.requiredBy}</span>
                <span className="text-muted mx-1">·</span>
                <span className="text-gray-500">{gap.suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <div className="text-[10px] text-muted -mt-2"><IconTriangleUp size={10} className="inline-block" /></div>
            <PhaseColumn phase="verification" label="Verification" />
            <div className="w-px h-5 bg-border" />
            <div className="text-[10px] text-muted -mt-2"><IconTriangleUp size={10} className="inline-block" /></div>
            <div className="w-full max-w-md rounded-lg border-2 border-border p-3 opacity-30">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted"><IconArrowUpDown size={12} className="inline-block" /> Implementation</h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
