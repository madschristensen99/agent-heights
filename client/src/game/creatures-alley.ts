import { type CreatureDesign, type FriendlyDesign, type BeastDesign, rgba, lighten, darken, drawEye, drawGroundShadow, drawLimb } from "./textures";

// ============================================================
// ERICS ALLEY CREATURES — Urban/street themed
// Low: rat, feral cat, pigeon, cockroach
// Mid: junkyard dog, sewer gator, giant rat
// High: tunnel mutant, ghost hobo, demon dealer
// Boss: rat king, urban legend
// ============================================================

export const ALLEY_CREATURES: CreatureDesign[] = [
  // Hostility 0: Rat — scurrying urban pest
  {
    name: "rat",
    baseColor: 0x6a5a4a,
    accentColor: 0x8a7a6a,
    eyeColor: 0xff3300,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const scurry = frame === 1 ? 4 : frame === 2 ? -4 : frame === 3 ? 6 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.22);

      ctx.save();
      // body
      const grad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.55, s * 0.25);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + scurry, s * 0.58, s * 0.22, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // head — pointed
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.15 + scurry, s * 0.52);
      ctx.lineTo(cx + s * 0.3 + scurry, s * 0.55);
      ctx.lineTo(cx + s * 0.15 + scurry, s * 0.6);
      ctx.fill();

      // ears
      ctx.fillStyle = rgba(darken(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.12 + scurry, s * 0.46, s * 0.04, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // tail — long and pink
      ctx.strokeStyle = rgba(0xcc8888, 1);
      ctx.lineWidth = 2;
      const tailWave = frame === 1 ? 4 : frame === 2 ? -4 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18 + scurry, s * 0.58);
      ctx.quadraticCurveTo(cx - s * 0.3 + scurry, s * 0.55 + tailWave, cx - s * 0.35 + scurry, s * 0.65 + tailWave);
      ctx.stroke();

      // legs
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      drawLimb(ctx, cx - s * 0.08 + scurry, s * 0.66, cx - s * 0.1, groundY + legPhase, 2, 1, c.baseColor);
      drawLimb(ctx, cx + s * 0.06 + scurry, s * 0.66, cx + s * 0.08, groundY - legPhase, 2, 1, c.baseColor);

      // eye
      drawEye(ctx, cx + s * 0.2 + scurry, s * 0.53, 2, c.eyeColor, false);

      ctx.restore();
    },
  },
  // Hostility 1: Feral Cat — scruffy alley cat
  {
    name: "feral-cat",
    baseColor: 0x4a3a2a,
    accentColor: 0x6a5a4a,
    eyeColor: 0x88ff00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const prowl = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.25);

      ctx.save();
      // body
      const grad = ctx.createRadialGradient(cx - 3, s * 0.48, 2, cx, s * 0.55, s * 0.28);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + prowl, s * 0.55, s * 0.25, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // scruffy fur
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.5);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.22 + prowl, s * 0.55 + Math.sin(a) * s * 0.13);
        ctx.lineTo(cx + Math.cos(a) * s * 0.25 + prowl, s * 0.55 + Math.sin(a) * s * 0.15);
        ctx.stroke();
      }

      // head
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.2 + prowl, s * 0.48, s * 0.1, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears — torn
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.16 + prowl, s * 0.42);
      ctx.lineTo(cx + s * 0.14 + prowl, s * 0.35);
      ctx.lineTo(cx + s * 0.2 + prowl, s * 0.4);
      ctx.moveTo(cx + s * 0.24 + prowl, s * 0.42);
      ctx.lineTo(cx + s * 0.26 + prowl, s * 0.36);
      ctx.lineTo(cx + s * 0.2 + prowl, s * 0.4);
      ctx.fill();

      // eyes — feral green
      drawEye(ctx, cx + s * 0.17 + prowl, s * 0.47, 2.5, c.eyeColor, false);
      drawEye(ctx, cx + s * 0.23 + prowl, s * 0.47, 2.5, c.eyeColor, false);

      // legs
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      drawLimb(ctx, cx - s * 0.12 + prowl, s * 0.65, cx - s * 0.14, groundY + legPhase, 3, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.04 + prowl, s * 0.65, cx + s * 0.06, groundY - legPhase, 3, 2, c.baseColor);

      // tail
      const tailWave = frame === 1 ? 4 : frame === 2 ? -4 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22 + prowl, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.32 + prowl, s * 0.5 + tailWave, cx - s * 0.35 + prowl, s * 0.45 + tailWave);
      ctx.stroke();

      ctx.restore();
    },
  },
  // Hostility 2: Junkyard Dog — aggressive mutt
  {
    name: "junkyard-dog",
    baseColor: 0x5a4a3a,
    accentColor: 0x7a6a5a,
    eyeColor: 0xff4400,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const lunge = frame === 3 ? 5 : 0;
      const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      drawGroundShadow(ctx, cx + lunge, groundY, s * 0.3);

      ctx.save();
      // body — stocky
      const grad = ctx.createRadialGradient(cx - 4, s * 0.48, 2, cx, s * 0.55, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + lunge, s * 0.55, s * 0.28, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // head — broad
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.22 + lunge, s * 0.48, s * 0.13, s * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();

      // snout
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.32 + lunge, s * 0.52, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears — cropped
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.16 + lunge, s * 0.42);
      ctx.lineTo(cx + s * 0.14 + lunge, s * 0.36);
      ctx.lineTo(cx + s * 0.2 + lunge, s * 0.4);
      ctx.moveTo(cx + s * 0.26 + lunge, s * 0.42);
      ctx.lineTo(cx + s * 0.28 + lunge, s * 0.36);
      ctx.lineTo(cx + s * 0.22 + lunge, s * 0.4);
      ctx.fill();

      // eyes
      drawEye(ctx, cx + s * 0.2 + lunge, s * 0.47, 2.5, c.eyeColor);
      drawEye(ctx, cx + s * 0.28 + lunge, s * 0.47, 2.5, c.eyeColor);

      // teeth — bared
      ctx.fillStyle = rgba(0xffffff, 0.8);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.3 + i * 3 + lunge, s * 0.56);
        ctx.lineTo(cx + s * 0.31 + i * 3 + lunge, s * 0.59);
        ctx.lineTo(cx + s * 0.32 + i * 3 + lunge, s * 0.56);
        ctx.fill();
      }

      // legs
      drawLimb(ctx, cx - s * 0.15 + lunge, s * 0.66, cx - s * 0.18, groundY + legPhase, 4, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.08 + lunge, s * 0.66, cx + s * 0.1, groundY - legPhase, 4, 2, c.baseColor);

      // tail — short, stiff
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.25 + lunge, s * 0.55);
      ctx.lineTo(cx - s * 0.3 + lunge, s * 0.48);
      ctx.stroke();

      ctx.restore();
    },
  },
  // Hostility 3: Tunnel Mutant — subterranean horror
  {
    name: "tunnel-mutant",
    baseColor: 0x3a4a3a,
    accentColor: 0x5a7a5a,
    eyeColor: 0xff00ff,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const shamble = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.32);

      ctx.save();
      // body — amorphous, lumpy
      const grad = ctx.createRadialGradient(cx, s * 0.4, 2, cx, s * 0.55, s * 0.35);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.6, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      const pts = 7;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = s * (0.28 + Math.sin(i * 3 + frame) * 0.06);
        const px = cx + Math.cos(a) * r + shamble;
        const py = s * 0.55 + Math.sin(a) * r * 0.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // toxic spots
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + frame * 0.3;
        const r = s * 0.15;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r + shamble, s * 0.55 + Math.sin(a) * r * 0.7, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(c.accentColor, 0.6);
        ctx.fill();
      }

      // multiple eyes
      drawEye(ctx, cx - s * 0.1 + shamble, s * 0.45, 2.5, c.eyeColor);
      drawEye(ctx, cx + s * 0.08 + shamble, s * 0.42, 2.5, c.eyeColor);
      drawEye(ctx, cx + s * 0.12 + shamble, s * 0.52, 2, c.eyeColor);

      // tendrils
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.8);
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const tx = cx - s * 0.15 + i * s * 0.1 + shamble;
        ctx.beginPath();
        ctx.moveTo(tx, s * 0.68);
        ctx.quadraticCurveTo(tx + Math.sin(frame + i) * 3, s * 0.75, tx, s * 0.8);
        ctx.stroke();
      }

      ctx.restore();
    },
  },
  // Hostility 4: Ghost Hobo — spectral vagrant
  {
    name: "ghost-hobo",
    baseColor: 0x5a5a7a,
    accentColor: 0x8a8aaa,
    eyeColor: 0x00ffff,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const float = frame === 1 ? -2 : frame === 2 ? 2 : frame === 3 ? -3 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.25);

      ctx.save();
      // body — translucent ghostly figure
      const grad = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.9);
      grad.addColorStop(0, rgba(c.accentColor, 0.5));
      grad.addColorStop(0.5, rgba(c.baseColor, 0.6));
      grad.addColorStop(1, rgba(c.baseColor, 0.1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.14, s * 0.25 + float);
      ctx.lineTo(cx + s * 0.14, s * 0.25 + float);
      ctx.lineTo(cx + s * 0.18, s * 0.65 + float);
      ctx.quadraticCurveTo(cx + s * 0.12, s * 0.85, cx + s * 0.06, s * 0.85 + float);
      ctx.quadraticCurveTo(cx, s * 0.78, cx - s * 0.06, s * 0.85 + float);
      ctx.quadraticCurveTo(cx - s * 0.12, s * 0.85, cx - s * 0.18, s * 0.65 + float);
      ctx.closePath();
      ctx.fill();

      // hat — tattered fedora
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 0.7);
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.24 + float, s * 0.1, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(cx - s * 0.06, s * 0.16 + float, s * 0.12, s * 0.08);
      ctx.fill();

      // eyes — hollow glowing
      drawEye(ctx, cx - s * 0.06, s * 0.33 + float, 4, c.eyeColor);
      drawEye(ctx, cx + s * 0.06, s * 0.33 + float, 4, c.eyeColor);

      // tattered coat details
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1, s * 0.4 + float);
      ctx.lineTo(cx - s * 0.12, s * 0.6 + float);
      ctx.moveTo(cx + s * 0.1, s * 0.4 + float);
      ctx.lineTo(cx + s * 0.12, s * 0.6 + float);
      ctx.stroke();

      ctx.restore();
    },
  },
  // Hostility 5: Demon Dealer — suited infernal entity
  {
    name: "demon-dealer",
    baseColor: 0x2a1a1a,
    accentColor: 0x6a1a1a,
    eyeColor: 0xff0000,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const menace = frame === 3 ? 4 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.32);

      ctx.save();
      // body — sharp suit
      const grad = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.85);
      grad.addColorStop(0, rgba(darken(c.baseColor, 0.1), 1));
      grad.addColorStop(0.5, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15 + menace, s * 0.25);
      ctx.lineTo(cx + s * 0.15 + menace, s * 0.25);
      ctx.lineTo(cx + s * 0.2 + menace, s * 0.8);
      ctx.lineTo(cx - s * 0.2 + menace, s * 0.8);
      ctx.closePath();
      ctx.fill();

      // suit lapels
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.3), 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + menace, s * 0.28);
      ctx.lineTo(cx - s * 0.12 + menace, s * 0.5);
      ctx.moveTo(cx + s * 0.08 + menace, s * 0.28);
      ctx.lineTo(cx + s * 0.12 + menace, s * 0.5);
      ctx.stroke();

      // tie — red
      ctx.fillStyle = rgba(c.accentColor, 0.9);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.02 + menace, s * 0.28);
      ctx.lineTo(cx + s * 0.02 + menace, s * 0.28);
      ctx.lineTo(cx + s * 0.03 + menace, s * 0.45);
      ctx.lineTo(cx, s * 0.5);
      ctx.lineTo(cx - s * 0.03 + menace, s * 0.45);
      ctx.fill();

      // horns
      ctx.fillStyle = rgba(darken(c.baseColor, 0.5), 1);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + menace, s * 0.25);
      ctx.quadraticCurveTo(cx - s * 0.12 + menace, s * 0.15, cx - s * 0.06 + menace, s * 0.12);
      ctx.moveTo(cx + s * 0.08 + menace, s * 0.25);
      ctx.quadraticCurveTo(cx + s * 0.12 + menace, s * 0.15, cx + s * 0.06 + menace, s * 0.12);
      ctx.fill();

      // eyes — burning
      drawEye(ctx, cx - s * 0.06 + menace, s * 0.3, 4, c.eyeColor);
      drawEye(ctx, cx + s * 0.06 + menace, s * 0.3, 4, c.eyeColor);

      // arms
      drawLimb(ctx, cx - s * 0.14 + menace, s * 0.32, cx - s * 0.28, s * 0.6, 4, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.14 + menace, s * 0.32, cx + s * 0.28, s * 0.6, 4, 2, c.baseColor);

      // attack — dark pact
      if (frame === 3) {
        ctx.fillStyle = rgba(c.eyeColor, 0.3);
        ctx.beginPath();
        ctx.arc(cx + s * 0.28, s * 0.55, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },
];

