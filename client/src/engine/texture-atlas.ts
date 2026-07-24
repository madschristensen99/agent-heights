const GL = WebGL2RenderingContext;

interface SkylineNode {
  x: number;
  y: number;
  width: number;
}

interface AtlasRegion {
  key: string;
  u: number;
  v: number;
  w: number;
  h: number;
  canvasW: number;
  canvasH: number;
}

export class TextureAtlas {
  private gl: WebGL2RenderingContext;
  private texture: WebGLTexture;
  private size: number;
  private regions: Map<string, AtlasRegion> = new Map();
  private skyline: SkylineNode[] = [];
  private usedHeight = 0;

  constructor(gl: WebGL2RenderingContext, size: number = 2048) {
    this.gl = gl;
    this.size = size;
    this.texture = gl.createTexture()!;
    gl.bindTexture(GL.TEXTURE_2D, this.texture);
    gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA8, size, size, 0, GL.RGBA, GL.UNSIGNED_BYTE, null);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    gl.pixelStorei(GL.UNPACK_FLIP_Y_WEBGL, true);
    this.skyline.push({ x: 0, y: 0, width: size });
  }

  addCanvas(key: string, canvas: HTMLCanvasElement | OffscreenCanvas): AtlasRegion | null {
    const w = canvas.width;
    const h = canvas.height;
    const slot = this.findSlot(w, h);
    if (!slot) return null;

    const region: AtlasRegion = {
      key,
      u: slot.x / this.size,
      v: slot.y / this.size,
      w: w / this.size,
      h: h / this.size,
      canvasW: w,
      canvasH: h,
    };

    this.gl.bindTexture(GL.TEXTURE_2D, this.texture);
    this.gl.texSubImage2D(GL.TEXTURE_2D, 0, slot.x, slot.y, w, h, GL.RGBA, GL.UNSIGNED_BYTE, canvas);

    this.regions.set(key, region);
    this.placeSlot(slot.x, slot.y, w, h);
    return region;
  }

  addSubRegion(key: string, canvas: HTMLCanvasElement | OffscreenCanvas, srcX: number, srcY: number, srcW: number, srcH: number): AtlasRegion | null {
    const slot = this.findSlot(srcW, srcH);
    if (!slot) return null;

    const region: AtlasRegion = {
      key,
      u: slot.x / this.size,
      v: slot.y / this.size,
      w: srcW / this.size,
      h: srcH / this.size,
      canvasW: srcW,
      canvasH: srcH,
    };

    const ctx = (canvas as HTMLCanvasElement).getContext("2d") ?? (canvas as OffscreenCanvas).getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.getImageData(srcX, srcY, srcW, srcH);

    this.gl.bindTexture(GL.TEXTURE_2D, this.texture);
    this.gl.texSubImage2D(GL.TEXTURE_2D, 0, slot.x, slot.y, srcW, srcH, GL.RGBA, GL.UNSIGNED_BYTE, imageData.data);

    this.regions.set(key, region);
    this.placeSlot(slot.x, slot.y, srcW, srcH);
    return region;
  }

  getUV(key: string): { u: number; v: number; w: number; h: number } | null {
    const region = this.regions.get(key);
    if (!region) return null;
    return { u: region.u, v: region.v, w: region.w, h: region.h };
  }

  getRegion(key: string): AtlasRegion | null {
    return this.regions.get(key) ?? null;
  }

  has(key: string): boolean {
    return this.regions.has(key);
  }

  remove(key: string): void {
    this.regions.delete(key);
  }

  bind(unit: number = 0): void {
    this.gl.activeTexture(GL.TEXTURE0 + unit);
    this.gl.bindTexture(GL.TEXTURE_2D, this.texture);
  }

  getSize(): number {
    return this.size;
  }

  getTexture(): WebGLTexture {
    return this.texture;
  }

  defragment(liveKeys: string[]): void {
    const oldRegions = new Map(this.regions);
    this.regions.clear();
    this.skyline = [{ x: 0, y: 0, width: this.size }];
    this.usedHeight = 0;

    for (const key of liveKeys) {
      const old = oldRegions.get(key);
      if (!old) continue;
    }
  }

  private findSlot(w: number, h: number): { x: number; y: number } | null {
    if (w > this.size || h > this.size) return null;

    let bestY = this.size + 1;
    let bestX = 0;

    for (const node of this.skyline) {
      if (node.width < w) continue;
      const x = node.x;
      const y = node.y;

      // Check that the skyline is low enough across the full width [x, x+w)
      let fits = true;
      for (const other of this.skyline) {
        if (other.x + other.width <= x || other.x >= x + w) continue;
        if (other.y > y) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;

      if (y < bestY) {
        bestY = y;
        bestX = x;
      }
    }

    if (bestY > this.size) return null;
    if (bestY + h > this.size) return null;

    return { x: bestX, y: bestY };
  }

  private placeSlot(x: number, y: number, w: number, h: number): void {
    const newSkyline: SkylineNode[] = [];

    // New skyline segment: top edge of the placed rectangle
    newSkyline.push({ x, y: y + h, width: w });

    for (const node of this.skyline) {
      if (node.x + node.width <= x) {
        newSkyline.push(node);
        continue;
      }
      if (node.x >= x + w) {
        newSkyline.push(node);
        continue;
      }
      // Partially overlapping — trim the node to the sides
      if (node.x < x) {
        newSkyline.push({ x: node.x, y: node.y, width: x - node.x });
      }
      if (node.x + node.width > x + w) {
        newSkyline.push({ x: x + w, y: node.y, width: node.x + node.width - (x + w) });
      }
    }

    newSkyline.sort((a, b) => a.y - b.y || a.x - b.x);

    this.skyline = newSkyline;
    this.usedHeight = Math.max(this.usedHeight, y + h);
  }

  getUtilization(): number {
    return this.usedHeight / this.size;
  }
}
