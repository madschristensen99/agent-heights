/**
 * Shared office state graph — a lightweight in-memory DAG that all agents
 * read from and write to via built-in tools. Enables structured cross-agent
 * coordination: shared decisions, blockers, observations, and dependency tracking.
 *
 * Persisted to the save file alongside the task board and agent state.
 */

export type StateNodeType = "task" | "decision" | "blocker" | "observation";
export type StateEdgeType =
  | "depends_on"
  | "blocks"
  | "produced_by"
  | "decided_in"
  | "contradicts";

export interface StateNode {
  id: string;
  type: StateNodeType;
  title: string;
  status: string;
  agentId: string;
  agentName: string;
  metadata: Record<string, string>;
  ts: number;
}

export interface StateEdge {
  from: string;
  to: string;
  type: StateEdgeType;
}

export interface OfficeStateJSON {
  nodes: StateNode[];
  edges: StateEdge[];
  counter: number;
}

const VALID_STATUSES: Record<StateNodeType, string[]> = {
  task: ["pending", "in_progress", "done", "blocked", "failed"],
  decision: ["active", "superseded"],
  blocker: ["active", "resolved"],
  observation: ["active", "archived"],
};


export class OfficeState {
  private nodes = new Map<string, StateNode>();
  private edges: StateEdge[] = [];
  private counter = 0;

  constructor() {}

  private nextId(): string {
    this.counter++;
    return `os-${this.counter}`;
  }

  /** Create a new node. Returns the created node. */
  addNode(
    type: StateNodeType,
    title: string,
    agentId: string,
    agentName: string,
    status?: string,
    metadata?: Record<string, string>,
  ): StateNode {
    const validStatuses = VALID_STATUSES[type];
    const resolvedStatus = status && validStatuses.includes(status) ? status : validStatuses[0];
    const node: StateNode = {
      id: this.nextId(),
      type,
      title: title.slice(0, 500),
      status: resolvedStatus,
      agentId,
      agentName,
      metadata: metadata ?? {},
      ts: Date.now(),
    };
    this.nodes.set(node.id, node);
    return node;
  }

