import type { Hex } from "../engine/types";
import type { Draft, Thread } from "./threads";
import { getAuraColor } from "./threads";

export interface SpellMutation {
  type: "spell";
  agentId: string;
  tool: string;
  draft: Draft;
  hex: Hex;
  result: "success" | "error";
  language: string;
}

export interface DomainMutation {
  type: "domain_update";
  agentId: string;
  event: "create" | "delete" | "modify";
  path: string;
  fileType: "file" | "directory";
}

export interface AuraMutation {
  type: "aura_change";
  agentId: string;
  language: string;
  intensity: number;
  pulse: "smooth" | "rapid" | "chaotic";
}

export interface DistaffMutation {
  type: "distaff_growth";
  agentId: string;
  newThread: Thread;
  toolName: string;
}

export interface DomainLayoutMutation {
  type: "domain_layout";
  agentId: string;
  files: {
    path: string;
    type: "file" | "directory" | "symlink";
    size: number;
    depth: number;
    modifiedAt: number;
  }[];
}

export type WorldMutation =
  | SpellMutation
  | DomainMutation
  | AuraMutation
  | DistaffMutation
  | DomainLayoutMutation;

export interface MutationHandler {
  onMutation(msg: WorldMutation): void;
}

export function parseMutation(data: unknown): WorldMutation | null {
  if (!data || typeof data !== "object") return null;
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== "string") return null;

  switch (msg.type) {
    case "spell":
      if (typeof msg.agentId !== "string" || typeof msg.tool !== "string") return null;
      return {
        type: "spell",
        agentId: msg.agentId,
        tool: msg.tool,
        draft: (msg.draft as Draft) ?? [],
        hex: msg.hex as Hex ?? { q: 0, r: 0 },
        result: (msg.result as "success" | "error") ?? "success",
        language: (msg.language as string) ?? "default",
      };
    case "domain_update":
      if (typeof msg.agentId !== "string") return null;
      return {
        type: "domain_update",
        agentId: msg.agentId,
        event: (msg.event as "create" | "delete" | "modify") ?? "create",
        path: (msg.path as string) ?? "",
        fileType: (msg.fileType as "file" | "directory") ?? "file",
      };
    case "aura_change":
      if (typeof msg.agentId !== "string") return null;
      return {
        type: "aura_change",
        agentId: msg.agentId,
        language: (msg.language as string) ?? "default",
        intensity: (msg.intensity as number) ?? 1,
        pulse: (msg.pulse as "smooth" | "rapid" | "chaotic") ?? "smooth",
      };
    case "distaff_growth":
      if (typeof msg.agentId !== "string") return null;
      return {
        type: "distaff_growth",
        agentId: msg.agentId,
        newThread: (msg.newThread as Thread) ?? "spin",
        toolName: (msg.toolName as string) ?? "",
      };
    case "domain_layout":
      if (typeof msg.agentId !== "string") return null;
      return {
        type: "domain_layout",
        agentId: msg.agentId,
        files: (msg.files as DomainLayoutMutation["files"]) ?? [],
      };
    default:
      return null;
  }
}

export { getAuraColor };
