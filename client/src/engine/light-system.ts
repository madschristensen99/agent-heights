import type { LightData } from "./types";

export class LightSystem {
  private gl: WebGL2RenderingContext;
  private lights: LightData[] = [];
  private maxLights: number;
  private ambientR = 0.3;
  private ambientG = 0.3;
  private ambientB = 0.4;

  private posData: Float32Array;
  private colorData: Float32Array;
  private radiusData: Float32Array;
  private intensityData: Float32Array;

  constructor(gl: WebGL2RenderingContext, maxLights: number = 32) {
    this.gl = gl;
    this.maxLights = maxLights;
    this.posData = new Float32Array(maxLights * 3);
    this.colorData = new Float32Array(maxLights * 3);
    this.radiusData = new Float32Array(maxLights);
    this.intensityData = new Float32Array(maxLights);
  }

  addLight(light: LightData): number {
    if (this.lights.length >= this.maxLights) {
      this.lights.shift();
    }
    this.lights.push(light);
    return this.lights.length - 1;
  }

  removeLight(index: number): void {
    if (index >= 0 && index < this.lights.length) {
      this.lights.splice(index, 1);
    }
  }

  updateLight(index: number, light: Partial<LightData>): void {
    if (index >= 0 && index < this.lights.length) {
      Object.assign(this.lights[index], light);
    }
  }

  clearLights(): void {
    this.lights = [];
  }

  setAmbient(r: number, g: number, b: number): void {
    this.ambientR = r;
    this.ambientG = g;
    this.ambientB = b;
  }

  getAmbient(): { r: number; g: number; b: number } {
    return { r: this.ambientR, g: this.ambientG, b: this.ambientB };
  }

  getLightCount(): number {
    return this.lights.length;
  }

  getMaxLights(): number {
    return this.maxLights;
  }

  uploadUniforms(
    program: WebGLProgram,
    posLoc: WebGLUniformLocation | null,
    colorLoc: WebGLUniformLocation | null,
    radiusLoc: WebGLUniformLocation | null,
    intensityLoc: WebGLUniformLocation | null,
    countLoc: WebGLUniformLocation | null,
    ambientLoc: WebGLUniformLocation | null,
  ): void {
    const gl = this.gl;
    const count = Math.min(this.lights.length, this.maxLights);

    for (let i = 0; i < count; i++) {
      const l = this.lights[i];
      this.posData[i * 3] = l.x;
      this.posData[i * 3 + 1] = l.y;
      this.posData[i * 3 + 2] = l.z;
      this.colorData[i * 3] = l.r;
      this.colorData[i * 3 + 1] = l.g;
      this.colorData[i * 3 + 2] = l.b;
      this.radiusData[i] = l.radius;
      this.intensityData[i] = l.intensity;
    }

    if (posLoc) gl.uniform3fv(posLoc, this.posData.subarray(0, count * 3));
    if (colorLoc) gl.uniform3fv(colorLoc, this.colorData.subarray(0, count * 3));
    if (radiusLoc) gl.uniform1fv(radiusLoc, this.radiusData.subarray(0, count));
    if (intensityLoc) gl.uniform1fv(intensityLoc, this.intensityData.subarray(0, count));
    if (countLoc) gl.uniform1i(countLoc, count);
    if (ambientLoc) gl.uniform3f(ambientLoc, this.ambientR, this.ambientG, this.ambientB);
  }

  getLights(): readonly LightData[] {
    return this.lights;
  }
}
