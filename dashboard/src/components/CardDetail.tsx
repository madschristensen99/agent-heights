import { useState } from "react";
import { useDashboard } from "../lib/store";
import type { TaskCard, TaskPhase, CardStatus, CompletionCriterion, DecompositionScore } from "../../shared/types";
// CompletionCriterion is used via card.completionCriteria which is typed from TaskCard
import { X, Trash2, Plus, Link2, Unlink, Calendar, Clock, GitBranch, Award, ChevronRight } from "lucide-react";
import { IconCheck, IconCircle, MedalIcon } from "./Icons";

const PHASES: TaskPhase[] = ["requirements", "design", "implementation", "verification", "done"];

const PHASE_COLORS: Record<string, string> = {
  requirements: "#a78bfa",
  design: "#f9ca24",
  implementation: "#68a063",
  verification: "#3a8cd4",
  done: "#3b82f6",
};

const STATUSES: { status: CardStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "in_progress", label: "In Progress" },
  { status: "review_pending", label: "Review" },
  { status: "done", label: "Done" },
  { status: "paused", label: "Paused" },
];

const GRADE_COLORS: Record<string, string> = {
  S: "text-amber-400",
  A: "text-green-400",
  B: "text-blue-400",
  C: "text-yellow-400",
  D: "text-red-400",
};

interface CardDetailProps {
  cardId: string;
  onClose: () => void;
}

