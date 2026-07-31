import { useState } from "react";
import { useDashboard } from "../lib/store";
import type { TaskCard, CardStatus } from "../../shared/types";
import { Plus, Trash2, User } from "lucide-react";

const COLUMNS: { status: CardStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "border-l-muted" },
  { status: "in_progress", label: "In Progress", color: "border-l-status-thinking" },
  { status: "done", label: "Done", color: "border-l-status-done" },
];

export function TaskBoard() {
  const { board, agents, send } = useDashboard();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = () => {
    if (title.trim()) {
      send({ type: "create_card", title: title.trim(), description: description.trim() || undefined });
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

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-200">Task Board</h2>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
        >
          <Plus size={16} /> New Card
        </button>
      </div>

      {showCreate && (
        <div className="px-6 py-3 bg-bg-card border-b border-border space-y-2">
          <input
            type="text"
            placeholder="Card title..."
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
            Create Card
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="grid grid-cols-3 gap-4 min-h-full">
          {COLUMNS.map((col) => {
            const cards = board.filter((c) => c.status === col.status);
            return (
              <div key={col.status} className="flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">{col.label}</h3>
                  <span className="text-xs text-muted bg-bg-card px-2 py-0.5 rounded-full">{cards.length}</span>
                </div>
                <div className="space-y-2 flex-1">
                  {cards.map((card) => (
                    <CardItem
                      key={card.id}
                      card={card}
                      agents={[...agents.values()]}
                      onMove={handleMoveCard}
                      onDelete={handleDeleteCard}
                      onAssign={handleAssignCard}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="text-xs text-muted text-center py-8 border border-dashed border-border rounded-lg">
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

function CardItem({
  card,
  agents,
  onMove,
  onDelete,
  onAssign,
}: {
  card: TaskCard;
  agents: { id: string; name: string }[];
  onMove: (cardId: string, status: CardStatus) => void;
  onDelete: (cardId: string) => void;
  onAssign: (cardId: string, agentId: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const assignedAgent = agents.find((a) => a.id === card.assignedAgentId);

  return (
    <div
      className="bg-bg-card border border-border rounded-lg p-3 group cursor-pointer hover:border-border-hover transition-colors"
      onClick={() => setShowMenu(!showMenu)}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium text-gray-200 flex-1">{card.title}</h4>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
          className="opacity-0 group-hover:opacity-100 text-muted hover:text-status-error p-1"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {card.description && (
        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{card.description}</p>
      )}

      <div className="mt-2 flex items-center gap-2">
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
      </div>

      {showMenu && (
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
