/**
 * Post-processing pipelines for the game.
 *
 * Pipelines:
 * - CRTWarmthPipeline: subtle scanlines, warm color grading, vignette, bloom,
 *   chromatic aberration, night factor support.
 * - BloomPipeline: multi-pass Gaussian bloom for high-luminance areas.
 * - ColorGradePipeline: cinematic color grading with ACES tone mapping.
 * - DOFPipeline: depth-of-field pseudo-blur on screen edges (vignette blur).
 */

import Phaser from "phaser";

// ============================================================
// CRT Warmth — the original pipeline, enhanced
// ============================================================

const CRT_FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uResolution;
uniform float uNightFactor;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec4 color = texture2D(uMainSampler, uv);

  // subtle scanlines — very faint, only visible up close
  float scanline = sin(uv.y * uResolution.y * 0.7) * 0.03;
  color.rgb -= scanline;

  // warm color grading — shift slightly toward amber
  color.r = color.r * 1.02;
  color.g = color.g * 0.99;
  color.b = color.b * 0.96;

  // slight saturation boost
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, 1.08);

  // enhanced bloom — multi-threshold brightening
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  if (lum > 0.55) {
    float bloomStrength = smoothstep(0.55, 0.9, lum);
    color.rgb += (color.rgb - vec3(lum)) * 0.25 * bloomStrength;
  }
  // secondary bloom for very bright areas (fire, lava, glows)
  if (lum > 0.8) {
    color.rgb += color.rgb * 0.08;
  }

  // subtle CRT curvature — barely perceptible edge darkening
  vec2 center = uv - 0.5;
  float dist = dot(center, center);
  color.rgb *= 1.0 - dist * 0.15;

  // night factor darkening — applied when outside at night
  color.rgb *= 1.0 - uNightFactor * 0.15;
  // cool tint at night
  color.b = mix(color.b, color.b * 1.1, uNightFactor * 0.5);

  // chromatic aberration — very subtle, stronger at edges
  float caStrength = dist * 0.008;
  float rChannel = texture2D(uMainSampler, uv + vec2(caStrength, 0.0)).r;
  float bChannel = texture2D(uMainSampler, uv - vec2(caStrength, 0.0)).b;
  color.r = mix(color.r, rChannel, 0.5);
  color.b = mix(color.b, bChannel, 0.5);

  gl_FragColor = clamp(color, 0.0, 1.0);
}
`;

export class CRTWarmthPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  private nightFactor = 0;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: "CRTWarmth",
      fragShader: CRT_FRAGMENT,
    });
  }

  setNightFactor(factor: number): void {
    this.nightFactor = Phaser.Math.Clamp(factor, 0, 1);
  }

  onPreRender(): void {
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set2f(
      "uResolution",
      this.renderer.width,
      this.renderer.height,
    );
    this.set1f("uNightFactor", this.nightFactor);
  }
}

// ============================================================
// Bloom Pipeline — enhanced glow for bright areas
// ============================================================

const BLOOM_FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBloomStrength;
uniform float uBloomThreshold;
varying vec2 outTexCoord;

void main() {
  vec2 texelSize = 1.0 / uResolution;
  vec4 baseColor = texture2D(uMainSampler, outTexCoord);

  // bright-pass: extract only luminance above threshold
  float lum = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 brightColor = baseColor.rgb * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, lum);

  // horizontal blur of bright pass
  vec3 blurredH = brightColor * 0.227027;
  blurredH += texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 2.0, 0.0)).rgb * 0.1945946 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 2.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredH += texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 2.0, 0.0)).rgb * 0.1945946 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 2.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredH += texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 4.0, 0.0)).rgb * 0.1216216 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 4.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredH += texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 4.0, 0.0)).rgb * 0.1216216 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 4.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredH += texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 6.0, 0.0)).rgb * 0.054054 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(texelSize.x * 6.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredH += texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 6.0, 0.0)).rgb * 0.054054 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(texelSize.x * 6.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114)));

  // vertical blur
  vec3 blurredV = brightColor * 0.227027;
  blurredV += texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 2.0)).rgb * 0.1945946 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 2.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredV += texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 2.0)).rgb * 0.1945946 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 2.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredV += texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 4.0)).rgb * 0.1216216 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 4.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredV += texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 4.0)).rgb * 0.1216216 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 4.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredV += texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 6.0)).rgb * 0.054054 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord + vec2(0.0, texelSize.y * 6.0)).rgb, vec3(0.299, 0.587, 0.114)));
  blurredV += texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 6.0)).rgb * 0.054054 * smoothstep(uBloomThreshold, uBloomThreshold + 0.3, dot(texture2D(uMainSampler, outTexCoord - vec2(0.0, texelSize.y * 6.0)).rgb, vec3(0.299, 0.587, 0.114)));

  // composite: base + averaged bloom
  vec3 bloom = (blurredH + blurredV) * 0.5;
  vec3 result = baseColor.rgb + bloom * uBloomStrength;

  gl_FragColor = vec4(clamp(result, 0.0, 1.0), baseColor.a);
}
`;