export function CardDetail({ cardId, onClose }: CardDetailProps) {
  const { board, agents, dependencies, decompositionScores, elegantSolutions, send } = useDashboard();
  const card = board.find((c) => c.id === cardId);

  const [newCriterion, setNewCriterion] = useState("");
  const [depSelectId, setDepSelectId] = useState("");
  const [subtaskSelectId, setSubtaskSelectId] = useState("");

  if (!card) {
    return (
      <div className="card-detail-panel">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm text-muted">Card not found</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-muted"><X size={18} /></button>
        </div>
      </div>
    );
  }

  const agentList = [...agents.values()].filter((a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard");
  const isGoal = card.type === "goal";
  const phase = card.phase ?? "implementation";
  const phaseColor = PHASE_COLORS[phase] ?? PHASE_COLORS.implementation;

  const cardDeps = dependencies.filter((d) => d.type === "depends_on" && d.to === card.id);
  const cardDepCards = cardDeps.map((d) => board.find((c) => c.id === d.from)).filter(Boolean) as TaskCard[];
  const subtasks = isGoal ? board.filter((c) => c.parentGoalId === card.id) : [];
  const parentGoal = card.parentGoalId ? board.find((c) => c.id === card.parentGoalId) : null;
  const availableCards = board.filter((c) => c.id !== card.id && c.type !== "chat");
  const availableSubtasks = board.filter((c) => c.id !== card.id && !c.parentGoalId && c.type !== "goal" && c.type !== "chat");

  const score = decompositionScores.get(card.id) ?? card.decompositionScore;
  const elegant = elegantSolutions.get(card.id);

  const fmtDate = (t: number | null | undefined) => {
    if (!t) return "";
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };


  const handleSetDueDate = (value: string) => {
    const ts = value ? new Date(value).getTime() : null;
    send({ type: "set_due_date", cardId: card.id, dueDate: ts });
  };

  const handleSetEstimate = (value: string) => {
    const min = value ? parseInt(value, 10) : null;
    send({ type: "set_estimate", cardId: card.id, estimatedMinutes: min });
  };

  const handleAdvancePhase = () => {
    send({ type: "advance_phase", cardId: card.id });
  };

  const handleSetPhase = (p: TaskPhase) => {
    send({ type: "set_phase", cardId: card.id, phase: p });
  };

  const handleAddCriterion = () => {
    if (newCriterion.trim()) {
      send({ type: "add_criterion", cardId: card.id, text: newCriterion.trim() });
      setNewCriterion("");
    }
  };

  const handleToggleCriterion = (cr: CompletionCriterion) => {
    send({ type: "toggle_criterion", cardId: card.id, criterionId: cr.id });
  };

  const handleRemoveCriterion = (cr: CompletionCriterion) => {
    send({ type: "remove_criterion", cardId: card.id, criterionId: cr.id });
  };

  const handleAddDependency = () => {
    if (depSelectId) {
      send({ type: "set_card_dependency", cardId: card.id, dependsOnCardId: depSelectId });
      setDepSelectId("");
    }
  };

  const handleRemoveDependency = (depId: string) => {
    send({ type: "remove_card_dependency", cardId: card.id, dependsOnCardId: depId });
  };

  const handleLinkSubtask = () => {
    if (subtaskSelectId) {
      send({ type: "link_subtask", parentGoalId: card.id, subtaskCardId: subtaskSelectId });
      setSubtaskSelectId("");
    }
  };

  const handleScoreDecomposition = () => {
    send({ type: "score_decomposition", goalCardId: card.id });
  };

  const handleDelete = () => {
    if (confirm(`Delete "${card.title}"?`)) {
      send({ type: "delete_card", cardId: card.id });
      onClose();
    }
  };

  return (
    <div className="card-detail-overlay" onClick={onClose}>
      <div className="card-detail-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {isGoal && <span className="text-amber-400 text-lg">◆</span>}
            <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded" style={{ color: phaseColor, backgroundColor: `${phaseColor}20` }}>
              {phase}
            </span>
            <span className="text-xs text-muted">{card.type ?? "task"}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-muted hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Title */}
          <div>
            <h2 className="text-base font-semibold text-gray-200">{card.title}</h2>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-muted block mb-1">Description</label>
            <p className="text-sm text-gray-400 min-h-[1.5rem]">
              {card.description || "No description"}
            </p>
          </div>

          {/* Status & Assignment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted block mb-1">Status</label>
              <select
                value={card.status}
                onChange={(e) => send({ type: "move_card", cardId: card.id, status: e.target.value as CardStatus })}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              >
                {STATUSES.map((s) => (
                  <option key={s.status} value={s.status}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Assigned Agent</label>
              <select
                value={card.assignedAgentId ?? ""}
                onChange={(e) => send({ type: "assign_card", cardId: card.id, agentId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              >
                <option value="">Unassigned</option>
                {agentList.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Scheduling */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted flex items-center gap-1 mb-1"><Calendar size={12} /> Due Date</label>
              <input
                type="datetime-local"
                value={fmtDate(card.dueDate)}
                onChange={(e) => handleSetDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted flex items-center gap-1 mb-1"><Clock size={12} /> Est. Minutes</label>
              <input
                type="number"
                value={card.estimatedMinutes ?? ""}
                onChange={(e) => handleSetEstimate(e.target.value)}
                placeholder="30"
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
            </div>
          </div>

          {card.actualMinutes != null && (
            <div className="text-xs text-muted">
              Actual duration: <span className="text-gray-300">{card.actualMinutes} min</span>
            </div>
          )}

          {/* V-Model Phase */}
          <div>
            <label className="text-xs text-muted flex items-center gap-1 mb-2"><GitBranch size={12} /> V-Model Phase</label>
            <div className="flex items-center gap-2">
              <select
                value={phase}
                onChange={(e) => handleSetPhase(e.target.value as TaskPhase)}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <button
                onClick={handleAdvancePhase}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-300 hover:border-accent hover:text-accent"
              >
                Advance <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Completion Criteria */}
          <div>
            <label className="text-xs text-muted block mb-2">Completion Criteria</label>
            {card.completionCriteria && card.completionCriteria.length > 0 ? (
              <div className="space-y-1 mb-2">
                {card.completionCriteria.map((cr) => (
                  <div key={cr.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => handleToggleCriterion(cr)}
                      className={`text-sm ${cr.checked ? "text-green-400" : "text-muted hover:text-gray-300"}`}
                    >
                      {cr.checked ? <IconCheck size={14} className="inline-block" /> : <IconCircle size={14} className="inline-block" />}
                    </button>
                    <span className={`text-sm flex-1 ${cr.checked ? "text-green-400 line-through opacity-70" : "text-gray-300"}`}>
                      {cr.text}
                    </span>
                    <button
                      onClick={() => handleRemoveCriterion(cr)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-status-error"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted italic mb-2">No criteria set</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCriterion()}
                placeholder="Add criterion..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
              />
              <button
                onClick={handleAddCriterion}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent text-bg text-xs font-medium hover:bg-accent-hover"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Dependencies */}
          <div>
            <label className="text-xs text-muted flex items-center gap-1 mb-2"><Link2 size={12} /> Dependencies (this card waits for)</label>
            {cardDepCards.length > 0 ? (
              <div className="space-y-1 mb-2">
                {cardDepCards.map((dep) => (
                  <div key={dep.id} className="flex items-center gap-2 group">
                    <span className="text-xs text-gray-300 flex-1 truncate">{dep.title}</span>
                    <button
                      onClick={() => handleRemoveDependency(dep.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-status-error"
                    >
                      <Unlink size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted italic mb-2">No dependencies</p>
            )}
            <div className="flex gap-2">
              <select
                value={depSelectId}
                onChange={(e) => setDepSelectId(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
              >
                <option value="">Select card...</option>
                {availableCards.map((c) => (
                  <option key={c.id} value={c.id}>{c.title.slice(0, 40)}</option>
                ))}
              </select>
              <button
                onClick={handleAddDependency}
                disabled={!depSelectId}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent text-bg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Goal/Subtask Relationships */}
          {isGoal && (
            <div>
              <label className="text-xs text-muted flex items-center gap-1 mb-2"><Award size={12} /> Linked Subtasks</label>
              {subtasks.length > 0 ? (
                <div className="space-y-1 mb-2">
                  {subtasks.map((st) => (
                    <div key={st.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-300 flex-1 truncate">{st.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${st.status === "done" ? "bg-green-500/20 text-green-400" : "bg-bg-hover text-muted"}`}>
                        {st.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted italic mb-2">No subtasks linked</p>
              )}
              <div className="flex gap-2">
                <select
                  value={subtaskSelectId}
                  onChange={(e) => setSubtaskSelectId(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
                >
                  <option value="">Select card...</option>
                  {availableSubtasks.map((c) => (
                    <option key={c.id} value={c.id}>{c.title.slice(0, 40)}</option>
                  ))}
                </select>
                <button
                  onClick={handleLinkSubtask}
                  disabled={!subtaskSelectId}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-accent text-bg text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  <Link2 size={12} /> Link
                </button>
              </div>
            </div>
          )}

          {parentGoal && (
            <div className="text-xs text-muted">
              Parent goal: <span className="text-amber-400">{parentGoal.title}</span>
            </div>
          )}

          {/* Decomposition Score (goal cards only) */}
          {isGoal && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted flex items-center gap-1"><Award size={12} /> Decomposition Score</label>
                <button
                  onClick={handleScoreDecomposition}
                  className="text-xs px-2 py-1 rounded-lg bg-bg-input border border-border text-gray-300 hover:border-accent hover:text-accent"
                >
                  Score Now
                </button>
              </div>
              {score ? (
                <div className="bg-bg-card border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-2xl font-bold ${GRADE_COLORS[score.grade] ?? "text-gray-300"}`}>{score.grade}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-200">{score.overall}/100</div>
                      <div className="text-[10px] text-muted">{score.summary}</div>
                    </div>
                    {elegant && (
                      <span className="text-lg">
                        <MedalIcon tier={elegant.tier} size={18} className="inline-block" />
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <ScoreBar label="Coverage" value={score.coverage} />
                    <ScoreBar label="Parallel" value={score.parallelism} />
                    <ScoreBar label="Depth" value={score.dependencyDepth} />
                    <ScoreBar label="Granularity" value={score.granularity} />
                    <ScoreBar label="Execution" value={score.executionSuccess} />
                    <div className="text-muted">
                      <div>Subtasks: {score.subtaskCount}</div>
                      <div>Rework: {score.reworkCount}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted italic">Not scored yet. Click "Score Now" after subtasks complete.</p>
              )}
            </div>
          )}

          {/* Progress */}
          {card.progress != null && card.progress > 0 && (
            <div>
              <label className="text-xs text-muted block mb-1">Progress: {card.progress}%</label>
              <div className="h-2 bg-bg-input rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${card.progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer — Danger Zone */}
        <div className="p-4 border-t border-border">
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 text-xs text-muted hover:text-status-error"
          >
            <Trash2 size={14} /> Delete Card
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div>
      <div className="text-muted mb-0.5">{label}</div>
      <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <div className="text-gray-400 mt-0.5">{value}</div>
    </div>
  );
}
