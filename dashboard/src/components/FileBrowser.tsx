import { useState, useEffect } from "react";
import { useDashboard } from "../lib/store";
import { Folder, File, ChevronRight, ArrowLeft, RefreshCw } from "lucide-react";
import { IconArrowLeft } from "./Icons";

interface FileBrowserProps {
  agentId: string;
  onBack: () => void;
}

export function FileBrowser({ agentId, onBack }: FileBrowserProps) {
  const { agents, agentFsListings, agentFsContent, send } = useDashboard();
  const agent = agents.get(agentId);
  const [currentPath, setCurrentPath] = useState("/workspace");
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const listing = agentFsListings.get(agentId);
  const fileContent = agentFsContent.get(agentId);

  useEffect(() => {
    send({ type: "agent_fs_list", agentId, path: currentPath });
    setViewingFile(null);
  }, [agentId, currentPath, send]);

  const handleEntryClick = (entry: { name: string; isDir: boolean }) => {
    const newPath = `${currentPath}/${entry.name}`;
    if (entry.isDir) {
      setCurrentPath(newPath);
    } else {
      setViewingFile(newPath);
      send({ type: "agent_fs_read", agentId, path: newPath });
    }
  };

  const navigateUp = () => {
    if (currentPath === "/workspace") return;
    const parts = currentPath.split("/");
    parts.pop();
    setCurrentPath(parts.join("/") || "/workspace");
  };

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted">
        <p>Agent not found</p>
      </div>
    );
  }

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-gray-200">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-gray-200">{agent.name} — Files</h2>
        <div className="flex-1" />
        <button
          onClick={() => send({ type: "agent_fs_list", agentId, path: currentPath })}
          className="p-2 rounded-lg hover:bg-bg-hover text-muted hover:text-accent"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="px-6 py-2 border-b border-border flex items-center gap-1 text-sm">
        <button
          onClick={() => setCurrentPath("/workspace")}
          className="text-muted hover:text-accent"
        >
          workspace
        </button>
        {breadcrumbs.slice(1).map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={14} className="text-muted" />
            <button
              onClick={() => setCurrentPath("/workspace/" + breadcrumbs.slice(1, i + 2).join("/"))}
              className="text-muted hover:text-accent"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {viewingFile ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setViewingFile(null)}
                className="text-sm text-muted hover:text-accent"
              >
                <IconArrowLeft size={12} className="inline-block" /> Back to listing
              </button>
              <span className="text-sm text-gray-300 font-mono">{viewingFile}</span>
            </div>
            {fileContent?.path === viewingFile ? (
              fileContent.error ? (
                <p className="text-sm text-status-error">{fileContent.error}</p>
              ) : (
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap bg-bg-card border border-border rounded-lg p-4 overflow-auto">
                  {fileContent.content}
                </pre>
              )
            ) : (
              <div className="flex items-center text-muted text-sm">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                Loading file...
              </div>
            )}
          </div>
        ) : (
          <div>
            {currentPath !== "/workspace" && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-hover text-sm text-muted hover:text-gray-200 mb-2"
              >
                <ArrowLeft size={14} /> Up to parent directory
              </button>
            )}
            {!listing || listing.path !== currentPath ? (
              <div className="flex items-center text-muted text-sm">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                Loading...
              </div>
            ) : listing.entries.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">Empty directory</p>
            ) : (
              <div className="space-y-0.5">
                {listing.entries
                  .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
                  .map((entry) => (
                    <button
                      key={entry.name}
                      onClick={() => handleEntryClick(entry)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover text-sm text-left"
                    >
                      {entry.isDir ? (
                        <Folder size={16} className="text-status-thinking" />
                      ) : (
                        <File size={16} className="text-muted" />
                      )}
                      <span className="flex-1 text-gray-300">{entry.name}</span>
                      {!entry.isDir && (
                        <span className="text-xs text-muted">
                          {entry.size < 1024 ? `${entry.size}B` : `${(entry.size / 1024).toFixed(1)}KB`}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
