import { useEffect } from "react";
import { useDashboard } from "../lib/store";
import { Server, Trash2, CheckCircle, XCircle, Loader, Wrench } from "lucide-react";

export function MCPManager() {
  const { officeMcpServers, send } = useDashboard();

  useEffect(() => {
    send({ type: "list_office_mcp" });
  }, [send]);

  const handleDelete = (serverId: string) => {
    send({ type: "unregister_mcp_server", serverId });
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <Server size={20} className="text-muted" />
        <h2 className="text-xl font-semibold text-gray-200">MCP Servers</h2>
        <span className="text-xs text-muted bg-bg-card px-2 py-0.5 rounded-full">{officeMcpServers.length}</span>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {officeMcpServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted">
            <Server size={48} className="mb-4 opacity-50" />
            <p>No MCP servers registered</p>
            <p className="text-sm mt-1">Agents can build and register MCP servers from the game interface</p>
          </div>
        ) : (
          <div className="space-y-3">
            {officeMcpServers.map((server) => (
              <div key={server.id} className="bg-bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    server.status === "running" ? "bg-status-done/20" :
                    server.status === "error" ? "bg-status-error/20" : "bg-muted/20"
                  }`}>
                    {server.status === "running" ? (
                      <CheckCircle size={20} className="text-status-done" />
                    ) : server.status === "error" ? (
                      <XCircle size={20} className="text-status-error" />
                    ) : (
                      <Loader size={20} className="text-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-gray-200">{server.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        server.status === "running" ? "bg-status-done/20 text-status-done" :
                        server.status === "error" ? "bg-status-error/20 text-status-error" : "bg-muted/20 text-muted"
                      }`}>
                        {server.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{server.description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      <span>{server.runtime}</span>
                      <span>·</span>
                      <span>by {server.builtByName}</span>
                      <span>·</span>
                      <span>{server.entryFile}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(server.id)}
                    className="p-2 rounded-lg text-muted hover:text-status-error hover:bg-bg-hover"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {server.error && (
                  <div className="mt-3 text-xs text-status-error bg-status-error/10 rounded-lg px-3 py-2">
                    {server.error}
                  </div>
                )}

                {server.tools.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench size={12} className="text-muted" />
                      <span className="text-xs text-muted">Tools ({server.tools.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {server.tools.map((tool, i) => (
                        <div key={i} className="text-xs bg-bg-input border border-border rounded-lg px-2.5 py-1">
                          <span className="text-gray-300 font-medium">{tool.name}</span>
                          {tool.description && (
                            <span className="text-muted ml-2">{tool.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
