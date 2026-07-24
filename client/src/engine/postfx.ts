const GL = WebGL2RenderingContext;

import {
  createProgram, createTexture, createFramebuffer,
  initFullscreenQuad, getUniformLocations,
} from "./gl";

const BLOOM_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform float uThreshold;
uniform float uIntensity;
out vec4 fragColor;
void main() {
  vec3 color = texture(uTexture, vUV).rgb;
  float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
  if (brightness > uThreshold) {
    fragColor = vec4(color * uIntensity, 1.0);
  } else {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uDirection;
out vec4 fragColor;
void main() {
  vec2 offset1 = uDirection * uTexelSize;
  vec2 offset2 = offset1 * 2.0;
  vec2 offset3 = offset1 * 3.0;
  vec3 color = texture(uTexture, vUV).rgb * 0.227027;
  color += texture(uTexture, vUV + offset1).rgb * 0.1945946;
  color += texture(uTexture, vUV - offset1).rgb * 0.1945946;
  color += texture(uTexture, vUV + offset2).rgb * 0.1216216;
  color += texture(uTexture, vUV - offset2).rgb * 0.1216216;
  color += texture(uTexture, vUV + offset3).rgb * 0.054054;
  color += texture(uTexture, vUV - offset3).rgb * 0.054054;
  fragColor = vec4(color, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
out vec4 fragColor;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  fragColor = vec4(scene + bloom, 1.0);
}`;

const COLOR_GRADE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform float uTime;
out vec4 fragColor;

vec3 acesTonemap(vec3 color) {
  float a = 2.51; float b = 0.03; float c = 2.43;
  float d = 0.59; float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

void main() {
  vec3 color = texture(uTexture, vUV).rgb;
  color = acesTonemap(color);
  float warmth = 0.05 * sin(uTime * 0.0001);
  color.r += warmth;
  color.b -= warmth;
  color = pow(color, vec3(0.9));
  fragColor = vec4(color, 1.0);
}`;

const DOF_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uFocusCenter;
uniform float uFocusRadius;
uniform float uDOFStrength;
uniform int uMode;
out vec4 fragColor;

void main() {
  float blurAmount;
  if (uMode == 1) {
    float bandDist = abs(vUV.y - uFocusCenter.y);
    blurAmount = smoothstep(uFocusRadius, uFocusRadius + 0.3, bandDist) * uDOFStrength;
  } else {
    float dist = distance(vUV, uFocusCenter);
    blurAmount = smoothstep(uFocusRadius, uFocusRadius + 0.3, dist) * uDOFStrength;
  }

  if (blurAmount < 0.01) {
    fragColor = texture(uTexture, vUV);
    return;
  }

  vec3 color = vec3(0.0);
  float total = 0.0;
  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      vec2 offset = vec2(float(x), float(y)) * uTexelSize * blurAmount * 4.0;
      float weight = 1.0 / (1.0 + float(x*x + y*y));
      color += texture(uTexture, vUV + offset).rgb * weight;
      total += weight;
    }
  }
  fragColor = vec4(color / total, 1.0);
}`;

export class PostFX {
  private gl: WebGL2RenderingContext;
  private width: number;
  private height: number;

  private sceneFBO: WebGLFramebuffer;
  private sceneTexture: WebGLTexture;
  private sceneDepthBuffer: WebGLRenderbuffer;
  private bloomFBO: WebGLFramebuffer;
  private bloomTexture: WebGLTexture;
  private blurFBO: WebGLFramebuffer;
  private blurTexture: WebGLTexture;
  private gradeFBO: WebGLFramebuffer;
  private gradeTexture: WebGLTexture;

  private bloomProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private compositeProgram: WebGLProgram;
  private gradeProgram: WebGLProgram;
  private dofProgram: WebGLProgram;

  private fullscreenVAO: WebGLVertexArrayObject;

  private bloomUniforms: ReturnType<typeof getUniformLocations>;
  private blurUniforms: ReturnType<typeof getUniformLocations>;
  private compositeUniforms: ReturnType<typeof getUniformLocations>;
  private gradeUniforms: ReturnType<typeof getUniformLocations>;
  private dofUniforms: ReturnType<typeof getUniformLocations>;

  private enabled = true;
  private dofMode: 0 | 1 = 1;
  private bloomThreshold = 0.6;
  private bloomIntensity = 0.8;
  private dofStrength = 0.5;
  private dofFocusRadius = 0.3;
  private dofFocusCenter: [number, number] = [0.5, 0.5];

  constructor(gl: WebGL2RenderingContext, width: number, height: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;

    this.sceneTexture = createTexture(gl, width, height, GL.RGBA8, GL.LINEAR);
    this.sceneFBO = createFramebuffer(gl);
    this.sceneDepthBuffer = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(GL.RENDERBUFFER, this.sceneDepthBuffer);
    gl.renderbufferStorage(GL.RENDERBUFFER, GL.DEPTH24_STENCIL8, width, height);
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, this.sceneTexture, 0);
    gl.framebufferRenderbuffer(GL.FRAMEBUFFER, GL.DEPTH_STENCIL_ATTACHMENT, GL.RENDERBUFFER, this.sceneDepthBuffer);

    this.bloomTexture = createTexture(gl, width, height, GL.RGBA8, GL.LINEAR);
    this.bloomFBO = createFramebuffer(gl);
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.bloomFBO);
    gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, this.bloomTexture, 0);

    this.blurTexture = createTexture(gl, width, height, GL.RGBA8, GL.LINEAR);
    this.blurFBO = createFramebuffer(gl);
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.blurFBO);
    gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, this.blurTexture, 0);

    this.gradeTexture = createTexture(gl, width, height, GL.RGBA8, GL.LINEAR);
    this.gradeFBO = createFramebuffer(gl);
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.gradeFBO);
    gl.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, this.gradeTexture, 0);

    gl.bindFramebuffer(GL.FRAMEBUFFER, null);

    this.bloomProgram = createProgram(gl, this.getFullscreenVert(), BLOOM_FRAG);
    this.blurProgram = createProgram(gl, this.getFullscreenVert(), BLUR_FRAG);
    this.compositeProgram = createProgram(gl, this.getFullscreenVert(), COMPOSITE_FRAG);
    this.gradeProgram = createProgram(gl, this.getFullscreenVert(), COLOR_GRADE_FRAG);
    this.dofProgram = createProgram(gl, this.getFullscreenVert(), DOF_FRAG);

    this.bloomUniforms = getUniformLocations(gl, this.bloomProgram, ["uTexture", "uThreshold", "uIntensity"]);
    this.blurUniforms = getUniformLocations(gl, this.blurProgram, ["uTexture", "uTexelSize", "uDirection"]);
    this.compositeUniforms = getUniformLocations(gl, this.compositeProgram, ["uScene", "uBloom"]);
    this.gradeUniforms = getUniformLocations(gl, this.gradeProgram, ["uTexture", "uTime"]);
    this.dofUniforms = getUniformLocations(gl, this.dofProgram, [
      "uTexture", "uTexelSize", "uFocusCenter", "uFocusRadius", "uDOFStrength", "uMode",
    ]);

    this.fullscreenVAO = initFullscreenQuad(gl).vao;
  }

  private getFullscreenVert(): string {
    return `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
  }

  bindSceneFBO(): void {
    const gl = this.gl;
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.sceneFBO);
    gl.clearColor(0.20, 0.20, 0.21, 1.0);
    gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
  }

  render(time: number): void {
    if (!this.enabled) {
      this.blitToScreen();
      return;
    }
    const gl = this.gl;

    // Bloom: extract bright areas
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.bloomFBO);
    gl.useProgram(this.bloomProgram);
    gl.uniform1i(this.bloomUniforms.uTexture, 0);
    gl.uniform1f(this.bloomUniforms.uThreshold, this.bloomThreshold);
    gl.uniform1f(this.bloomUniforms.uIntensity, this.bloomIntensity);
    this.drawFullscreen(this.sceneTexture);

    // Blur horizontal
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.blurFBO);
    gl.useProgram(this.blurProgram);
    gl.uniform1i(this.blurUniforms.uTexture, 0);
    gl.uniform2f(this.blurUniforms.uTexelSize, 1.0 / this.width, 1.0 / this.height);
    gl.uniform2f(this.blurUniforms.uDirection, 1, 0);
    this.drawFullscreen(this.bloomTexture);

    // Blur vertical (back to bloom FBO)
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.bloomFBO);
    gl.useProgram(this.blurProgram);
    gl.uniform2f(this.blurUniforms.uDirection, 0, 1);
    this.drawFullscreen(this.blurTexture);

    // Composite scene + bloom
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.gradeFBO);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(GL.TEXTURE0);
    gl.bindTexture(GL.TEXTURE_2D, this.sceneTexture);
    gl.uniform1i(this.compositeUniforms.uScene, 0);
    gl.activeTexture(GL.TEXTURE1);
    gl.bindTexture(GL.TEXTURE_2D, this.bloomTexture);
    gl.uniform1i(this.compositeUniforms.uBloom, 1);
    this.drawFullscreenNoBind();

    // Color grade
    gl.bindFramebuffer(GL.FRAMEBUFFER, this.blurFBO);
    gl.useProgram(this.gradeProgram);
    gl.uniform1i(this.gradeUniforms.uTexture, 0);
    gl.uniform1f(this.gradeUniforms.uTime, time);
    this.drawFullscreen(this.gradeTexture);

    // DOF → screen
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
    gl.useProgram(this.dofProgram);
    gl.uniform1i(this.dofUniforms.uTexture, 0);
    gl.uniform2f(this.dofUniforms.uTexelSize, 1.0 / this.width, 1.0 / this.height);
    gl.uniform2f(this.dofUniforms.uFocusCenter, this.dofFocusCenter[0], this.dofFocusCenter[1]);
    gl.uniform1f(this.dofUniforms.uFocusRadius, this.dofFocusRadius);
    gl.uniform1f(this.dofUniforms.uDOFStrength, this.dofStrength);
    gl.uniform1i(this.dofUniforms.uMode, this.dofMode);
    this.drawFullscreen(this.blurTexture);
  }

  private drawFullscreen(tex: WebGLTexture): void {
    const gl = this.gl;
    gl.activeTexture(GL.TEXTURE0);
    gl.bindTexture(GL.TEXTURE_2D, tex);
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawFullscreenNoBind(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fullscreenVAO);
    gl.drawArrays(GL.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private blitToScreen(): void {
    const gl = this.gl;
    gl.bindFramebuffer(GL.READ_FRAMEBUFFER, this.sceneFBO);
    gl.bindFramebuffer(GL.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, GL.COLOR_BUFFER_BIT, GL.NEAREST);
    gl.bindFramebuffer(GL.FRAMEBUFFER, null);
  }

  resize(width: number, height: number): void {
    const gl = this.gl;
    this.width = width;
    this.height = height;
    for (const tex of [this.sceneTexture, this.bloomTexture, this.blurTexture, this.gradeTexture]) {
      gl.bindTexture(GL.TEXTURE_2D, tex);
      gl.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA8, width, height, 0, GL.RGBA, GL.UNSIGNED_BYTE, null);
    }
    gl.bindRenderbuffer(GL.RENDERBUFFER, this.sceneDepthBuffer);
    gl.renderbufferStorage(GL.RENDERBUFFER, GL.DEPTH24_STENCIL8, width, height);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setDOFMode(mode: 0 | 1): void {
    this.dofMode = mode;
  }

  setDOFStrength(strength: number): void {
    this.dofStrength = strength;
  }

  setDOFFocus(center: [number, number], radius: number): void {
    this.dofFocusCenter = center;
    this.dofFocusRadius = radius;
  }

  setBloom(threshold: number, intensity: number): void {
    this.bloomThreshold = threshold;
    this.bloomIntensity = intensity;
  }
}
