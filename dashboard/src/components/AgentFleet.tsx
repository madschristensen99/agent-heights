import { useState } from "react";
import { useDashboard } from "../lib/store";
import { statusColor, statusBg } from "../lib/utils";
import type { AgentInfo } from "../../shared/types";
import { Search, Square, MessageSquare, Users } from "lucide-react";

interface AgentFleetProps {
  onSelectAgent: (id: string) => void;
}

export function AgentFleet({ onSelectAgent }: AgentFleetProps) {
  const { agents, send } = useDashboard();
  const [search, setSearch] = useState("");
  const [showAssignAll, setShowAssignAll] = useState(false);
  const [assignAllTask, setAssignAllTask] = useState("");

  const agentList = [...agents.values()].filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    (a.task ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = [...agents.values()].reduce((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleStopAll = () => {
    send({ type: "stop_all" });
  };

  const handleAssignAll = () => {
    if (assignAllTask.trim()) {
      send({ type: "assign_all", task: assignAllTask.trim() });
      setAssignAllTask("");
      setShowAssignAll(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <h2 className="text-xl font-semibold text-gray-200">Agent Fleet</h2>
        <div className="flex items-center gap-3 text-xs">
          {Object.entries(statusCounts).map(([status, count]) => (
            <span key={status} className={`px-2 py-1 rounded-full ${statusBg(status)} ${statusColor(status)} font-medium`}>
              {count} {status}
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent w-64"
          />
        </div>
        <button
          onClick={() => setShowAssignAll(!showAssignAll)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-300 hover:border-accent transition-colors"
        >
          <Users size={16} /> Assign All
        </button>
        <button
          onClick={handleStopAll}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-status-error hover:border-status-error transition-colors"
        >
          <Square size={16} /> Stop All
        </button>
      </div>

      {showAssignAll && (
        <div className="px-6 py-3 bg-bg-card border-b border-border flex items-center gap-3">
          <input
            type="text"
            placeholder="Task for all agents..."
            value={assignAllTask}
            onChange={(e) => setAssignAllTask(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAssignAll()}
            className="flex-1 px-4 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
            autoFocus
          />
          <button
            onClick={handleAssignAll}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
          >
            Assign
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {agentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Users size={48} className="mb-4 opacity-50" />
            <p className="text-lg">No agents in your fleet</p>
            <p className="text-sm mt-1">Hire agents from the game or marketplace to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentList.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onSelect={() => onSelectAgent(agent.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentCard({ agent, onSelect }: { agent: AgentInfo; onSelect: () => void }) {
  const { send } = useDashboard();

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    send({ type: "stop", agentId: agent.id });
  };

  const handleChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <div
      onClick={onSelect}
      className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover cursor-pointer transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full ${statusBg(agent.status)} flex items-center justify-center text-sm font-bold ${statusColor(agent.status)}`}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-200 truncate">{agent.name}</h3>
            <span className={`text-xs ${statusColor(agent.status)}`}>{agent.status}</span>
          </div>
          <p className="text-xs text-muted mt-0.5">{agent.model}</p>
        </div>
      </div>

      <div className="mt-3">
        {agent.task ? (
          <p className="text-sm text-gray-400 line-clamp-2">{agent.task}</p>
        ) : (
          <p className="text-sm text-muted italic">No active task</p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">
          {agent.tasksDone > 0 ? `${agent.tasksDone} tasks done` : "No tasks yet"}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleChat}
            className="p-1.5 rounded hover:bg-bg-hover text-muted hover:text-accent"
            title="Open"
          >
            <MessageSquare size={14} />
          </button>
          {(agent.status === "thinking" || agent.status === "working") && (
            <button
              onClick={handleStop}
              className="p-1.5 rounded hover:bg-bg-hover text-muted hover:text-status-error"
              title="Stop"
            >
              <Square size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
