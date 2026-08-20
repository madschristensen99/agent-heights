/**
 * Experiment Log — tracks agent config changes, MCP installs, model swaps,
 * and hiring/firing events as structured experiment entries.
 *
 * Entries are created automatically when detectable events occur and can be
 * annotated by the user with hypotheses, verdicts, and notes.
 */

import { randomUUID } from "crypto";
import type { ExperimentEntry, AgentInfo } from "../shared/types.js";
import { supabaseAdmin, isSupabaseConfigured } from "./supabase.js";

/** Per-user experiment log, keyed by userId. */
const logs = new Map<string, ExperimentEntry[]>();
const loadedUsers = new Set<string>();

/** Per-user per-agent snapshot of last-known config, for diffing. */
interface AgentSnapshot {
  model: string;
  systemPrompt: string;
  mcpServers: string[];
  tasksDone: number;
}
const snapshots = new Map<string, Map<string, AgentSnapshot>>();

function getLog(userId: string): ExperimentEntry[] {
  let log = logs.get(userId);
  if (!log) {
    log = [];
    logs.set(userId, log);
  }
  // Load from DB if not yet loaded
  if (!loadedUsers.has(userId)) {
    loadedUsers.add(userId);
    if (isSupabaseConfigured) {
      void supabaseAdmin
        .from("heights_cloud_experiment_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => {
          if (data) {
            const entries = data.map((r) => ({
              id: r.id,
              timestamp: new Date(r.created_at).getTime(),
              userId: r.user_id,
              type: r.type,
              agentId: r.agent_id,
              agentName: r.agent_name,
              hypothesis: r.hypothesis,
              setup: r.setup,
              result: r.result,
              verdict: r.verdict,
              notes: r.notes,
            } as ExperimentEntry));
            log!.unshift(...entries);
          }
        })
        .catch((err: unknown) => console.warn(`[experiment-log] failed to load for ${userId}:`, err));
    }
  }
  return log;
}

function persistEntry(userId: string, entry: ExperimentEntry): void {
  if (!isSupabaseConfigured) return;
  void supabaseAdmin
    .from("heights_cloud_experiment_logs")
    .insert({
      id: entry.id,
      user_id: userId,
      type: entry.type,
      agent_id: entry.agentId,
      agent_name: entry.agentName,
      hypothesis: entry.hypothesis,
      setup: JSON.stringify(entry.setup),
      result: JSON.stringify(entry.result),
      verdict: entry.verdict,
      notes: entry.notes,
    })
    .then(() => {})
    .catch((err: unknown) => console.warn(`[experiment-log] failed to persist entry ${entry.id}:`, err));
}

function getSnapshots(userId: string): Map<string, AgentSnapshot> {
  let snaps = snapshots.get(userId);
  if (!snaps) {
    snaps = new Map();
    snapshots.set(userId, snaps);
  }
  return snaps;
}

/** Record an agent hire event. */
export function logAgentHire(
  userId: string,
  agent: AgentInfo,
): ExperimentEntry {
  const entry: ExperimentEntry = {
    id: randomUUID().slice(0, 8),
    timestamp: Date.now(),
    userId,
    type: "agent_hire",
    agentId: agent.id,
    agentName: agent.name,
    hypothesis: `Will ${agent.name} (${agent.model}) be effective at assigned tasks?`,
    setup: {
      before: "(no agent)",
      after: `model: ${agent.model}, prompt: ${agent.systemPrompt?.slice(0, 100) ?? "(default)"}`,
    },
    result: { successRate: null, avgTime: null, tasksCompleted: null },
    verdict: "pending",
    notes: "",
  };

  const log = getLog(userId);
  log.unshift(entry);
  if (log.length > 100) log.length = 100;
  persistEntry(userId, entry);

  // Snapshot the new agent's config
  const snaps = getSnapshots(userId);
  snaps.set(agent.id, {
    model: agent.model,
    systemPrompt: agent.systemPrompt ?? "",
    mcpServers: (agent as unknown as { mcpServers?: string[] }).mcpServers ?? [],
    tasksDone: agent.tasksDone,
  });

  return entry;
}

/** Record an agent fire event. */
export function logAgentFire(
  userId: string,
  agent: AgentInfo,
): ExperimentEntry {
  const snaps = getSnapshots(userId);
  const prev = snaps.get(agent.id);

  const entry: ExperimentEntry = {
    id: randomUUID().slice(0, 8),
    timestamp: Date.now(),
    userId,
    type: "agent_fire",
    agentId: agent.id,
    agentName: agent.name,
    hypothesis: prev
      ? `Was ${agent.name} (${prev.model}) worth keeping? Completed ${agent.tasksDone} tasks.`
      : `Was ${agent.name} worth keeping?`,
    setup: {
      before: prev
        ? `model: ${prev.model}, tasks: ${agent.tasksDone}`
        : "active agent",
      after: "(fired — walked out the door)",
    },
    result: {
      successRate: null,
      avgTime: null,
      tasksCompleted: agent.tasksDone,
    },
    verdict: "inconclusive",
    notes: "",
  };

  const log = getLog(userId);
  log.unshift(entry);
  if (log.length > 100) log.length = 100;
  persistEntry(userId, entry);

  snaps.delete(agent.id);

  return entry;
}

