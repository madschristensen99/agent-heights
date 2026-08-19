import { useState, useMemo } from "react";
import { useDashboard } from "../lib/store";
import type { TaskCard, CardStatus } from "../../shared/types";
import { Plus, Trash2, User, Search, Target, ChevronDown, ChevronRight, Link2 } from "lucide-react";

const COLUMNS: { status: CardStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "border-l-muted" },
  { status: "in_progress", label: "In Progress", color: "border-l-status-thinking" },
  { status: "review_pending", label: "Review", color: "border-l-accent" },
  { status: "done", label: "Done", color: "border-l-status-done" },
  { status: "paused", label: "Paused", color: "border-l-muted" },
];

interface TaskBoardProps {
  onSelectCard?: (id: string) => void;
}

export function TaskBoard({ onSelectCard }: TaskBoardProps) {
  const { board, agents, send } = useDashboard();
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"card" | "goal">("card");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterPhase, setFilterPhase] = useState("");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<CardStatus | null>(null);
  const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());

  const filteredBoard = useMemo(() => {
    return board.filter((c) => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.description.toLowerCase().includes(search.toLowerCase()))
        return false;
      if (filterAgent && c.assignedAgentId !== filterAgent)
        return false;
      if (filterPhase && (c.phase ?? "implementation") !== filterPhase)
        return false;
      return true;
    });
  }, [board, search, filterAgent, filterPhase]);

  const handleCreate = () => {
    if (title.trim()) {
      if (createMode === "goal") {
        send({ type: "create_goal", title: title.trim(), description: description.trim() || undefined });
      } else {
        send({ type: "create_card", title: title.trim(), description: description.trim() || undefined });
      }
      setTitle("");
      setDescription("");
      setShowCreate(false);
    }
  };

  const handleMoveCard = (cardId: string, status: CardStatus) => {
    send({ type: "move_card", cardId, status });
  };

  const handleDeleteCard = (cardId: string) => {
    send({ type: "delete_card", cardId });
  };

  const handleAssignCard = (cardId: string, agentId: string) => {
    send({ type: "assign_card", cardId, agentId });
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCardId(cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, status: CardStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  };

  const handleDrop = (e: React.DragEvent, status: CardStatus) => {
    e.preventDefault();
    if (draggedCardId) {
      handleMoveCard(draggedCardId, status);
    }
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCol(null);
  };

  const toggleGoal = (goalId: string) => {
    setCollapsedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  };

  const agentList = [...agents.values()];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-200">Task Board</h2>
        <div className="flex-1" />
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateMode("card"); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
        >
          <Plus size={16} /> New Card
        </button>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateMode("goal"); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-300 hover:border-accent hover:text-accent"
        >
          <Target size={16} /> New Goal
        </button>
      </div>

      {showCreate && (
        <div className="px-6 py-3 bg-bg-card border-b border-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`px-2 py-0.5 rounded-full ${createMode === "goal" ? "bg-amber-500/20 text-amber-400" : "bg-accent/20 text-accent"}`}>
              {createMode === "goal" ? "◆ Goal" : "Task"}
            </span>
          </div>
          <input
            type="text"
            placeholder={`${createMode === "goal" ? "Goal" : "Card"} title...`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full px-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full px-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
          >
            Create {createMode === "goal" ? "Goal" : "Card"}
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search size={14} className="text-muted" />
          <input
            type="text"
            placeholder="Search cards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-2 py-1 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
          />
        </div>
        <select
          value={filterAgent}
          onChange={(e) => setFilterAgent(e.target.value)}
          className="px-2 py-1 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
        >
          <option value="">All agents</option>
          {agentList.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <select
          value={filterPhase}
          onChange={(e) => setFilterPhase(e.target.value)}
          className="px-2 py-1 rounded-lg bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
        >
          <option value="">All phases</option>
          <option value="requirements">Requirements</option>
          <option value="design">Design</option>
          <option value="implementation">Implementation</option>
          <option value="verification">Verification</option>
          <option value="done">Done</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid grid-cols-5 gap-4 min-h-full">
          {COLUMNS.map((col) => {
            const colCards = filteredBoard.filter((c) => c.status === col.status);
            const goalCards = colCards.filter((c) => c.type === "goal");
            const standaloneCards = colCards.filter((c) => c.type !== "goal" && !c.parentGoalId);
            const subtaskCards = colCards.filter((c) => c.parentGoalId);

            return (
              <div
                key={col.status}
                className={`flex flex-col rounded-lg transition-colors ${dragOverCol === col.status ? "bg-accent/5" : ""}`}
                onDragOver={(e) => handleDragOver(e, col.status)}
                onDrop={(e) => handleDrop(e, col.status)}
              >
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">{col.label}</h3>
                  <span className="text-xs text-muted bg-bg-card px-2 py-0.5 rounded-full">{colCards.length}</span>
                </div>
                <div className="space-y-2 flex-1">
                  {/* Goal cards with subtask grouping */}
                  {goalCards.map((goal) => {
                    const goalSubtasks = subtaskCards.filter((c) => c.parentGoalId === goal.id);
                    const isCollapsed = collapsedGoals.has(goal.id);
                    return (
                      <div key={goal.id}>
                        <CardItem
                          card={goal}
                          agents={agentList}
                          onMove={handleMoveCard}
                          onDelete={handleDeleteCard}
                          onAssign={handleAssignCard}
                          onSelect={onSelectCard}
                          onDragStart={(e) => handleDragStart(e, goal.id)}
                          onDragEnd={handleDragEnd}
                          isGoal
                          toggleCollapse={() => toggleGoal(goal.id)}
                          isCollapsed={isCollapsed}
                          subtaskCount={goalSubtasks.length}
                        />
                        {!isCollapsed && goalSubtasks.length > 0 && (
                          <div className="ml-4 mt-1 space-y-1.5 border-l-2 border-amber-500/20 pl-2">
                            {goalSubtasks.map((st) => (
                              <CardItem
                                key={st.id}
                                card={st}
                                agents={agentList}
                                onMove={handleMoveCard}
                                onDelete={handleDeleteCard}
                                onAssign={handleAssignCard}
                                onSelect={onSelectCard}
                                onDragStart={(e) => handleDragStart(e, st.id)}
                                onDragEnd={handleDragEnd}
                                isSubtask
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* Standalone cards */}
                  {standaloneCards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      agents={agentList}
                      onMove={handleMoveCard}
                      onDelete={handleDeleteCard}
                      onAssign={handleAssignCard}
                      onSelect={onSelectCard}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                  {/* Orphan subtasks (parent not in this column) */}
                  {subtaskCards.filter((c) => !goalCards.some((g) => g.id === c.parentGoalId)).map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      agents={agentList}
                      onMove={handleMoveCard}
                      onDelete={handleDeleteCard}
                      onAssign={handleAssignCard}
                      onSelect={onSelectCard}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                      isSubtask
                    />
                  ))}
                  {colCards.length === 0 && (
                    <div
                      className="text-xs text-muted text-center py-8 border border-dashed border-border rounded-lg"
                      onDragOver={(e) => handleDragOver(e, col.status)}
                      onDrop={(e) => handleDrop(e, col.status)}
                    >
                      No cards
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CardItemProps {
  card: TaskCard;
  agents: { id: string; name: string }[];
  onMove: (cardId: string, status: CardStatus) => void;
  onDelete: (cardId: string) => void;
  onAssign: (cardId: string, agentId: string) => void;
  onSelect?: (id: string) => void;
  onDragStart?: (e: React.DragEvent, cardId: string) => void;
  onDragEnd?: () => void;
  isGoal?: boolean;
  isSubtask?: boolean;
  toggleCollapse?: () => void;
  isCollapsed?: boolean;
  subtaskCount?: number;
}

function CardItem({
  card,
  agents,
  onMove,
  onDelete,
  onAssign,
  onSelect,
  onDragStart,
  onDragEnd,
  isGoal,
  isSubtask,
  toggleCollapse,
  isCollapsed,
  subtaskCount,
}: CardItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const assignedAgent = agents.find((a) => a.id === card.assignedAgentId);
  const depCount = card.dependsOnCardIds?.length ?? 0;

  return (
    <div
      className={`bg-bg-card border border-border rounded-lg p-3 group cursor-pointer hover:border-border-hover transition-all ${
        isGoal ? "border-l-2 border-l-amber-500/50" : ""
      } ${isSubtask ? "py-2" : ""}`}
      onClick={() => {
        if (isGoal && toggleCollapse) {
          setShowMenu(false);
          if (onSelect) onSelect(card.id);
        } else if (onSelect) {
          onSelect(card.id);
        } else {
          setShowMenu(!showMenu);
        }
      }}
      draggable={!!onDragStart}
      onDragStart={(e) => onDragStart?.(e, card.id)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-200 flex-1 flex items-center gap-1.5">
          {isGoal && toggleCollapse && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleCollapse(); }}
              className="text-muted hover:text-gray-300"
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {isGoal && <span className="text-amber-400 text-xs">◆</span>}
          {isSubtask && <span className="text-muted text-[10px]">↳</span>}
          <span className="truncate">{card.title}</span>
          {card.category && card.category !== "general" && (
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted bg-bg-input px-1.5 py-0.5 rounded">
              {card.category}
            </span>
          )}
        </h4>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
          className="opacity-0 group-hover:opacity-100 text-muted hover:text-status-error p-1"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {card.description && !isSubtask && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{card.description}</p>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {assignedAgent ? (
          <span className="flex items-center gap-1 text-xs text-accent">
            <User size={12} /> {assignedAgent.name}
          </span>
        ) : (
          <span className="text-xs text-muted">Unassigned</span>
        )}
        {card.progress !== undefined && card.progress > 0 && (
          <span className="text-xs text-muted">{card.progress}%</span>
        )}
        {depCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-muted" title={`${depCount} dependency${depCount > 1 ? "ies" : ""}`}>
            <Link2 size={10} /> {depCount}
          </span>
        )}
        {isGoal && subtaskCount != null && subtaskCount > 0 && (
          <span className="text-xs text-amber-400/70">{subtaskCount} subtasks</span>
        )}
        {card.phase && card.phase !== "implementation" && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-input text-muted capitalize">{card.phase}</span>
        )}
      </div>

      {/* Progress bar */}
      {card.progress !== undefined && card.progress > 0 && (
        <div className="mt-2 h-1 bg-bg-input rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${card.progress}%` }} />
        </div>
      )}

      {showMenu && !onSelect && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          <div>
            <label className="text-xs text-muted block mb-1">Assign to</label>
            <select
              value={card.assignedAgentId ?? ""}
              onChange={(e) => e.target.value && onAssign(card.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-2 py-1.5 rounded bg-bg-input border border-border text-xs text-gray-200 outline-none focus:border-accent"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted block mb-1">Move to</label>
            <div className="flex gap-1">
              {COLUMNS.map((col) => (
                <button
                  key={col.status}
                  onClick={(e) => { e.stopPropagation(); onMove(card.id, col.status); setShowMenu(false); }}
                  className={`flex-1 px-2 py-1.5 rounded text-xs ${
                    card.status === col.status
                      ? "bg-accent text-bg"
                      : "bg-bg-input text-gray-300 hover:border-accent border border-border"
                  }`}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
