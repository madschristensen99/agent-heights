import { useEffect } from "react";
import { useDashboard } from "../lib/store";
import { ArrowLeft, Brain } from "lucide-react";

interface MemoryViewerProps {
  agentId: string;
  onBack: () => void;
}

export function MemoryViewer({ agentId, onBack }: MemoryViewerProps) {
  const { agents, agentMemory, send } = useDashboard();
  const agent = agents.get(agentId);
  const memory = agentMemory.get(agentId);

  useEffect(() => {
    send({ type: "agent_memory_request", agentId });
  }, [agentId, send]);

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Agent not found</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <Brain size={20} className="text-muted" />
        <h2 className="text-lg font-semibold text-gray-200">{agent.name} — Memory</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {!memory ? (
          <div className="flex items-center text-muted text-sm">
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
            Loading conversation memory...
          </div>
        ) : memory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Brain size={48} className="mb-4 opacity-50" />
            <p>No conversation history yet</p>
            <p className="text-xs mt-1">Memory will appear after the agent processes tasks</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {memory.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" || msg.role === "human" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    msg.role === "user" || msg.role === "human"
                      ? "bg-accent/10 border border-accent/30"
                      : msg.role === "assistant"
                        ? "bg-bg-card border border-border"
                        : "bg-bg-hover border border-border"
                  }`}
                >
                  <div className="text-xs text-muted mb-1 uppercase tracking-wider">{msg.role}</div>
                  <div className="text-sm text-gray-300 whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