/** Detect config changes by comparing current agent state to last snapshot. */
export function detectConfigChange(
  userId: string,
  agent: AgentInfo,
): ExperimentEntry | null {
  const snaps = getSnapshots(userId);
  const prev = snaps.get(agent.id);

  // Update snapshot
  const current: AgentSnapshot = {
    model: agent.model,
    systemPrompt: agent.systemPrompt ?? "",
    mcpServers: (agent as unknown as { mcpServers?: string[] }).mcpServers ?? [],
    tasksDone: agent.tasksDone,
  };

  if (!prev) {
    snaps.set(agent.id, current);
    return null;
  }

  // Check for model swap
  if (prev.model !== current.model) {
    const entry: ExperimentEntry = {
      id: randomUUID().slice(0, 8),
      timestamp: Date.now(),
      userId,
      type: "model_swap",
      agentId: agent.id,
      agentName: agent.name,
      hypothesis: `Will ${current.model} perform better than ${prev.model} on ${agent.name}'s tasks?`,
      setup: {
        before: `model: ${prev.model}`,
        after: `model: ${current.model}`,
      },
      result: { successRate: null, avgTime: null, tasksCompleted: null },
      verdict: "pending",
      notes: "",
    };

    const log = getLog(userId);
    log.unshift(entry);
    if (log.length > 100) log.length = 100;
    persistEntry(userId, entry);

    snaps.set(agent.id, current);
    return entry;
  }

  // Check for system prompt change
  if (prev.systemPrompt !== current.systemPrompt) {
    const entry: ExperimentEntry = {
      id: randomUUID().slice(0, 8),
      timestamp: Date.now(),
      userId,
      type: "config_change",
      agentId: agent.id,
      agentName: agent.name,
      hypothesis: `Will the new system prompt improve ${agent.name}'s performance?`,
      setup: {
        before: `prompt: ${prev.systemPrompt.slice(0, 80)}...`,
        after: `prompt: ${current.systemPrompt.slice(0, 80)}...`,
      },
      result: { successRate: null, avgTime: null, tasksCompleted: null },
      verdict: "pending",
      notes: "",
    };

    const log = getLog(userId);
    log.unshift(entry);
    if (log.length > 100) log.length = 100;
    persistEntry(userId, entry);

    snaps.set(agent.id, current);
    return entry;
  }

  // Check for MCP server changes
  const prevMcp = new Set(prev.mcpServers);
  const currMcp = new Set(current.mcpServers);
  const added = [...currMcp].filter((s) => !prevMcp.has(s));
  if (added.length > 0) {
    const entry: ExperimentEntry = {
      id: randomUUID().slice(0, 8),
      timestamp: Date.now(),
      userId,
      type: "mcp_install",
      agentId: agent.id,
      agentName: agent.name,
      hypothesis: `Will adding ${added.join(", ")} to ${agent.name} unlock better task outcomes?`,
      setup: {
        before: `MCP: ${prev.mcpServers.join(", ") || "(none)"}`,
        after: `MCP: ${current.mcpServers.join(", ")}`,
      },
      result: { successRate: null, avgTime: null, tasksCompleted: null },
      verdict: "pending",
      notes: "",
    };

    const log = getLog(userId);
    log.unshift(entry);
    if (log.length > 100) log.length = 100;
    persistEntry(userId, entry);
  }

  snaps.set(agent.id, current);
  return null;
}

/** Get all experiment entries for a user. */
export function getEntries(userId: string): ExperimentEntry[] {
  return getLog(userId);
}

/** Update an experiment entry (hypothesis, verdict, notes). */
export function updateEntry(
  userId: string,
  entryId: string,
  updates: { hypothesis?: string; verdict?: string; notes?: string },
): ExperimentEntry | null {
  const log = getLog(userId);
  const entry = log.find((e) => e.id === entryId);
  if (!entry) return null;
  if (updates.hypothesis !== undefined) entry.hypothesis = updates.hypothesis;
  if (updates.verdict !== undefined) entry.verdict = updates.verdict as ExperimentEntry["verdict"];
  if (updates.notes !== undefined) entry.notes = updates.notes;
  // Persist update to DB
  if (isSupabaseConfigured) {
    void supabaseAdmin
      .from("heights_cloud_experiment_logs")
      .update({
        hypothesis: entry.hypothesis,
        verdict: entry.verdict,
        notes: entry.notes,
      })
      .eq("id", entryId)
      .eq("user_id", userId)
      .then(() => {})
      .catch((err: unknown) => console.warn(`[experiment-log] failed to update entry ${entryId}:`, err));
  }
  return entry;
}

/** Clear the log for a user (on session end / logout). */
export function clearLog(userId: string): void {
  logs.delete(userId);
  loadedUsers.delete(userId);
  snapshots.delete(userId);
  // Delete from DB
  if (isSupabaseConfigured) {
    void supabaseAdmin
      .from("heights_cloud_experiment_logs")
      .delete()
      .eq("user_id", userId)
      .then(() => {})
      .catch((err: unknown) => console.warn(`[experiment-log] failed to clear for ${userId}:`, err));
  }
}
