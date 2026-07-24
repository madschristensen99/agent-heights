import type { Hex } from "../engine/types";
import type { Engine } from "../engine/engine";
import { hexToPixel, hexSpiral, hexKey } from "../engine/hexgrid";

export interface FileNode {
  path: string;
  type: "file" | "directory" | "symlink";
  size: number;
  depth: number;
  modifiedAt: number;
}

interface DomainObject {
  id: string;
  path: string;
  type: "file" | "directory" | "symlink";
  hex: Hex;
  size: number;
  depth: number;
  modifiedAt: number;
  glowIntensity: number;
  spriteId: number | null;
}

interface Domain {
  agentId: string;
  centerHex: Hex;
  objects: Map<string, DomainObject>;
  fileCount: number;
  maxDepth: number;
}

const MAX_RENDER_DEPTH = 3;
const MAX_OBJECT_HEIGHT = 3;
const NODE_MODULES_THRESHOLD = 20;
const LARGE_FILE_THRESHOLD = 1024 * 1024;
const MAX_DOMAIN_RADIUS = 5;

export class DomainManager {
  private domains: Map<string, Domain> = new Map();
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  registerAgent(agentId: string, centerHex: Hex): void {
    this.domains.set(agentId, {
      agentId,
      centerHex,
      objects: new Map(),
      fileCount: 0,
      maxDepth: 0,
    });
  }

  unregisterAgent(agentId: string): void {
    const domain = this.domains.get(agentId);
    if (!domain) return;
    for (const obj of domain.objects.values()) {
      if (obj.spriteId !== null) this.engine.sprites.remove(obj.spriteId);
    }
    this.domains.delete(agentId);
  }

  setLayout(agentId: string, files: FileNode[]): void {
    const domain = this.domains.get(agentId);
    if (!domain) return;

    const oldObjects = new Map(domain.objects);
    domain.objects.clear();
    domain.fileCount = files.length;
    domain.maxDepth = 0;

    const visibleFiles = this.summarizeFiles(files);

    const availableHexes = hexSpiral(domain.centerHex, MAX_DOMAIN_RADIUS);
    let hexIdx = 0;

    for (const file of visibleFiles) {
      const hex = availableHexes[hexIdx % availableHexes.length];
      hexIdx++;

      const old = oldObjects.get(file.path);
      const wasJustModified = old
        ? old.modifiedAt !== file.modifiedAt
        : true;

      const obj: DomainObject = {
        id: hexKey(hex.q, hex.r),
        path: file.path,
        type: file.type,
        hex,
        size: Math.min(file.size / LARGE_FILE_THRESHOLD, MAX_OBJECT_HEIGHT),
        depth: file.depth,
        modifiedAt: file.modifiedAt,
        glowIntensity: wasJustModified ? 1.0 : old?.glowIntensity ?? 0,
        spriteId: old?.spriteId ?? null,
      };

      domain.maxDepth = Math.max(domain.maxDepth, file.depth);
      domain.objects.set(file.path, obj);

      if (wasJustModified && old) {
        this.flashObject(obj);
      }
    }

    for (const [path, old] of oldObjects) {
      if (!domain.objects.has(path) && old.spriteId !== null) {
        this.engine.sprites.remove(old.spriteId);
      }
    }
  }

  onFileEvent(agentId: string, event: "create" | "delete" | "modify", path: string, fileType: "file" | "directory"): void {
    const domain = this.domains.get(agentId);
    if (!domain) return;

    if (event === "delete") {
      const obj = domain.objects.get(path);
      if (obj?.spriteId !== null && obj?.spriteId !== undefined) {
        this.engine.sprites.remove(obj.spriteId);
      }
      domain.objects.delete(path);
      domain.fileCount = Math.max(0, domain.fileCount - 1);
    } else if (event === "create" || event === "modify") {
      const obj = domain.objects.get(path);
      if (obj) {
        obj.glowIntensity = 1.0;
        obj.modifiedAt = Date.now();
        this.flashObject(obj);
      }
    }
  }

  getDomain(agentId: string): Domain | undefined {
    return this.domains.get(agentId);
  }

  getDomainSize(agentId: string): number {
    return this.domains.get(agentId)?.fileCount ?? 0;
  }

  update(dt: number): void {
    for (const domain of this.domains.values()) {
      for (const obj of domain.objects.values()) {
        if (obj.glowIntensity > 0) {
          obj.glowIntensity = Math.max(0, obj.glowIntensity - dt * 0.5);
        }
      }
    }
  }

  private summarizeFiles(files: FileNode[]): FileNode[] {
    const visible: FileNode[] = [];
    const dirCounts = new Map<string, number>();

    for (const f of files) {
      const parts = f.path.split("/");
      const dir = parts.length > 1 ? parts[0] : "";
      if (dir) dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }

    for (const f of files) {
      if (f.depth > MAX_RENDER_DEPTH) continue;

      const parts = f.path.split("/");
      const topDir = parts.length > 1 ? parts[0] : "";

      if (topDir === "node_modules" && (dirCounts.get("node_modules") ?? 0) > NODE_MODULES_THRESHOLD) {
        if (f.path === "node_modules" || f.depth <= 1) {
          visible.push({
            ...f,
            type: "directory",
            size: (dirCounts.get("node_modules") ?? 0) * 1024,
          });
        }
        continue;
      }

      visible.push(f);
    }

    return visible;
  }

  private flashObject(obj: DomainObject): void {
    const pos = hexToPixel(obj.hex.q, obj.hex.r);
    this.engine.particles.dustCloud(pos.x, pos.y, 4, 0.5);
  }
}
