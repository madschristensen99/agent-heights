import { useDashboard } from "../lib/store";
import { Skull, RotateCcw, UserPlus } from "lucide-react";
import { timeAgo } from "../lib/utils";

export function FiredAgents() {
  const { firedAgents, vacationedAgents, send } = useDashboard();

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <Skull size={20} className="text-muted" />
        <h2 className="text-xl font-semibold text-gray-200">Fired & Vacationed Agents</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Fired ({firedAgents.length})</h3>
          {firedAgents.length === 0 ? (
            <p className="text-sm text-muted">No fired agents</p>
          ) : (
            <div className="space-y-2">
              {firedAgents.map((a) => (
                <div key={a.id} className="bg-bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-status-error/20 flex items-center justify-center text-sm font-bold text-status-error">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-200">{a.name}</h4>
                    <p className="text-xs text-muted mt-0.5">
                      {a.model} · {a.tasksDone} tasks · fired {timeAgo(a.firedAt)}
                    </p>
                    {a.lastTask && <p className="text-xs text-gray-400 mt-1 truncate">Last: {a.lastTask}</p>}
                  </div>
                  <button
                    onClick={() => send({ type: "recruit", firedAgentId: a.id })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent hover:text-accent"
                  >
                    <UserPlus size={14} /> Recruit
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">On Vacation ({vacationedAgents.length})</h3>
          {vacationedAgents.length === 0 ? (
            <p className="text-sm text-muted">No agents on vacation</p>
          ) : (
            <div className="space-y-2">
              {vacationedAgents.map((a) => (
                <div key={a.id} className="bg-bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-status-thinking/20 flex items-center justify-center text-sm font-bold text-status-thinking">
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-200">{a.name}</h4>
                    <p className="text-xs text-muted mt-0.5">
                      {a.model} · {a.tasksDone} tasks · vacationed {timeAgo(a.vacationedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => send({ type: "restore", agentId: a.id })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-input border border-border text-xs text-gray-300 hover:border-accent hover:text-accent"
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