  /** Update a node's status, title, or metadata. */
  updateNode(
    id: string,
    updates: { status?: string; title?: string; metadata?: Record<string, string> },
  ): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    if (updates.status) {
      const valid = VALID_STATUSES[node.type];
      if (valid.includes(updates.status)) node.status = updates.status;
    }
    if (updates.title) node.title = updates.title.slice(0, 500);
    if (updates.metadata) node.metadata = { ...node.metadata, ...updates.metadata };
    return true;
  }

  /** Remove a node and all connected edges. */
  removeNode(id: string): boolean {
    if (!this.nodes.delete(id)) return false;
    this.edges = this.edges.filter((e) => e.from !== id && e.to !== id);
    return true;
  }

  /** Link two nodes. Rejects cycles for depends_on edges. Returns false on failure. */
  addEdge(from: string, to: string, type: StateEdgeType): boolean {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return false;
    if (from === to) return false;
    // Check for duplicate
    if (this.edges.some((e) => e.from === from && e.to === to && e.type === type)) return false;
    // Cycle detection for depends_on
    if (type === "depends_on" && this.wouldCreateCycle(from, to)) return false;
    this.edges.push({ from, to, type });
    return true;
  }

  /** Check if adding from→to (depends_on) would create a cycle. */
  private wouldCreateCycle(from: string, to: string): boolean {
    // BFS from `to` — if we reach `from`, it's a cycle
    const visited = new Set<string>();
    const queue = [to];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of this.edges) {
        if (e.type === "depends_on" && e.from === current) {
          queue.push(e.to);
        }
      }
    }
    return false;
  }

  /** Get a node by ID. */
  getNode(id: string): StateNode | undefined {
    return this.nodes.get(id);
  }

  /** List nodes with optional filters. */
  listNodes(filter?: {
    type?: StateNodeType;
    status?: string;
    agentId?: string;
    limit?: number;
  }): StateNode[] {
    let result = [...this.nodes.values()];
    if (filter?.type) result = result.filter((n) => n.type === filter.type);
    if (filter?.status) result = result.filter((n) => n.status === filter.status);
    if (filter?.agentId) result = result.filter((n) => n.agentId === filter.agentId);
    result.sort((a, b) => b.ts - a.ts);
    if (filter?.limit) result = result.slice(0, filter.limit);
    return result;
  }

  /** Get all edges connected to a node. */
  getEdges(nodeId: string): { edge: StateEdge; node: StateNode }[] {
    const result: { edge: StateEdge; node: StateNode }[] = [];
    for (const e of this.edges) {
      if (e.from === nodeId) {
        const n = this.nodes.get(e.to);
        if (n) result.push({ edge: e, node: n });
      } else if (e.to === nodeId) {
        const n = this.nodes.get(e.from);
        if (n) result.push({ edge: e, node: n });
      }
    }
    return result;
  }

  /** Find all active blockers and what they block. */
  findBlockers(): { blocker: StateNode; blocks: StateNode[] }[] {
    const activeBlockers = this.listNodes({ type: "blocker", status: "active" });
    return activeBlockers.map((blocker) => {
      const blocked = this.edges
        .filter((e) => e.from === blocker.id && e.type === "blocks")
        .map((e) => this.nodes.get(e.to))
        .filter((n): n is StateNode => !!n);
      return { blocker, blocks: blocked };
    });
  }

  /** Get recent decisions (active or superseded). */
  getRecentDecisions(limit = 10): StateNode[] {
    return this.listNodes({ type: "decision", limit });
  }

  /** Trace the decision trail — history of updates/contradictions for a node. */
  getDecisionTrail(nodeId: string): StateNode[] {
    const trail: StateNode[] = [];
    const visited = new Set<string>();
    const collect = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) trail.push(node);
      // Follow contradicts edges (which point from newer → older)
      for (const e of this.edges) {
        if (e.from === id && e.type === "contradicts") {
          collect(e.to);
        }
      }
    };
    collect(nodeId);
    return trail;
  }

  /** Compute the longest chain of unfinished tasks (critical path). */
  getCriticalPath(): StateNode[] {
    const unfinished = this.listNodes({ type: "task" }).filter(
      (n) => n.status === "pending" || n.status === "in_progress" || n.status === "blocked",
    );
    if (unfinished.length === 0) return [];

    // Memoized longest path from each node
    const memo = new Map<string, StateNode[]>();
    const longest = (nodeId: string): StateNode[] => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      const node = this.nodes.get(nodeId);
      if (!node) return [];
      // Find tasks that depend on this one (this → them via depends_on)
      const dependents = this.edges
        .filter((e) => e.from === nodeId && e.type === "depends_on")
        .map((e) => e.to);
      if (dependents.length === 0) {
        memo.set(nodeId, [node]);
        return [node];
      }
      let best: StateNode[] = [];
      for (const dep of dependents) {
        const path = longest(dep);
        if (path.length > best.length) best = path;
      }
      const result = [node, ...best];
      memo.set(nodeId, result);
      return result;
    };

    let critical: StateNode[] = [];
    for (const n of unfinished) {
      const path = longest(n.id);
      if (path.length > critical.length) critical = path;
    }
    return critical;
  }

  /** Detect logical contradictions in the state graph. */
  detectContradictions(): string[] {
    const issues: string[] = [];
    // Tasks marked done but still have active blockers
    const doneTasks = this.listNodes({ type: "task", status: "done" });
    for (const task of doneTasks) {
      const activeBlockers = this.edges
        .filter((e) => e.to === task.id && e.type === "blocks")
        .map((e) => this.nodes.get(e.from))
        .filter((n): n is StateNode => n?.status === "active");
      if (activeBlockers.length > 0) {
        issues.push(
          `Task "${task.title}" is marked done but has active blocker(s): ${activeBlockers.map((b) => b.title).join(", ")}`,
        );
      }
    }
    // Multiple active decisions that contradict each other
    const activeDecisions = this.listNodes({ type: "decision", status: "active" });
    for (const dec of activeDecisions) {
      const contradicts = this.edges
        .filter((e) => e.from === dec.id && e.type === "contradicts")
        .map((e) => this.nodes.get(e.to))
        .filter((n): n is StateNode => n?.status === "active");
      for (const old of contradicts) {
        issues.push(
          `Decision "${dec.title}" contradicts "${old.title}" but both are still active`,
        );
      }
    }
    return issues;
  }

  /** Get a structured summary of the entire office state — for system prompt injection. */
  getSummary(): string {
    const parts: string[] = [];
    const tasks = this.listNodes({ type: "task" });
    const activeTasks = tasks.filter((t) => t.status === "in_progress");
    const pendingTasks = tasks.filter((t) => t.status === "pending");
    const blockedTasks = tasks.filter((t) => t.status === "blocked");
    const doneTasks = tasks.filter((t) => t.status === "done");
    const decisions = this.listNodes({ type: "decision", status: "active" });
    const blockers = this.findBlockers();

    parts.push(`=== OFFICE STATE ===`);
    parts.push(`Tasks: ${activeTasks.length} in progress, ${pendingTasks.length} pending, ${blockedTasks.length} blocked, ${doneTasks.length} done`);

    if (activeTasks.length > 0) {
      parts.push(`\nIn progress:`);
      for (const t of activeTasks.slice(0, 10)) {
        parts.push(`  • [${t.id}] ${t.title} (${t.agentName})`);
      }
    }
    if (blockedTasks.length > 0) {
      parts.push(`\nBlocked:`);
      for (const t of blockedTasks.slice(0, 10)) {
        parts.push(`  • [${t.id}] ${t.title} (${t.agentName})`);
      }
    }
    if (blockers.length > 0) {
      parts.push(`\nActive blockers:`);
      for (const { blocker, blocks } of blockers.slice(0, 10)) {
        const blockedTitles = blocks.map((b) => b.title).join(", ");
        parts.push(`  • ${blocker.title}${blockedTitles ? ` → blocking: ${blockedTitles}` : ""}`);
      }
    }
    if (decisions.length > 0) {
      parts.push(`\nActive decisions:`);
      for (const d of decisions.slice(0, 10)) {
        parts.push(`  • [${d.id}] ${d.title} (${d.agentName})`);
      }
    }
    parts.push(`=== END OFFICE STATE ===`);
    return parts.join("\n");
  }

  /** Get context relevant to a specific agent — for fresh-start system prompt injection. */
  getAgentContext(agentId: string, agentName: string): string {
    const parts: string[] = [];

    // This agent's task history
    const myTasks = this.listNodes({ type: "task", agentId });
    const myDone = myTasks.filter((t) => t.status === "done");
    const myActive = myTasks.filter((t) => t.status === "in_progress" || t.status === "pending" || t.status === "blocked");

    // This agent's decisions
    const myDecisions = this.listNodes({ type: "decision", agentId, status: "active" });

    // This agent's observations
    const myObservations = this.listNodes({ type: "observation", agentId, status: "active" });

    // Office-wide active blockers
    const officeBlockers = this.findBlockers();

    // Office-wide active decisions (from other agents)
    const otherDecisions = this.listNodes({ type: "decision", status: "active" }).filter(
      (d) => d.agentId !== agentId,
    );

    // Who depends on this agent's work?
    const dependedOnBy: StateNode[] = [];
    for (const t of myActive) {
      const deps = this.edges
        .filter((e) => e.from === t.id && e.type === "depends_on")
        .map((e) => this.nodes.get(e.to))
        .filter((n): n is StateNode => !!n);
      dependedOnBy.push(...deps);
    }

    parts.push(`=== OFFICE CONTEXT ===`);

    if (myDone.length > 0) {
      parts.push(`You have completed ${myDone.length} task(s) previously:`);
      for (const t of myDone.slice(0, 10)) {
        const time = new Date(t.ts).toLocaleDateString();
        parts.push(`  ✓ [${time}] ${t.title.slice(0, 120)}`);
      }
    }

    if (myActive.length > 0) {
      parts.push(`\nYour active/pending tasks:`);
      for (const t of myActive.slice(0, 5)) {
        parts.push(`  • [${t.id}] ${t.title} (status: ${t.status})`);
      }
    }

    if (myDecisions.length > 0) {
      parts.push(`\nYour active decisions:`);
      for (const d of myDecisions.slice(0, 5)) {
        parts.push(`  • ${d.title}`);
      }
    }

    if (myObservations.length > 0) {
      parts.push(`\nYour recent observations:`);
      for (const o of myObservations.slice(0, 5)) {
        parts.push(`  • ${o.title.slice(0, 150)}`);
      }
    }

    if (otherDecisions.length > 0) {
      parts.push(`\nDecisions made by colleagues:`);
      for (const d of otherDecisions.slice(0, 8)) {
        parts.push(`  • ${d.title} (${d.agentName})`);
      }
    }

    if (officeBlockers.length > 0) {
      parts.push(`\nActive office blockers:`);
      for (const { blocker, blocks } of officeBlockers.slice(0, 5)) {
        const blockedTitles = blocks.map((b) => b.title).join(", ");
        parts.push(`  • ${blocker.title}${blockedTitles ? ` → blocking: ${blockedTitles}` : ""} (${blocker.agentName})`);
      }
    }

    if (dependedOnBy.length > 0) {
      parts.push(`\nOther tasks depending on your active work:`);
      for (const d of dependedOnBy.slice(0, 5)) {
        parts.push(`  • ${d.title} (${d.agentName})`);
      }
    }

    if (parts.length === 1) {
      parts.push("No prior office context available.");
    }

    parts.push(`=== END OFFICE CONTEXT ===`);
    return parts.join("\n");
  }

  /** Serialize for persistence. */
  toJSON(): OfficeStateJSON {
    return {
      nodes: [...this.nodes.values()],
      edges: [...this.edges],
      counter: this.counter,
    };
  }

  /** Restore from persisted data. */
  fromJSON(data: OfficeStateJSON): void {
    this.nodes.clear();
    this.edges = [];
    this.counter = data.counter ?? 0;
    for (const n of data.nodes ?? []) {
      this.nodes.set(n.id, n);
    }
    this.edges = data.edges ?? [];
  }

  /** Clear all state (used when office is reset). */
  clear(): void {
    this.nodes.clear();
    this.edges = [];
    this.counter = 0;
  }
}
