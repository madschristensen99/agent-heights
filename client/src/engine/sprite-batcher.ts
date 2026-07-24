const GL = WebGL2RenderingContext;

import type { SpriteData } from "./types";
import {
  createProgram, createBuffer, createVertexArray,
  getUniformLocations,
} from "./gl";

const VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aSpritePos;
layout(location = 2) in vec4 aUV;
layout(location = 3) in vec2 aDisplaySize;
layout(location = 4) in vec4 aTint;
layout(location = 5) in float aFlip;

uniform mat4 uViewProj;
uniform vec2 uViewport;

out vec2 vUV;
out vec4 vTint;
out float vDepth;

void main() {
  // Sprites stand upright: X extends horizontally, Z extends upward
  // Feet at spritePos.z, head at spritePos.z + displayH
  // Centered horizontally around spritePos.x
  float halfW = aDisplaySize.x * 0.5;
  vec3 offset = vec3(
    (aCorner.x - 0.5) * aDisplaySize.x,
    0.0,
    aCorner.y * aDisplaySize.y
  );
  if (aFlip > 0.5) offset.x = -offset.x;
  vec3 worldPos = aSpritePos + offset;

  vec2 uvOffset = aCorner * 0.5 + 0.5;
  // aCorner.y=0 is bottom (feet), =1 is top (head) — flip V to match texture
  uvOffset.y = 1.0 - uvOffset.y;
  if (aFlip > 0.5) uvOffset.x = 1.0 - uvOffset.x;
  vUV = aUV.xy + uvOffset * aUV.zw;
  vTint = aTint;
  vDepth = aSpritePos.z + aCorner.y * aDisplaySize.y;

  gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
in vec4 vTint;
in float vDepth;

uniform sampler2D uAtlas;

out vec4 fragColor;

void main() {
  vec4 tex = texture(uAtlas, vUV);
  fragColor = tex * vTint;
  if (fragColor.a < 0.01) discard;
}`;

const MAX_SPRITES = 2000;

const QUAD_CORNERS = new Float32Array([
  0, 0,
  1, 0,
  1, 1,
  0, 0,
  1, 1,
  0, 1,
]);

export class SpriteBatcher {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuffer: WebGLBuffer;
  private uniforms: ReturnType<typeof getUniformLocations>;
  private sprites: Map<number, SpriteData> = new Map();
  private nextId = 1;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, ["uViewProj", "uViewport", "uAtlas"]);

    this.vao = createVertexArray(gl);
    gl.bindVertexArray(this.vao);

    createBuffer(gl, GL.ARRAY_BUFFER, QUAD_CORNERS, GL.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, GL.FLOAT, false, 0, 0);

    const stride = 3 + 4 + 2 + 4 + 1;
    this.instanceBuffer = createBuffer(gl, GL.ARRAY_BUFFER, new Float32Array(MAX_SPRITES * stride), GL.DYNAMIC_DRAW);
    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    let loc = 1;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, GL.FLOAT, false, stride * 4, 0);
    gl.vertexAttribDivisor(loc, 1); loc++;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, GL.FLOAT, false, stride * 4, 12);
    gl.vertexAttribDivisor(loc, 1); loc++;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, GL.FLOAT, false, stride * 4, 28);
    gl.vertexAttribDivisor(loc, 1); loc++;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, GL.FLOAT, false, stride * 4, 36);
    gl.vertexAttribDivisor(loc, 1); loc++;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 1, GL.FLOAT, false, stride * 4, 52);
    gl.vertexAttribDivisor(loc, 1);

    gl.bindVertexArray(null);
  }

  add(sprite: Omit<SpriteData, "id">): number {
    const id = this.nextId++;
    this.sprites.set(id, { ...sprite, id });
    return id;
  }

  update(id: number, updates: Partial<SpriteData>): void {
    const sprite = this.sprites.get(id);
    if (sprite) Object.assign(sprite, updates);
  }

  remove(id: number): void {
    this.sprites.delete(id);
  }

  get(id: number): SpriteData | undefined {
    return this.sprites.get(id);
  }

  clear(): void {
    this.sprites.clear();
  }

  render(viewProj: Float32Array, atlasUnit: number = 0): void {
    const gl = this.gl;
    const visible: SpriteData[] = [];
    for (const s of this.sprites.values()) {
      if (s.visible) visible.push(s);
    }
    if (visible.length === 0) return;

    visible.sort((a, b) => a.y - b.y);

    const stride = 3 + 4 + 2 + 4 + 1;
    const data = new Float32Array(Math.min(visible.length, MAX_SPRITES) * stride);

    for (let i = 0; i < Math.min(visible.length, MAX_SPRITES); i++) {
      const s = visible[i];
      const o = i * stride;
      data[o] = s.x;
      data[o + 1] = s.y;
      data[o + 2] = s.z;
      data[o + 3] = s.u;
      data[o + 4] = s.v;
      data[o + 5] = s.w;
      data[o + 6] = s.h;
      data[o + 7] = s.displayW;
      data[o + 8] = s.displayH;
      data[o + 9] = s.tintR;
      data[o + 10] = s.tintG;
      data[o + 11] = s.tintB;
      data[o + 12] = s.alpha;
      data[o + 13] = s.flip;
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uViewProj, false, viewProj);
    gl.uniform1i(this.uniforms.uAtlas, atlasUnit);

    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(GL.ARRAY_BUFFER, 0, data.subarray(0, Math.min(visible.length, MAX_SPRITES) * stride));

    gl.bindVertexArray(this.vao);
    gl.enable(GL.BLEND);
    gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    gl.enable(GL.DEPTH_TEST);
    gl.depthFunc(GL.LEQUAL);
    gl.drawArraysInstanced(GL.TRIANGLES, 0, 6, Math.min(visible.length, MAX_SPRITES));
    gl.bindVertexArray(null);
  }
}
