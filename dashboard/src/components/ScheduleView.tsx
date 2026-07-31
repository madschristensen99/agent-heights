import { useState } from "react";
import { useDashboard } from "../lib/store";
import { SCHEDULE_PRESETS } from "@shared/types";
import type { AgentSchedule } from "@shared/types";
import { Clock, Plus, Trash2, Play, Pause, Calendar } from "lucide-react";
import { formatTime, timeAgo } from "../lib/utils";

export function ScheduleView() {
  const { schedules, agents, send } = useDashboard();
  const [showCreate, setShowCreate] = useState(false);
  const [agentId, setAgentId] = useState("");
  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [cronPreset, setCronPreset] = useState(SCHEDULE_PRESETS[0].cron);
  const [customCron, setCustomCron] = useState("");

  const handleCreate = () => {
    if (!agentId || !name.trim() || !task.trim()) return;
    const cron = cronPreset === "__custom__" ? customCron : cronPreset;
    if (!cron) return;
    send({ type: "create_schedule", agentId, name: name.trim(), task: task.trim(), cronExpression: cron });
    setName("");
    setTask("");
    setShowCreate(false);
  };

  const handleToggle = (schedule: AgentSchedule) => {
    send({ type: "update_schedule", scheduleId: schedule.id, enabled: !schedule.enabled });
  };

  const handleDelete = (scheduleId: string) => {
    send({ type: "delete_schedule", scheduleId });
  };

  const cronValue = cronPreset === "__custom__" ? customCron : cronPreset;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <Clock size={20} className="text-muted" />
        <h2 className="text-xl font-semibold text-gray-200">Schedules</h2>
        <div className="flex-1" />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover"
        >
          <Plus size={16} /> New Schedule
        </button>
      </div>

      {showCreate && (
        <div className="px-6 py-3 bg-bg-card border-b border-border space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
            >
              <option value="">Select agent...</option>
              {[...agents.values()].map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Schedule name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
            />
          </div>
          <input
            type="text"
            placeholder="Task to run..."
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
          />
          <div className="flex gap-3">
            <select
              value={cronPreset}
              onChange={(e) => setCronPreset(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.cron} value={p.cron}>{p.label}</option>
              ))}
            </select>
            {cronPreset === "__custom__" && (
              <input
                type="text"
                placeholder="*/5 * * * *"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent font-mono"
              />
            )}
          </div>
          <button
            onClick={handleCreate}
            disabled={!agentId || !name.trim() || !task.trim() || !cronValue}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            Create Schedule
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Calendar size={48} className="mb-4 opacity-50" />
            <p className="text-lg">No schedules yet</p>
            <p className="text-sm mt-1">Create a schedule to run tasks automatically on a cron timer</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((s) => {
              const agent = agents.get(s.agentId);
              return (
                <div key={s.id} className="bg-bg-card border border-border rounded-lg p-4 flex items-center gap-4">
                  <button
                    onClick={() => handleToggle(s)}
                    className={`p-2 rounded-lg ${s.enabled ? "text-accent" : "text-muted"} hover:bg-bg-hover`}
                  >
                    {s.enabled ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-gray-200">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${s.enabled ? "bg-accent/20 text-accent" : "bg-muted/20 text-muted"}`}>
                        {s.enabled ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">{s.task}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      <span>{agent?.name ?? "Unknown agent"}</span>
                      <span className="font-mono">{s.cronExpression}</span>
                      <span>{s.runCount} runs</span>
                      {s.lastRunAt && <span>last {timeAgo(s.lastRunAt)}</span>}
                      {s.nextRunAt > 0 && <span>next {formatTime(s.nextRunAt)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-2 rounded-lg text-muted hover:text-status-error hover:bg-bg-hover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