// ============================================================
// ALLEY FRIENDLY CREATURES — urban wildlife
// stray cat, pigeon, tame raccoon
// ============================================================

export const ALLEY_FRIENDLIES: FriendlyDesign[] = [
  // Stray Cat — friendly moggie
  {
    name: "stray-cat",
    baseColor: 0x8a7a5a,
    accentColor: 0xaa9a7a,
    eyeColor: 0x44aa44,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const step = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? -3 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.22);

      ctx.save();
      const grad = ctx.createRadialGradient(cx - 3, s * 0.48, 2, cx, s * 0.55, s * 0.25);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + step, s * 0.55, s * 0.22, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.18 + step, s * 0.47, s * 0.09, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.14 + step, s * 0.42);
      ctx.lineTo(cx + s * 0.12 + step, s * 0.35);
      ctx.lineTo(cx + s * 0.18 + step, s * 0.4);
      ctx.moveTo(cx + s * 0.22 + step, s * 0.42);
      ctx.lineTo(cx + s * 0.24 + step, s * 0.35);
      ctx.lineTo(cx + s * 0.18 + step, s * 0.4);
      ctx.fill();

      // tail
      const tailWave = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2 + step, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.3 + step, s * 0.5 + tailWave, cx - s * 0.32 + step, s * 0.45 + tailWave);
      ctx.stroke();

      // legs
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + step, s * 0.65);
      ctx.lineTo(cx - s * 0.1, groundY + legPhase);
      ctx.moveTo(cx + s * 0.06 + step, s * 0.65);
      ctx.lineTo(cx + s * 0.08, groundY - legPhase);
      ctx.stroke();

      drawEye(ctx, cx + s * 0.16 + step, s * 0.46, 2, c.eyeColor, false);
      drawEye(ctx, cx + s * 0.22 + step, s * 0.46, 2, c.eyeColor, false);
      ctx.restore();
    },
  },
  // Pigeon — classic city bird
  {
    name: "pigeon",
    baseColor: 0x8a8a9a,
    accentColor: 0xaa9aaa,
    eyeColor: 0xff8800,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const peck = frame === 3 ? 3 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.18);

      ctx.save();
      const grad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.58, s * 0.2);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.58 + peck, s * 0.18, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.beginPath();
      ctx.arc(cx + s * 0.12, s * 0.46 + peck, s * 0.07, 0, Math.PI * 2);
      ctx.fill();

      // beak
      ctx.fillStyle = rgba(0xcc8844, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18, s * 0.47 + peck);
      ctx.lineTo(cx + s * 0.24, s * 0.48 + peck);
      ctx.lineTo(cx + s * 0.18, s * 0.5 + peck);
      ctx.fill();

      // iridescent neck
      ctx.fillStyle = rgba(lighten(c.accentColor, 0.2), 0.5);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.08, s * 0.52 + peck, s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.strokeStyle = rgba(0xcc8844, 1);
      ctx.lineWidth = 1.5;
      const legPhase = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.04, s * 0.7 + peck);
      ctx.lineTo(cx - s * 0.04, groundY + legPhase);
      ctx.moveTo(cx + s * 0.04, s * 0.7 + peck);
      ctx.lineTo(cx + s * 0.04, groundY - legPhase);
      ctx.stroke();

      drawEye(ctx, cx + s * 0.14, s * 0.45 + peck, 1.5, c.eyeColor, false);
      ctx.restore();
    },
  },
];

