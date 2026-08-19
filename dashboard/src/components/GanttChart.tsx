import { useState, useRef, useEffect } from "react";
import { useDashboard } from "../lib/store";
import type { TaskCard, TaskPhase } from "../../shared/types";
import { BarChart3 } from "lucide-react";

const PHASE_COLORS: Record<string, string> = {
  requirements: "#a78bfa",
  design: "#f9ca24",
  implementation: "#68a063",
  verification: "#3a8cd4",
  done: "#3b82f6",
};

type ZoomLevel = "hours" | "days" | "week";

interface GanttChartProps {
  onSelectCard?: (id: string) => void;
}

export function GanttChart({ onSelectCard }: GanttChartProps) {
  const { board, agents, dependencies } = useDashboard();
  const [zoom, setZoom] = useState<ZoomLevel>("hours");
  const scrollRef = useRef<HTMLDivElement>(null);

  const cards = [...board].sort((a, b) => a.createdAt - b.createdAt);
  const now = Date.now();

  // Compute time window based on zoom
  const zoomConfig = {
    hours: { hourStep: 1, windowMs: 12 * 60 * 60 * 1000 },
    days: { hourStep: 6, windowMs: 7 * 24 * 60 * 60 * 1000 },
    week: { hourStep: 24, windowMs: 30 * 24 * 60 * 60 * 1000 },
  }[zoom];

  let minTime = now - zoomConfig.windowMs * 0.3;
  let maxTime = now + zoomConfig.windowMs * 0.7;
  for (const c of cards) {
    if (c.startedAt) minTime = Math.min(minTime, c.startedAt);
    if (c.dueDate) maxTime = Math.max(maxTime, c.dueDate);
    if (c.startedAt && c.estimatedMinutes) {
      maxTime = Math.max(maxTime, c.startedAt + c.estimatedMinutes * 60 * 1000);
    }
  }
  const span = Math.max(maxTime - minTime, 60 * 60 * 1000);

  const agentList = [...agents.values()].filter(
    (a) => a.id !== "office-manager" && a.id !== "hermes" && a.id !== "wizard",
  );

  const goalCards = cards.filter((c) => c.type === "goal");

  const fmtTime = (t: number) => {
    const d = new Date(t);
    if (zoom === "hours") return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    if (zoom === "days") return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:00`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const timeMarks: number[] = [];
  const stepMs = zoomConfig.hourStep * 60 * 60 * 1000;
  for (let t = Math.floor(minTime / stepMs) * stepMs; t <= maxTime; t += stepMs) {
    timeMarks.push(t);
  }

  const nowPct = ((now - minTime) / span) * 100;

  // Compute critical path (longest dependency chain)
  const criticalPathIds = computeCriticalPath(cards, dependencies);

  // Auto-scroll to NOW on mount / zoom change
  useEffect(() => {
    if (scrollRef.current && nowPct > 0 && nowPct < 100) {
      const targetScroll = (nowPct / 100) * scrollRef.current.scrollWidth - scrollRef.current.clientWidth * 0.3;
      scrollRef.current.scrollLeft = Math.max(0, targetScroll);
    }
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a map of cardId → bar position for dependency arrows
  const barPositions = new Map<string, { left: number; width: number; agentIdx: number }>();
  const agentRowMap = new Map<string, number>();
  agentList.forEach((a, i) => agentRowMap.set(a.id, i));

  const getBarPos = (c: TaskCard) => {
    const start = c.startedAt ?? now;
    const duration = (c.estimatedMinutes ?? 30) * 60 * 1000;
    const end = c.dueDate ?? start + duration;
    const left = ((start - minTime) / span) * 100;
    const width = Math.max(((end - start) / span) * 100, 2);
    const agentIdx = c.assignedAgentId ? agentRowMap.get(c.assignedAgentId) ?? agentList.length : agentList.length;
    return { left, width, agentIdx };
  };

  const renderBar = (c: TaskCard) => {
    const pos = getBarPos(c);
    barPositions.set(c.id, pos);
    const phase = c.phase ?? "implementation";
    const color = PHASE_COLORS[phase] ?? PHASE_COLORS.implementation;
    const isCritical = criticalPathIds.has(c.id);
    const progress = c.progress ?? 0;

    return (
      <div
        key={c.id}
        className="absolute top-1 h-5 rounded text-[10px] font-semibold text-white px-1.5 flex items-center overflow-hidden whitespace-nowrap cursor-pointer hover:z-10 hover:shadow-lg transition-shadow"
        style={{
          left: `${pos.left}%`,
          width: `${pos.width}%`,
          backgroundColor: `${color}40`,
          borderLeft: `3px solid ${color}`,
          boxShadow: isCritical ? "0 0 0 1px #ef4444" : undefined,
        }}
        title={`${c.title}\n${c.assignedAgentId ? agents.get(c.assignedAgentId)?.name : "Unassigned"}\nPhase: ${phase}\nProgress: ${progress}%\nDeps: ${c.dependsOnCardIds?.length ?? 0}`}
        onClick={(e) => {
          e.stopPropagation();
          onSelectCard?.(c.id);
        }}
      >
        {progress > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded"
            style={{ width: `${progress}%`, backgroundColor: `${color}80` }}
          />
        )}
        <span className="relative z-10 truncate">{c.title.slice(0, 30)}</span>
      </div>
    );
  };

  // Dependency arrows
  const depArrows = dependencies
    .filter((d) => d.type === "depends_on")
    .map((d) => {
      const fromPos = barPositions.get(d.from);
      const toPos = barPositions.get(d.to);
      if (!fromPos || !toPos) return null;
      const fromX = fromPos.left + fromPos.width;
      const fromY = fromPos.agentIdx * 28 + 10;
      const toX = toPos.left;
      const toY = toPos.agentIdx * 28 + 10;
      return { fromX, fromY, toX, toY, key: `${d.from}-${d.to}` };
    })
    .filter(Boolean) as { fromX: number; fromY: number; toX: number; toY: number; key: string }[];

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <BarChart3 size={20} className="text-accent" />
        <h2 className="text-xl font-semibold text-gray-200">Gantt Chart</h2>
        <div className="flex-1" />
        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-bg-card rounded-lg border border-border p-0.5">
          {(["hours", "days", "week"] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-2 py-1 rounded text-xs capitalize transition-colors ${
                zoom === z ? "bg-accent text-bg" : "text-muted hover:text-gray-300"
              }`}
            >
              {z}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs ml-3">
          {(Object.keys(PHASE_COLORS) as string[]).map((p) => (
            <span key={p} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: PHASE_COLORS[p] }} />
              <span className="text-muted capitalize">{p}</span>
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded border border-red-500" />
            <span className="text-muted">Critical</span>
          </span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4">
        {/* Time axis */}
        <div className="relative h-6 mb-2 border-b border-border" style={{ minWidth: "100%" }}>
          {timeMarks.map((t) => {
            const pct = ((t - minTime) / span) * 100;
            return (
              <div key={t} className="absolute bottom-1 text-[10px] text-muted -translate-x-1/2" style={{ left: `${pct}%` }}>
                {fmtTime(t)}
              </div>
            );
          })}
          <div className="absolute top-0 bottom-0 w-px bg-red-500" style={{ left: `${nowPct}%` }}>
            <span className="absolute -top-0 -translate-x-1/2 text-[9px] font-bold text-red-500">NOW</span>
          </div>
        </div>

        {/* Agent rows + bars */}
        <div className="relative space-y-1" style={{ minWidth: "100%" }}>
          {agentList.map((agent, agentIdx) => {
            const agentCards = cards.filter((c) => c.assignedAgentId === agent.id && c.type !== "goal" && c.type !== "chat");
            return (
              <div key={agent.id} className="flex items-center gap-2">
                <div className="w-24 text-xs font-medium text-gray-400 truncate text-right flex-shrink-0">{agent.name}</div>
                <div className="relative flex-1 h-7 bg-bg-card rounded border border-border">
                  {agentCards.map((c) => {
                    const pos = getBarPos(c);
                    barPositions.set(c.id, pos);
                    const phase = c.phase ?? "implementation";
                    const color = PHASE_COLORS[phase] ?? PHASE_COLORS.implementation;
                    const isCritical = criticalPathIds.has(c.id);
                    const progress = c.progress ?? 0;
                    return (
                      <div
                        key={c.id}
                        className="absolute top-1 h-5 rounded text-[10px] font-semibold text-white px-1.5 flex items-center overflow-hidden whitespace-nowrap cursor-pointer hover:z-10 hover:shadow-lg transition-shadow"
                        style={{
                          left: `${pos.left}%`,
                          width: `${pos.width}%`,
                          backgroundColor: `${color}40`,
                          borderLeft: `3px solid ${color}`,
                          boxShadow: isCritical ? "0 0 0 1px #ef4444" : undefined,
                        }}
                        title={`${c.title}\n${agent.name}\nPhase: ${phase}\nProgress: ${progress}%\nDeps: ${c.dependsOnCardIds?.length ?? 0}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCard?.(c.id);
                        }}
                      >
                        {progress > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 rounded"
                            style={{ width: `${progress}%`, backgroundColor: `${color}80` }}
                          />
                        )}
                        <span className="relative z-10 truncate">{c.title.slice(0, 30)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Unassigned */}
          {cards.filter((c) => !c.assignedAgentId && c.type !== "goal" && c.type !== "chat" && c.status !== "done").length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-24 text-xs font-medium text-muted text-right flex-shrink-0">Unassigned</div>
              <div className="relative flex-1 h-7 bg-bg-card rounded border border-border border-dashed">
                {cards.filter((c) => !c.assignedAgentId && c.type !== "goal" && c.type !== "chat" && c.status !== "done").map((c) => {
                  const pos = getBarPos(c);
                  barPositions.set(c.id, pos);
                  const phase = c.phase ?? "implementation";
                  const color = PHASE_COLORS[phase] ?? PHASE_COLORS.implementation;
                  return (
                    <div
                      key={c.id}
                      className="absolute top-1 h-5 rounded text-[10px] font-semibold text-white px-1.5 flex items-center overflow-hidden whitespace-nowrap cursor-pointer hover:z-10 hover:shadow-lg transition-shadow"
                      style={{ left: `${pos.left}%`, width: `${pos.width}%`, backgroundColor: `${color}40`, borderLeft: `3px solid ${color}` }}
                      title={c.title}
                      onClick={(e) => { e.stopPropagation(); onSelectCard?.(c.id); }}
                    >
                      {c.title.slice(0, 30)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Milestones */}
          {goalCards.length > 0 && (
            <div className="flex items-center gap-2 pt-2">
              <div className="w-24 text-xs font-medium text-amber-400 text-right flex-shrink-0">Milestones</div>
              <div className="relative flex-1 h-7">
                {goalCards.map((c) => {
                  const pct = c.dueDate ? ((c.dueDate - minTime) / span) * 100 : ((c.createdAt - minTime) / span) * 100;
                  return (
                    <div
                      key={c.id}
                      className="absolute top-1 text-amber-400 -translate-x-1/2 cursor-pointer hover:text-amber-300"
                      style={{ left: `${pct}%` }}
                      title={c.title}
                      onClick={(e) => { e.stopPropagation(); onSelectCard?.(c.id); }}
                    >
                      ◆
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dependency arrows SVG overlay */}
          {depArrows.length > 0 && (
            <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              {depArrows.map((a) => (
                <line
                  key={a.key}
                  x1={`${a.fromX}%`}
                  y1={a.fromY + 16}
                  x2={`${a.toX}%`}
                  y2={a.toY + 16}
                  stroke="#ef4444"
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  opacity={0.4}
                />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function computeCriticalPath(cards: TaskCard[], dependencies: { from: string; to: string; type: string }[]): Set<string> {
  const depMap = new Map<string, string[]>();
  for (const d of dependencies) {
    if (d.type !== "depends_on") continue;
    const arr = depMap.get(d.to) ?? [];
    arr.push(d.from);
    depMap.set(d.to, arr);
  }

  const memo = new Map<string, number>();
  const dfs = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const deps = depMap.get(id) ?? [];
    if (deps.length === 0) { memo.set(id, 1); return 1; }
    const maxDep = Math.max(...deps.map((depId) => dfs(depId)));
    const result = maxDep + 1;
    memo.set(id, result);
    return result;
  };

  let maxLen = 0;
  for (const c of cards) maxLen = Math.max(maxLen, dfs(c.id));

  const result = new Set<string>();
  for (const c of cards) {
    if (memo.get(c.id) === maxLen) result.add(c.id);
  }
  return result;
}
