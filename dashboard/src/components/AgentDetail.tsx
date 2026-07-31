import { useState, useEffect, useRef } from "react";
import { useDashboard } from "../lib/store";
import { formatTime, logKindColor, statusColor, statusBg } from "../lib/utils";
import type { AgentInfo, LogEntry } from "../../shared/types";
import { ArrowLeft, Send, Square, Trash2, Terminal, Flame, Plane, FolderOpen, Brain, Wallet } from "lucide-react";

interface AgentDetailProps {
  agentId: string;
  onBack: () => void;
  onViewFiles?: (agentId: string) => void;
  onViewMemory?: (agentId: string) => void;
  onViewWallet?: (agentId: string) => void;
}

export function AgentDetail({ agentId, onBack, onViewFiles, onViewMemory, onViewWallet }: AgentDetailProps) {
  const { agents, getAgentLogs, send } = useDashboard();
  const agent = agents.get(agentId);
  const logs = getAgentLogs(agentId);
  const [chatText, setChatText] = useState("");
  const [taskText, setTaskText] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Agent not found</p>
      </div>
    );
  }

  const handleSendChat = () => {
    if (chatText.trim()) {
      send({ type: "chat", agentId, text: chatText.trim() });
      setChatText("");
    }
  };

  const handleAssign = () => {
    if (taskText.trim()) {
      send({ type: "assign", agentId, task: taskText.trim() });
      setTaskText("");
    }
  };

  const handleStop = () => {
    send({ type: "stop", agentId });
  };

  const handleClear = () => {
    send({ type: "clear", agentId });
  };

  const isWorking = agent.status === "thinking" || agent.status === "working";

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <div className={`w-10 h-10 rounded-full ${statusBg(agent.status)} flex items-center justify-center text-sm font-bold ${statusColor(agent.status)}`}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-200">{agent.name}</h2>
          <p className="text-xs text-muted">{agent.model} · {agent.provider}</p>
        </div>
        <span className={`text-sm font-medium ${statusColor(agent.status)}`}>{agent.status}</span>
        {isWorking && (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-status-error hover:border-status-error"
          >
            <Square size={14} /> Stop
          </button>
        )}
        <button
          onClick={handleClear}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-muted hover:text-gray-200"
        >
          <Trash2 size={14} /> Clear
        </button>
        <button
          onClick={() => send({ type: "vacation", agentId })}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-status-thinking hover:border-status-thinking"
          title="Send on vacation"
        >
          <Plane size={14} /> Vacation
        </button>
        <button
          onClick={() => {
            if (confirm(`Fire ${agent.name}? They will be sent to the Labyrinth.`)) {
              send({ type: "fire", agentId });
              onBack();
            }
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-status-error hover:border-status-error"
          title="Fire this agent"
        >
          <Flame size={14} /> Fire
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Assign a task to this agent..."
                value={taskText}
                onChange={(e) => setTaskText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAssign()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
              <button
                onClick={handleAssign}
                className="px-4 py-2.5 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
              >
                Assign Task
              </button>
            </div>
            {agent.task && (
              <p className="text-sm text-gray-400 mt-2">
                <span className="text-muted">Current: </span>
                {agent.task}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-auto px-6 py-4 font-mono text-sm space-y-1">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted">
                <Terminal size={40} className="mb-3 opacity-50" />
                <p>No logs yet</p>
                <p className="text-xs mt-1">Logs will appear here when the agent is working</p>
              </div>
            ) : (
              logs.map((entry, i) => <LogLine key={i} entry={entry} />)
            )}
            <div ref={logEndRef} />
          </div>

          <div className="px-6 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Send a message to this agent..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
              <button
                onClick={handleSendChat}
                className="p-2.5 rounded-lg bg-bg-input border border-border text-gray-300 hover:border-accent hover:text-accent"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="w-72 border-l border-border bg-bg-card overflow-auto p-4 space-y-4">
          <DetailSection title="Info">
            <DetailRow label="Role" value={agent.role} />
            <DetailRow label="Model" value={agent.model} />
            <DetailRow label="Provider" value={agent.provider} />
            <DetailRow label="Tasks Done" value={String(agent.tasksDone)} />
          </DetailSection>

          {agent.systemPrompt && (
            <DetailSection title="System Prompt">
              <p className="text-xs text-gray-400 whitespace-pre-wrap line-clamp-6">{agent.systemPrompt}</p>
            </DetailSection>
          )}

          {agent.mcpServers && agent.mcpServers.length > 0 && (
            <DetailSection title="MCP Servers">
              {agent.mcpServers.map((s, i) => (
                <div key={i} className="text-xs text-gray-400">
                  {s.name ?? s.url ?? s.command ?? "Unnamed"}
                </div>
              ))}
            </DetailSection>
          )}

          {(agent.cdpSolana || agent.crossmintWallet) && onViewWallet && (
            <button
              onClick={() => onViewWallet(agentId)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent hover:text-accent"
            >
              <Wallet size={14} /> View Wallet Details
            </button>
          )}

          {onViewFiles && (
            <button
              onClick={() => onViewFiles(agentId)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent hover:text-accent"
            >
              <FolderOpen size={14} /> Browse Files
            </button>
          )}

          {onViewMemory && (
            <button
              onClick={() => onViewMemory(agentId)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent hover:text-accent"
            >
              <Brain size={14} /> View Memory
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div className="flex gap-2 leading-relaxed">
      <span className="text-muted text-xs whitespace-nowrap pt-0.5">{formatTime(entry.ts)}</span>
      <span className={`text-xs font-medium uppercase ${logKindColor(entry.kind)} whitespace-nowrap pt-0.5`}>
        {entry.kind}
      </span>
      <span className={`text-xs ${logKindColor(entry.kind)} break-all`}>{entry.text}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted">{label}</span>
      <span className="text-gray-300">{value}</span>
    </div>
  );
}