// ============================================================
// ALLEY BEASTS — boss-tier creatures
// Rat King, Urban Legend
// ============================================================

export const ALLEY_BEASTS: BeastDesign[] = [
  // Rat King — tangled mass of rats
  {
    name: "rat-king",
    baseColor: 0x4a3a2a,
    accentColor: 0x6a5a4a,
    eyeColor: 0xff0000,
    radius: 32,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const writhe = Math.sin(frame * 2) * 3;
      drawGroundShadow(ctx, cx, groundY, s * 0.38);

      ctx.save();
      // central mass
      const grad = ctx.createRadialGradient(cx, s * 0.5, 4, cx, s * 0.55, s * 0.35);
      grad.addColorStop(0, rgba(lighten(d.baseColor, 0.2), 1));
      grad.addColorStop(0.6, rgba(d.baseColor, 1));
      grad.addColorStop(1, rgba(darken(d.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + writhe, s * 0.55, s * 0.3, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // tangled tails
      ctx.strokeStyle = rgba(0xcc8888, 0.8);
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * s * 0.2 + writhe, s * 0.55 + Math.sin(a) * s * 0.15);
        ctx.quadraticCurveTo(
          cx + Math.cos(a) * s * 0.35 + writhe,
          s * 0.55 + Math.sin(a) * s * 0.25,
          cx + Math.cos(a + 0.5) * s * 0.38 + writhe,
          s * 0.55 + Math.sin(a + 0.5) * s * 0.3,
        );
        ctx.stroke();
      }

      // multiple rat heads poking out
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + frame * 0.2;
        const hx = cx + Math.cos(a) * s * 0.25 + writhe;
        const hy = s * 0.55 + Math.sin(a) * s * 0.18;
        ctx.fillStyle = rgba(lighten(d.baseColor, 0.1), 1);
        ctx.beginPath();
        ctx.ellipse(hx, hy, s * 0.06, s * 0.05, a, 0, Math.PI * 2);
        ctx.fill();
        // eye
        drawEye(ctx, hx + Math.cos(a) * 3, hy + Math.sin(a) * 3, 2, d.eyeColor);
      }

      ctx.restore();
    },
  },
  // Urban Legend — tall faceless figure
  {
    name: "urban-legend",
    baseColor: 0x1a1a2a,
    accentColor: 0x3a3a4a,
    eyeColor: 0xffffff,
    radius: 34,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 0.8) * 2;
      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      ctx.save();
      // body — impossibly tall, thin
      const grad = ctx.createLinearGradient(0, s * 0.05, 0, s * 0.9);
      grad.addColorStop(0, rgba(d.baseColor, 1));
      grad.addColorStop(1, rgba(darken(d.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.1 + sway, s * 0.08);
      ctx.lineTo(cx + s * 0.1 + sway, s * 0.08);
      ctx.lineTo(cx + s * 0.14 + sway, s * 0.85);
      ctx.lineTo(cx - s * 0.14 + sway, s * 0.85);
      ctx.closePath();
      ctx.fill();

      // long arms — unnaturally extended
      const armWave = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 8 : 0;
      drawLimb(ctx, cx - s * 0.1 + sway, s * 0.15, cx - s * 0.35, s * 0.55 + armWave, 3, 1, d.baseColor);
      drawLimb(ctx, cx + s * 0.1 + sway, s * 0.15, cx + s * 0.35, s * 0.55 - armWave, 3, 1, d.baseColor);

      // face — blank, pale
      ctx.fillStyle = rgba(0xeeeeee, 0.15);
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.18, s * 0.06, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();

      // eyes — featureless white
      drawEye(ctx, cx - s * 0.04 + sway, s * 0.17, 3, d.eyeColor, false);
      drawEye(ctx, cx + s * 0.04 + sway, s * 0.17, 3, d.eyeColor, false);

      // tendrils from back
      ctx.strokeStyle = rgba(d.baseColor, 0.6);
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const tx = cx - s * 0.08 + i * s * 0.05 + sway;
        ctx.beginPath();
        ctx.moveTo(tx, s * 0.1);
        ctx.quadraticCurveTo(tx + Math.sin(frame + i) * 5, s * 0.2, tx, s * 0.3);
        ctx.stroke();
      }

      ctx.restore();
    },
  },
];