export class BloomPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  private bloomStrength = 0.6;
  private bloomThreshold = 0.65;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: "BloomFX",
      fragShader: BLOOM_FRAGMENT,
    });
  }

  setStrength(strength: number): void {
    this.bloomStrength = strength;
  }

  setThreshold(threshold: number): void {
    this.bloomThreshold = threshold;
  }

  onPreRender(): void {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set1f("uBloomStrength", this.bloomStrength);
    this.set1f("uBloomThreshold", this.bloomThreshold);
  }
}

// ============================================================
// Color Grade Pipeline — cinematic tone mapping
// ============================================================

const COLOR_GRADE_FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform float uGradeIntensity;
varying vec2 outTexCoord;

// ACES filmic tone mapping approximation
vec3 acesTone(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);

  // ACES tone mapping for cinematic look
  vec3 toned = acesTone(color.rgb * 1.1);

  // color grading — teal shadows, warm highlights (cinematic split-tone)
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  vec3 shadows = vec3(0.85, 0.92, 1.0);   // cool teal
  vec3 highlights = vec3(1.02, 0.98, 0.92); // warm amber
  vec3 grade = mix(shadows, highlights, smoothstep(0.2, 0.8, lum));

  // apply grade with intensity control
  color.rgb = mix(color.rgb, color.rgb * grade, uGradeIntensity);

  // apply tone mapping
  color.rgb = mix(color.rgb, toned, uGradeIntensity * 0.6);

  // subtle film grain
  float grain = fract(sin(dot(outTexCoord * uTime, vec2(12.9898, 78.233))) * 43758.5453);
  color.rgb += (grain - 0.5) * 0.015;

  gl_FragColor = clamp(color, 0.0, 1.0);
}
`;

export class ColorGradePipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  private intensity = 0.5;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: "ColorGrade",
      fragShader: COLOR_GRADE_FRAGMENT,
    });
  }

  setIntensity(intensity: number): void {
    this.intensity = Phaser.Math.Clamp(intensity, 0, 1);
  }

  onPreRender(): void {
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set1f("uGradeIntensity", this.intensity);
  }
}

// ============================================================
// DOF Pipeline — pseudo depth-of-field (edge vignette blur)
// ============================================================

const DOF_FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uDOFStrength;
uniform float uFocusRadius;
varying vec2 outTexCoord;

void main() {
  vec2 uv = outTexCoord;
  vec4 centerColor = texture2D(uMainSampler, uv);

  // distance from center of screen
  vec2 screenCenter = uv - 0.5;
  float distFromCenter = length(screenCenter) * 2.0;

  // blur amount increases outside focus radius
  float blurAmount = smoothstep(uFocusRadius, 1.0, distFromCenter) * uDOFStrength;

  if (blurAmount < 0.01) {
    gl_FragColor = centerColor;
    return;
  }

  // multi-tap blur — sample in a spiral pattern
  vec2 texelSize = 1.0 / uResolution;
  vec3 blurred = vec3(0.0);
  float totalWeight = 0.0;

  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5236;
    float radius = (1.0 + float(i) * 0.5) * blurAmount;
    vec2 offset = vec2(cos(angle), sin(angle)) * radius * texelSize * 4.0;
    vec3 sampleColor = texture2D(uMainSampler, uv + offset).rgb;
    float weight = 1.0 - float(i) / 12.0;
    blurred += sampleColor * weight;
    totalWeight += weight;
  }

  blurred /= totalWeight;

  // blend between sharp center and blurred edges
  vec3 result = mix(centerColor.rgb, blurred, blurAmount);

  gl_FragColor = vec4(clamp(result, 0.0, 1.0), centerColor.a);
}
`;

export class DOFPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  private dofStrength = 0.4;
  private focusRadius = 0.5;

  constructor(game: Phaser.Game) {
    super({
      game,
      name: "DOF",
      fragShader: DOF_FRAGMENT,
    });
  }

  setStrength(strength: number): void {
    this.dofStrength = strength;
  }

  setFocusRadius(radius: number): void {
    this.focusRadius = Phaser.Math.Clamp(radius, 0, 1);
  }

  onPreRender(): void {
    this.set2f("uResolution", this.renderer.width, this.renderer.height);
    this.set1f("uDOFStrength", this.dofStrength);
    this.set1f("uFocusRadius", this.focusRadius);
  }
}
