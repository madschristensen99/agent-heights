/**
 * Post-processing pipelines for the game.
 * - CRTWarmthPipeline: subtle scanlines, warm color grading, slight vignette boost, bloom-like glow.
 */

const CRT_FRAGMENT = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uResolution;
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

  // gentle bloom — brighten mid-high values
  float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  if (lum > 0.6) {
    color.rgb += (color.rgb - vec3(lum)) * 0.15;
  }

  // subtle CRT curvature — barely perceptible edge darkening
  vec2 center = uv - 0.5;
  float dist = dot(center, center);
  color.rgb *= 1.0 - dist * 0.15;

  gl_FragColor = clamp(color, 0.0, 1.0);
}
`;

export class CRTWarmthPipeline extends Phaser.Renderer.WebGL.Pipelines
  .PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: "CRTWarmth",
      fragShader: CRT_FRAGMENT,
    });
  }

  onPreRender(): void {
    this.set1f("uTime", this.game.loop.time / 1000);
    this.set2f(
      "uResolution",
      this.renderer.width,
      this.renderer.height,
    );
  }
}
