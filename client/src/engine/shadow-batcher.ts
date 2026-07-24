const GL = WebGL2RenderingContext;

import type { ShadowData } from "./types";
import {
  createProgram, createBuffer, createVertexArray,
  getUniformLocations,
} from "./gl";

const VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aPos;
layout(location = 2) in float aSize;
layout(location = 3) in float aAlpha;

uniform mat4 uViewProj;

out vec2 vUV;
out float vAlpha;

void main() {
  vUV = aCorner;
  vAlpha = aAlpha;
  vec2 worldPos = aPos + aCorner * aSize;
  gl_Position = uViewProj * vec4(worldPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
in float vAlpha;

out vec4 fragColor;

void main() {
  float d = length(vUV);
  float alpha = smoothstep(1.0, 0.0, d) * vAlpha * 0.4;
  fragColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

const MAX_SHADOWS = 500;

const QUAD_CORNERS = new Float32Array([
  -1, -1,
  1, -1,
  1, 1,
  -1, -1,
  1, 1,
  -1, 1,
]);

export class ShadowBatcher {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instanceBuffer: WebGLBuffer;
  private uniforms: ReturnType<typeof getUniformLocations>;
  private shadows: ShadowData[] = [];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, ["uViewProj"]);

    this.vao = createVertexArray(gl);
    gl.bindVertexArray(this.vao);

    createBuffer(gl, GL.ARRAY_BUFFER, QUAD_CORNERS, GL.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, GL.FLOAT, false, 0, 0);

    this.instanceBuffer = createBuffer(gl, GL.ARRAY_BUFFER, new Float32Array(MAX_SHADOWS * 4), GL.DYNAMIC_DRAW);
    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, GL.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, GL.FLOAT, false, 16, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, GL.FLOAT, false, 16, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  add(shadow: ShadowData): void {
    if (this.shadows.length >= MAX_SHADOWS) this.shadows.shift();
    this.shadows.push(shadow);
  }

  clear(): void {
    this.shadows = [];
  }

  render(viewProj: Float32Array): void {
    const gl = this.gl;
    if (this.shadows.length === 0) return;

    const data = new Float32Array(Math.min(this.shadows.length, MAX_SHADOWS) * 4);
    for (let i = 0; i < Math.min(this.shadows.length, MAX_SHADOWS); i++) {
      const s = this.shadows[i];
      data[i * 4] = s.x;
      data[i * 4 + 1] = s.y;
      data[i * 4 + 2] = s.size;
      data[i * 4 + 3] = s.alpha;
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uViewProj, false, viewProj);

    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(GL.ARRAY_BUFFER, 0, data.subarray(0, Math.min(this.shadows.length, MAX_SHADOWS) * 4));

    gl.bindVertexArray(this.vao);
    gl.enable(GL.BLEND);
    gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(GL.TRIANGLES, 0, 6, Math.min(this.shadows.length, MAX_SHADOWS));
    gl.bindVertexArray(null);
  }
}
