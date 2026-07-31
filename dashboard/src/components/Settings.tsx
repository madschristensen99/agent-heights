import { useDashboard } from "../lib/store";
import { Settings as SettingsIcon, Zap } from "lucide-react";

export function Settings() {
  const { settings, send, player } = useDashboard();

  if (!settings) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <SettingsIcon size={20} className="text-muted" />
        <h2 className="text-xl font-semibold text-gray-200">Settings</h2>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 max-w-2xl space-y-8">
        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Workspace</h3>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">Boss Name</label>
              <input
                type="text"
                defaultValue={player?.name ?? ""}
                onBlur={(e) => {
                  if (e.target.value.trim() && player) {
                    send({ type: "setup", player: { ...player, name: e.target.value.trim() } });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Workspace Name</label>
              <input
                type="text"
                defaultValue={player?.workspace ?? ""}
                onBlur={(e) => {
                  if (e.target.value.trim() && player) {
                    send({ type: "setup", player: { ...player, workspace: e.target.value.trim() } });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Agent Configuration</h3>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-4">
            <div>
              <label className="text-xs text-muted block mb-1">Max Iterations per Task</label>
              <input
                type="number"
                defaultValue={settings.cline.maxIterations}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val > 0) {
                    send({ type: "set_settings", settings: { ...settings, cline: { ...settings.cline, maxIterations: val } } });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-bg-input border border-border text-sm text-gray-200 outline-none focus:border-accent"
              />
              <p className="text-xs text-muted mt-1">Maximum reasoning steps an agent takes per task</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300">Auto-approve Commands</label>
                <p className="text-xs text-muted mt-0.5">Let agents run shell commands without approval prompts</p>
              </div>
              <button
                onClick={() => send({ type: "set_settings", settings: { ...settings, cline: { ...settings.cline, autoApproveCommands: !settings.cline.autoApproveCommands } } })}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.cline.autoApproveCommands ? "bg-accent" : "bg-border"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.cline.autoApproveCommands ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Integrations</h3>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-300">Railway MCP</label>
                <p className="text-xs text-muted mt-0.5">Enable Railway deployment tools for devops agents</p>
              </div>
              <button
                onClick={() => send({ type: "set_settings", settings: { ...settings, railway: { ...settings.railway, enabled: !settings.railway.enabled } } })}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.railway.enabled ? "bg-accent" : "bg-border"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.railway.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
            <Zap size={14} /> Quick Actions
          </h3>
          <div className="bg-bg-card border border-border rounded-lg p-4 space-y-2">
            <button
              onClick={() => send({ type: "clear_all" })}
              className="w-full px-4 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-gray-300 hover:border-status-error hover:text-status-error transition-colors"
            >
              Clear All Agent Logs
            </button>
            <a
              href="/"
              className="block w-full text-center px-4 py-2.5 rounded-lg bg-bg-input border border-border text-sm text-gray-300 hover:border-accent hover:text-accent transition-colors"
            >
              Open Game Interface →
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
