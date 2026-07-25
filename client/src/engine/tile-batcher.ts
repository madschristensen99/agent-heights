const GL = WebGL2RenderingContext;

import type { TileData } from "./types";
import { HEX_SIZE, hexToPixel } from "./hexgrid";
import {
  createProgram, createBuffer, createVertexArray,
  getUniformLocations,
} from "./gl";

const VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aOffset;
layout(location = 2) in float aElevation;
layout(location = 3) in float aTexIndex;
layout(location = 4) in vec3 aTint;
layout(location = 5) in float aAnimFrame;

uniform mat4 uViewProj;
uniform float uHexSize;
uniform float uTileHeight;
uniform float uTime;

out vec2 vUV;
out vec3 vTint;
out float vTexIndex;
out float vElevation;
out vec2 vWorldPos;

void main() {
  vec2 worldPos = aOffset + aCorner * uHexSize;
  float z = aElevation * uTileHeight;
  vWorldPos = worldPos;
  vUV = aCorner * 0.5 + 0.5;
  vTint = aTint;
  vTexIndex = aTexIndex;
  vElevation = aElevation;
  gl_Position = uViewProj * vec4(worldPos, z, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
in vec3 vTint;
in float vTexIndex;
in float vElevation;
in vec2 vWorldPos;

uniform sampler2D uAtlas;
uniform vec4 uTileUV;  // xy=offset, zw=scale
uniform vec3 uAmbient;
uniform int uLightCount;
uniform vec3 uLightPos[32];
uniform vec3 uLightColor[32];
uniform float uLightRadius[32];
uniform float uLightIntensity[32];
uniform float uTime;

out vec4 fragColor;

void main() {
  // 5 tile textures packed horizontally; texIndex selects which one
  float tileW = uTileUV.z / 5.0;
  vec2 atlasUV = vec2(
    uTileUV.x + vTexIndex * tileW + vUV.x * tileW,
    uTileUV.y + vUV.y * uTileUV.w
  );
  vec4 texColor = texture(uAtlas, atlasUV);
  vec3 albedo = texColor.rgb * vTint;

  vec3 lit = uAmbient * albedo;
  for (int i = 0; i < 32; i++) {
    if (i >= uLightCount) break;
    float d = distance(vWorldPos, uLightPos[i].xy);
    float atten = 1.0 - smoothstep(0.0, uLightRadius[i], d);
    lit += uLightColor[i] * albedo * atten * uLightIntensity[i];
  }

  fragColor = vec4(lit, 1.0);
}`;

const SIDE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 aOffset;
layout(location = 2) in float aElevation;
layout(location = 3) in vec3 aTint;

uniform mat4 uViewProj;
uniform float uHexSize;
uniform float uTileHeight;

out vec3 vTint;
out float vDepth;

void main() {
  vec2 worldPos = aOffset + aCorner * uHexSize;
  float z = (aCorner.y > 0.0 ? 1.0 : 0.0) * aElevation * uTileHeight;
  vTint = aTint;
  vDepth = aElevation;
  gl_Position = uViewProj * vec4(worldPos, z, 1.0);
}`;

const SIDE_FRAG = `#version 300 es
precision highp float;

in vec3 vTint;
in float vDepth;

uniform vec3 uAmbient;

out vec4 fragColor;

void main() {
  vec3 color = vTint * 0.5 * uAmbient;
  fragColor = vec4(color, 1.0);
}`;

const MAX_TILES = 10000;

const HEX_CORNERS = new Float32Array([
  1, 0,
  0.5, 0.866025,
  -0.5, 0.866025,
  -1, 0,
  -0.5, -0.866025,
  0.5, -0.866025,
]);

const SIDE_CORNERS = new Float32Array([
  1, 0,  0.5, 1,
  0.5, 1,  -0.5, 1,
  -0.5, 1,  -1, 0,
  -1, 0,  -0.5, 0,
  -0.5, 0,  0.5, 0,
  0.5, 0,  1, 0,
]);

export class TileBatcher {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private sideProgram: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private sideVao: WebGLVertexArrayObject;
  private instanceBuffer: WebGLBuffer;
  private sideInstanceBuffer: WebGLBuffer;
  private uniforms: ReturnType<typeof getUniformLocations>;
  private sideUniforms: ReturnType<typeof getUniformLocations>;
  private tileHeight: number = 16;
  tileUVOffset: [number, number, number, number] = [0, 0, 1, 1];

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERT, FRAG);
    this.sideProgram = createProgram(gl, SIDE_VERT, SIDE_FRAG);
    this.uniforms = getUniformLocations(gl, this.program, [
      "uViewProj", "uHexSize", "uTileHeight", "uTime", "uAtlas", "uTileUV",
      "uAmbient", "uLightCount", "uLightPos", "uLightColor", "uLightRadius", "uLightIntensity",
    ]);
    this.sideUniforms = getUniformLocations(gl, this.sideProgram, [
      "uViewProj", "uHexSize", "uTileHeight", "uAmbient",
    ]);

    this.vao = createVertexArray(gl);
    gl.bindVertexArray(this.vao);

    createBuffer(gl, GL.ARRAY_BUFFER, HEX_CORNERS, GL.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, GL.FLOAT, false, 0, 0);

    this.instanceBuffer = createBuffer(gl, GL.ARRAY_BUFFER, new Float32Array(MAX_TILES * 8), GL.DYNAMIC_DRAW);
    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, GL.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, GL.FLOAT, false, 32, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, GL.FLOAT, false, 32, 12);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, GL.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, GL.FLOAT, false, 32, 28);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);

    this.sideVao = createVertexArray(gl);
    gl.bindVertexArray(this.sideVao);

    createBuffer(gl, GL.ARRAY_BUFFER, SIDE_CORNERS, GL.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, GL.FLOAT, false, 0, 0);

    this.sideInstanceBuffer = createBuffer(gl, GL.ARRAY_BUFFER, new Float32Array(MAX_TILES * 6 * 4), GL.DYNAMIC_DRAW);
    gl.bindBuffer(GL.ARRAY_BUFFER, this.sideInstanceBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, GL.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, GL.FLOAT, false, 24, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, GL.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
  }

  render(
    tiles: TileData[],
    viewProj: Float32Array,
    time: number,
    atlasUnit: number = 0,
  ): void {
    const gl = this.gl;
    if (tiles.length === 0) return;

    const instanceData = new Float32Array(Math.min(tiles.length, MAX_TILES) * 8);
    const sideData = new Float32Array(tiles.length * 6 * 6);
    let sideCount = 0;

    for (let i = 0; i < Math.min(tiles.length, MAX_TILES); i++) {
      const t = tiles[i];
      const pos = hexToPixel(t.q, t.r, HEX_SIZE);
      const o = i * 8;
      instanceData[o] = pos.x;
      instanceData[o + 1] = pos.y;
      instanceData[o + 2] = t.elevation;
      instanceData[o + 3] = t.texIndex;
      instanceData[o + 4] = t.tintR;
      instanceData[o + 5] = t.tintG;
      instanceData[o + 6] = t.tintB;
      instanceData[o + 7] = t.animFrame;

      if (t.elevation > 0) {
        for (let e = 0; e < 6; e++) {
          const so = sideCount * 6;
          sideData[so] = pos.x;
          sideData[so + 1] = pos.y;
          sideData[so + 2] = t.elevation;
          sideData[so + 3] = t.tintR;
          sideData[so + 4] = t.tintG;
          sideData[so + 5] = t.tintB;
          sideCount++;
        }
      }
    }

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.uViewProj, false, viewProj);
    gl.uniform1f(this.uniforms.uHexSize, HEX_SIZE);
    gl.uniform1f(this.uniforms.uTileHeight, this.tileHeight);
    gl.uniform1f(this.uniforms.uTime, time);
    gl.uniform1i(this.uniforms.uAtlas, atlasUnit);
    gl.uniform4f(this.uniforms.uTileUV, this.tileUVOffset[0], this.tileUVOffset[1], this.tileUVOffset[2], this.tileUVOffset[3]);

    gl.bindBuffer(GL.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(GL.ARRAY_BUFFER, 0, instanceData.subarray(0, Math.min(tiles.length, MAX_TILES) * 8));

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(GL.TRIANGLE_FAN, 0, 6, Math.min(tiles.length, MAX_TILES));

    if (sideCount > 0) {
      gl.useProgram(this.sideProgram);
      gl.uniformMatrix4fv(this.sideUniforms.uViewProj, false, viewProj);
      gl.uniform1f(this.sideUniforms.uHexSize, HEX_SIZE);
      gl.uniform1f(this.sideUniforms.uTileHeight, this.tileHeight);

      gl.bindBuffer(GL.ARRAY_BUFFER, this.sideInstanceBuffer);
      gl.bufferSubData(GL.ARRAY_BUFFER, 0, sideData.subarray(0, sideCount * 6));

      gl.bindVertexArray(this.sideVao);
      gl.drawArraysInstanced(GL.TRIANGLES, 0, 6, sideCount);
    }

    gl.bindVertexArray(null);
  }

  setTileHeight(h: number): void {
    this.tileHeight = h;
  }

  setLightUniforms(
    ambient: [number, number, number],
    lightCount: number,
    lightPos: Float32Array,
    lightColor: Float32Array,
    lightRadius: Float32Array,
    lightIntensity: Float32Array,
  ): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform3f(this.uniforms.uAmbient, ambient[0], ambient[1], ambient[2]);
    gl.uniform1i(this.uniforms.uLightCount, lightCount);
    if (lightCount > 0) {
      gl.uniform3fv(this.uniforms.uLightPos, lightPos.subarray(0, lightCount * 3));
      gl.uniform3fv(this.uniforms.uLightColor, lightColor.subarray(0, lightCount * 3));
      gl.uniform1fv(this.uniforms.uLightRadius, lightRadius.subarray(0, lightCount));
      gl.uniform1fv(this.uniforms.uLightIntensity, lightIntensity.subarray(0, lightCount));
    }
  }
}
