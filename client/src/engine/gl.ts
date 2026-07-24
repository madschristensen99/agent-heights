const GL = WebGL2RenderingContext;

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("WebGL2 not supported");
  return gl;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, GL.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertSource: string,
  fragSource: string,
): WebGLProgram {
  const vert = compileShader(gl, GL.VERTEX_SHADER, vertSource);
  const frag = compileShader(gl, GL.FRAGMENT_SHADER, fragSource);
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, GL.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

export function createBuffer(
  gl: WebGL2RenderingContext,
  target: number = GL.ARRAY_BUFFER,
  data: ArrayBuffer | ArrayBufferView | null = null,
  usage: number = GL.DYNAMIC_DRAW,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("Failed to create buffer");
  gl.bindBuffer(target, buffer);
  if (data) gl.bufferData(target, data, usage);
  return buffer;
}

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number = GL.RGBA8,
  filter: number = GL.LINEAR,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create texture");
  gl.bindTexture(GL.TEXTURE_2D, texture);
  gl.texImage2D(GL.TEXTURE_2D, 0, internalFormat, width, height, 0, GL.RGBA, GL.UNSIGNED_BYTE, null);
  gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
  gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
  return texture;
}

export function createFramebuffer(gl: WebGL2RenderingContext): WebGLFramebuffer {
  const fb = gl.createFramebuffer();
  if (!fb) throw new Error("Failed to create framebuffer");
  return fb;
}

export function createVertexArray(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("Failed to create VAO");
  return vao;
}

export interface UniformLocations {
  [name: string]: WebGLUniformLocation | null;
}

export function getUniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[],
): UniformLocations {
  const locs: UniformLocations = {};
  for (const name of names) {
    locs[name] = gl.getUniformLocation(program, name);
  }
  return locs;
}

export function getAttribLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: string[],
): Record<string, number> {
  const locs: Record<string, number> = {};
  for (const name of names) {
    locs[name] = gl.getAttribLocation(program, name);
  }
  return locs;
}

export function setUniformMatrix4(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  value: Float32Array,
): void {
  if (loc) gl.uniformMatrix4fv(loc, false, value);
}

export function setUniform3f(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  x: number,
  y: number,
  z: number,
): void {
  if (loc) gl.uniform3f(loc, x, y, z);
}

export function setUniform1i(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  v: number,
): void {
  if (loc) gl.uniform1i(loc, v);
}

export function setUniform1f(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  v: number,
): void {
  if (loc) gl.uniform1f(loc, v);
}

export function setUniform2f(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  x: number,
  y: number,
): void {
  if (loc) gl.uniform2f(loc, x, y);
}

export function setUniform4fv(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  v: Float32Array,
): void {
  if (loc) gl.uniform4fv(loc, v);
}

export function setUniform3fv(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  v: Float32Array,
): void {
  if (loc) gl.uniform3fv(loc, v);
}

export function setUniform1fv(
  gl: WebGL2RenderingContext,
  loc: WebGLUniformLocation | null,
  v: Float32Array,
): void {
  if (loc) gl.uniform1fv(loc, v);
}

const FULLSCREEN_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export function createFullscreenProgram(
  gl: WebGL2RenderingContext,
  fragSource: string,
): WebGLProgram {
  return createProgram(gl, FULLSCREEN_VERT, fragSource);
}

export function initFullscreenQuad(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } {
  const vao = createVertexArray(gl);
  gl.bindVertexArray(vao);
  const vbo = createBuffer(gl, GL.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), GL.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, GL.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vbo };
}
