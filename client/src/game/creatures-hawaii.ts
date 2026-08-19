import { type CreatureDesign, type FriendlyDesign, type BeastDesign, rgba, lighten, darken, drawEye, drawGroundShadow, drawLimb, drawScales } from "./textures";

// ============================================================
// HAWAII CREATURES — Tropical/island themed
// Low: crab, jellyfish, sea urchin, gecko
// Mid: shark, moray eel, wild boar, giant centipede
// High: mo'o (dragon lizard), volcano spirit, pele's fire guardian
// Boss: pele (volcano goddess), mo'o-nui (great dragon lizard)
// ============================================================

export const HAWAII_CREATURES: CreatureDesign[] = [
  // Hostility 0: Crab — sideways scuttling beach pest
  {
    name: "crab",
    baseColor: 0xd4562c,
    accentColor: 0xf08050,
    eyeColor: 0x222222,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const scuttle = frame === 1 ? 4 : frame === 2 ? -4 : frame === 3 ? 6 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.32);

      ctx.save();
      // shell — dome shape
      const grad = ctx.createRadialGradient(cx - 4, s * 0.4, 2, cx, s * 0.55, s * 0.35);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.3), 1));
      grad.addColorStop(0.6, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + scuttle, s * 0.55, s * 0.32, s * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // shell ridges
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.4), 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(cx + scuttle, s * 0.55, s * (0.28 - i * 0.06), s * (0.2 - i * 0.04), 0, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
      }

      // eyes on stalks
      const stalkY = s * 0.42;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 6 + scuttle, s * 0.5);
      ctx.lineTo(cx - 6 + scuttle, stalkY);
      ctx.moveTo(cx + 6 + scuttle, s * 0.5);
      ctx.lineTo(cx + 6 + scuttle, stalkY);
      ctx.stroke();
      ctx.fillStyle = rgba(c.eyeColor, 1);
      ctx.beginPath();
      ctx.arc(cx - 6 + scuttle, stalkY, 2.5, 0, Math.PI * 2);
      ctx.arc(cx + 6 + scuttle, stalkY, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // claws
      const clawY = s * 0.65;
      const clawOffset = frame === 3 ? 8 : 0;
      ctx.fillStyle = rgba(c.accentColor, 0.9);
      // left claw
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.3 - clawOffset, clawY, s * 0.1, s * 0.07, -0.3, 0, Math.PI * 2);
      ctx.fill();
      // right claw
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.3 + clawOffset, clawY, s * 0.1, s * 0.07, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.8);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const lx = cx - s * 0.2 + i * s * 0.08 + scuttle;
        const rx = cx + s * 0.04 + i * s * 0.08 + scuttle;
        const legPhase = frame === 1 ? (i % 2 === 0 ? 3 : -3) : frame === 2 ? (i % 2 === 0 ? -3 : 3) : 0;
        ctx.beginPath();
        ctx.moveTo(lx, s * 0.7);
        ctx.lineTo(lx - 3, groundY + legPhase);
        ctx.moveTo(rx, s * 0.7);
        ctx.lineTo(rx + 3, groundY - legPhase);
        ctx.stroke();
      }

      // top highlight
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.08 + scuttle, s * 0.42, s * 0.08, s * 0.03, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.3);
      ctx.fill();
      ctx.restore();
    },
  },
  // Hostility 1: Jellyfish — translucent floating menace
  {
    name: "jellyfish",
    baseColor: 0xff69b4,
    accentColor: 0xffb6d9,
    eyeColor: 0x440044,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const pulse = frame === 1 ? 0.9 : frame === 2 ? 1.1 : frame === 3 ? 0.85 : 1;
      drawGroundShadow(ctx, cx, groundY, s * 0.25);

      ctx.save();
      // bell — translucent dome
      const grad = ctx.createRadialGradient(cx, s * 0.35, 2, cx, s * 0.5, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.4), 0.6));
      grad.addColorStop(0.5, rgba(c.baseColor, 0.5));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 0.4));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.45, s * 0.3 * pulse, s * 0.22 * pulse, 0, Math.PI, 0);
      ctx.fill();

      // bell outline
      ctx.strokeStyle = rgba(lighten(c.baseColor, 0.3), 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // tentacles — wavy dangling strands
      ctx.strokeStyle = rgba(c.accentColor, 0.4);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const tx = cx - s * 0.2 + i * s * 0.1;
        const wave = Math.sin(frame * 0.8 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(tx, s * 0.5);
        ctx.quadraticCurveTo(tx + wave, s * 0.65, tx + wave * 0.5, s * 0.8);
        ctx.stroke();
      }

      // inner organs visible through bell
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.42, s * 0.08, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 0.4);
      ctx.fill();

      // eyes — glowing through translucent body
      drawEye(ctx, cx - s * 0.08, s * 0.4, 3, c.eyeColor, false);
      drawEye(ctx, cx + s * 0.08, s * 0.4, 3, c.eyeColor, false);

      // attack frame — extended stinging tentacles
      if (frame === 3) {
        ctx.strokeStyle = rgba(c.baseColor, 0.7);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI - Math.PI * 0.5;
          ctx.beginPath();
          ctx.moveTo(cx, s * 0.5);
          ctx.lineTo(cx + Math.cos(a) * s * 0.35, s * 0.5 + Math.sin(a) * s * 0.3);
          ctx.stroke();
        }
      }

      // top highlight
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.08, s * 0.32, s * 0.06, s * 0.02, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(0xffffff, 0.4);
      ctx.fill();
      ctx.restore();
    },
  },
  // Hostility 2: Shark — streamlined ocean predator
  {
    name: "shark",
    baseColor: 0x4a6a8a,
    accentColor: 0x6a8aaa,
    eyeColor: 0x000000,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.82;
      const swim = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      ctx.save();
      // body — streamlined torpedo shape
      const grad = ctx.createLinearGradient(0, s * 0.35, 0, s * 0.7);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.5, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35 + swim, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.4, cx, s * 0.42);
      ctx.quadraticCurveTo(cx + s * 0.2, s * 0.4, cx + s * 0.3 + swim, s * 0.55);
      ctx.quadraticCurveTo(cx + s * 0.2, s * 0.7, cx, s * 0.68);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.7, cx - s * 0.35 + swim, s * 0.55);
      ctx.fill();

      // dorsal fin
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05 + swim, s * 0.42);
      ctx.lineTo(cx + s * 0.02 + swim, s * 0.28);
      ctx.lineTo(cx + s * 0.08 + swim, s * 0.42);
      ctx.fillStyle = rgba(darken(c.baseColor, 0.1), 1);
      ctx.fill();

      // tail fin
      const tailWave = frame === 1 ? 5 : frame === 2 ? -5 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35 + swim, s * 0.55);
      ctx.lineTo(cx - s * 0.45 + swim, s * 0.42 + tailWave);
      ctx.lineTo(cx - s * 0.42 + swim, s * 0.55);
      ctx.lineTo(cx - s * 0.45 + swim, s * 0.68 - tailWave);
      ctx.closePath();
      ctx.fillStyle = rgba(darken(c.baseColor, 0.15), 1);
      ctx.fill();

      // belly highlight
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.62, s * 0.2, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.4), 0.5);
      ctx.fill();

      // eye — dark and cold
      drawEye(ctx, cx + s * 0.15 + swim, s * 0.5, 2.5, c.eyeColor, false);

      // gills
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.4), 0.6);
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.05 + i * 4 + swim, s * 0.48);
        ctx.lineTo(cx + s * 0.05 + i * 4 + swim, s * 0.58);
        ctx.stroke();
      }

      // mouth — toothy grin
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.22 + swim, s * 0.58);
      ctx.lineTo(cx + s * 0.3 + swim, s * 0.58);
      ctx.strokeStyle = rgba(0x000000, 0.7);
      ctx.lineWidth = 1;
      ctx.stroke();
      // teeth
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.23 + i * 3 + swim, s * 0.58);
        ctx.lineTo(cx + s * 0.24 + i * 3 + swim, s * 0.61);
        ctx.strokeStyle = rgba(0xffffff, 0.8);
        ctx.stroke();
      }

      // attack frame — open jaws
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.2 + swim, s * 0.55);
        ctx.lineTo(cx + s * 0.38, s * 0.5);
        ctx.lineTo(cx + s * 0.38, s * 0.66);
        ctx.closePath();
        ctx.fillStyle = rgba(0x330000, 0.8);
      }
      ctx.restore();
    },
  },
  // Hostility 3: Mo'o — Hawaiian dragon lizard, armored scales
  {
    name: "moo-lizard",
    baseColor: 0x2a6a4a,
    accentColor: 0x4a8a6a,
    eyeColor: 0xffaa00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const lunge = frame === 3 ? 6 : 0;
      const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      drawGroundShadow(ctx, cx + lunge, groundY, s * 0.35);

      ctx.save();
      // body — elongated reptilian
      const grad = ctx.createRadialGradient(cx - 4, s * 0.5, 2, cx, s * 0.55, s * 0.4);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.6, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + lunge, s * 0.55, s * 0.35, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // scale pattern
      drawScales(ctx, cx + lunge, s * 0.55, s * 0.3, s * 0.14, c.baseColor, 5);

      // head — wedge-shaped
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.25 + lunge, s * 0.48);
      ctx.lineTo(cx + s * 0.4 + lunge, s * 0.52);
      ctx.lineTo(cx + s * 0.4 + lunge, s * 0.6);
      ctx.lineTo(cx + s * 0.25 + lunge, s * 0.62);
      ctx.closePath();
      ctx.fillStyle = rgba(darken(c.baseColor, 0.1), 1);
      ctx.fill();

      // crest ridge along back
      ctx.strokeStyle = rgba(c.accentColor, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const px = cx - s * 0.25 + i * s * 0.1 + lunge;
        ctx.moveTo(px, s * 0.42);
        ctx.lineTo(px + 2, s * 0.38);
      }
      ctx.stroke();

      // legs
      drawLimb(ctx, cx - s * 0.15 + lunge, s * 0.65, cx - s * 0.2, groundY + legPhase, 4, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.1 + lunge, s * 0.65, cx + s * 0.15, groundY - legPhase, 4, 2, c.baseColor);

      // tail
      const tailWave = frame === 1 ? 4 : frame === 2 ? -4 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.3 + lunge, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.42 + lunge, s * 0.5 + tailWave, cx - s * 0.45 + lunge, s * 0.65 + tailWave);
      ctx.stroke();

      // eye — glowing amber
      drawEye(ctx, cx + s * 0.32 + lunge, s * 0.53, 3, c.eyeColor);

      // attack — open jaws with fangs
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.35 + lunge, s * 0.55);
        ctx.lineTo(cx + s * 0.45, s * 0.52);
        ctx.lineTo(cx + s * 0.45, s * 0.62);
        ctx.closePath();
        ctx.fillStyle = rgba(0x440000, 0.9);
        ctx.fill();
        // fangs
        ctx.fillStyle = rgba(0xffffff, 0.9);
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.4, s * 0.55);
        ctx.lineTo(cx + s * 0.42, s * 0.6);
        ctx.lineTo(cx + s * 0.44, s * 0.55);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  // Hostility 4: Volcano Spirit — molten rock elemental
  {
    name: "volcano-spirit",
    baseColor: 0x8a2a1a,
    accentColor: 0xff6a2a,
    eyeColor: 0xffff00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const tremble = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 4 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      ctx.save();
      // body — amorphous molten rock
      const grad = ctx.createRadialGradient(cx, s * 0.4, 2, cx, s * 0.55, s * 0.4);
      grad.addColorStop(0, rgba(c.accentColor, 0.9));
      grad.addColorStop(0.3, rgba(lighten(c.baseColor, 0.3), 0.95));
      grad.addColorStop(0.7, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      // jagged rocky outline
      const pts = 8;
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const r = s * (0.3 + Math.sin(i * 2 + frame) * 0.05);
        const px = cx + Math.cos(a) * r + tremble;
        const py = s * 0.55 + Math.sin(a) * r * 0.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // lava cracks — glowing fissures
      ctx.strokeStyle = rgba(c.accentColor, 0.8);
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + frame * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx + tremble, s * 0.55);
        ctx.lineTo(cx + Math.cos(a) * s * 0.25 + tremble, s * 0.55 + Math.sin(a) * s * 0.2);
        ctx.stroke();
      }

      // floating embers
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + frame * 0.5;
        const r = s * 0.3 + Math.sin(frame + i) * 4;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r + tremble, s * 0.5 + Math.sin(a) * r * 0.7, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = rgba(c.accentColor, 0.7);
        ctx.fill();
      }

      // eyes — blazing yellow
      drawEye(ctx, cx - s * 0.08 + tremble, s * 0.48, 4, c.eyeColor);
      drawEye(ctx, cx + s * 0.08 + tremble, s * 0.48, 4, c.eyeColor);

      // attack — erupting
      if (frame === 3) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI - Math.PI;
          ctx.beginPath();
          ctx.moveTo(cx, s * 0.4);
          ctx.lineTo(cx + Math.cos(a) * s * 0.3, s * 0.4 + Math.sin(a) * s * 0.25);
          ctx.strokeStyle = rgba(c.accentColor, 0.6);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  // Hostility 5: Pele's Fire Guardian — towering infernal entity
  {
    name: "fire-guardian",
    baseColor: 0x6a1a0a,
    accentColor: 0xff4a1a,
    eyeColor: 0xffffff,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const rage = frame === 3 ? 5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.38);

      ctx.save();
      // body — tall humanoid made of fire
      const grad = ctx.createLinearGradient(0, s * 0.2, 0, s * 0.85);
      grad.addColorStop(0, rgba(c.accentColor, 0.9));
      grad.addColorStop(0.5, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.5), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15, s * 0.25);
      ctx.lineTo(cx + s * 0.15, s * 0.25);
      ctx.lineTo(cx + s * 0.2 + rage, s * 0.7);
      ctx.lineTo(cx - s * 0.2 + rage, s * 0.7);
      ctx.closePath();
      ctx.fill();

      // flame crown
      for (let i = 0; i < 5; i++) {
        const fx = cx - s * 0.12 + i * s * 0.06;
        const fh = s * (0.15 + Math.sin(frame + i) * 0.04);
        ctx.beginPath();
        ctx.moveTo(fx, s * 0.25);
        ctx.quadraticCurveTo(fx + 3, s * 0.25 - fh, fx + 6, s * 0.25);
        ctx.fillStyle = rgba(c.accentColor, 0.7);
        ctx.fill();
      }

      // arms — flaming limbs
      const armWave = frame === 1 ? 4 : frame === 2 ? -4 : frame === 3 ? 10 : 0;
      drawLimb(ctx, cx - s * 0.12, s * 0.35, cx - s * 0.3 - armWave, s * 0.6, 5, 3, c.baseColor);
      drawLimb(ctx, cx + s * 0.12, s * 0.35, cx + s * 0.3 + armWave, s * 0.6, 5, 3, c.baseColor);

      // lava core
      ctx.beginPath();
      ctx.ellipse(cx + rage, s * 0.5, s * 0.08, s * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(c.accentColor, 0.6);
      ctx.fill();

      // eyes — white-hot
      drawEye(ctx, cx - s * 0.06 + rage, s * 0.35, 3.5, c.eyeColor);
      drawEye(ctx, cx + s * 0.06 + rage, s * 0.35, 3.5, c.eyeColor);

      // attack — fireball
      if (frame === 3) {
        ctx.beginPath();
        ctx.arc(cx + s * 0.35, s * 0.45, s * 0.08, 0, Math.PI * 2);
        const fgrad = ctx.createRadialGradient(cx + s * 0.35, s * 0.45, 0, cx + s * 0.35, s * 0.45, s * 0.08);
        fgrad.addColorStop(0, rgba(0xffffff, 0.9));
        fgrad.addColorStop(0.5, rgba(c.accentColor, 0.8));
        fgrad.addColorStop(1, rgba(c.baseColor, 0.3));
        ctx.fillStyle = fgrad;
        ctx.fill();
      }
      ctx.restore();
    },
  },
];

// ============================================================
// HAWAII FRIENDLY CREATURES — island wildlife
// monk seal, hawaiian hawk, nene goose, honu (sea turtle)
// ============================================================

export const HAWAII_FRIENDLIES: FriendlyDesign[] = [
  // Honu — sea turtle
  {
    name: "honu",
    baseColor: 0x4a7a5a,
    accentColor: 0x6a9a7a,
    eyeColor: 0x224422,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const swim = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? -4 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      ctx.save();
      // shell
      const grad = ctx.createRadialGradient(cx - 4, s * 0.45, 2, cx, s * 0.55, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + swim, s * 0.55, s * 0.3, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // shell pattern — hexagonal scutes
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.3), 0.5);
      ctx.lineWidth = 1;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const px = cx - s * 0.15 + col * s * 0.1 + (row % 2 ? s * 0.05 : 0) + swim;
          const py = s * 0.48 + row * s * 0.06;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + s * 0.04, py + s * 0.02);
          ctx.lineTo(px + s * 0.04, py + s * 0.06);
          ctx.lineTo(px, py + s * 0.08);
          ctx.lineTo(px - s * 0.04, py + s * 0.06);
          ctx.lineTo(px - s * 0.04, py + s * 0.02);
          ctx.closePath();
          ctx.stroke();
        }
      }

      // head
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.28 + swim, s * 0.55, s * 0.08, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.fill();

      // flippers
      ctx.fillStyle = rgba(c.baseColor, 0.9);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.2 + swim, s * 0.65, s * 0.08, s * 0.04, -0.3, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.15 + swim, s * 0.65, s * 0.08, s * 0.04, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // eye
      drawEye(ctx, cx + s * 0.3 + swim, s * 0.53, 2, c.eyeColor, false);
      ctx.restore();
    },
  },
  // Nene — Hawaiian goose
  {
    name: "nene",
    baseColor: 0x8a7a5a,
    accentColor: 0xaa9a7a,
    eyeColor: 0x222222,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const waddle = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? -5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.22);

      ctx.save();
      // body
      const grad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.58, s * 0.25);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + waddle, s * 0.6, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // neck
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.1 + waddle, s * 0.55);
      ctx.lineTo(cx + s * 0.15 + waddle, s * 0.35);
      ctx.lineTo(cx + s * 0.2 + waddle, s * 0.35);
      ctx.lineTo(cx + s * 0.18 + waddle, s * 0.55);
      ctx.fill();

      // head
      ctx.beginPath();
      ctx.arc(cx + s * 0.18 + waddle, s * 0.32, s * 0.06, 0, Math.PI * 2);
      ctx.fill();

      // beak
      ctx.fillStyle = rgba(0x442200, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.24 + waddle, s * 0.32);
      ctx.lineTo(cx + s * 0.3 + waddle, s * 0.33);
      ctx.lineTo(cx + s * 0.24 + waddle, s * 0.34);
      ctx.fill();

      // legs
      ctx.strokeStyle = rgba(0x884400, 1);
      ctx.lineWidth = 2;
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.05 + waddle, s * 0.72);
      ctx.lineTo(cx - s * 0.05 + waddle, groundY + legPhase);
      ctx.moveTo(cx + s * 0.08 + waddle, s * 0.72);
      ctx.lineTo(cx + s * 0.08 + waddle, groundY - legPhase);
      ctx.stroke();

      // cheek stripe
      ctx.fillStyle = rgba(darken(c.baseColor, 0.3), 0.6);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.14 + waddle, s * 0.34, s * 0.04, s * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();

      drawEye(ctx, cx + s * 0.2 + waddle, s * 0.31, 1.5, c.eyeColor, false);
      ctx.restore();
    },
  },
];

// ============================================================
// HAWAII BEASTS — boss-tier creatures
// Pele (volcano goddess), Mo'o-nui (great dragon lizard)
// ============================================================

export const HAWAII_BEASTS: BeastDesign[] = [
  // Pele — Volcano Goddess Avatar
  {
    name: "pele",
    baseColor: 0x8a1a0a,
    accentColor: 0xff5a1a,
    eyeColor: 0xffffaa,
    radius: 36,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 1.5) * 3;
      drawGroundShadow(ctx, cx, groundY, s * 0.4);

      ctx.save();
      // flowing lava body — humanoid female form
      const grad = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.9);
      grad.addColorStop(0, rgba(d.accentColor, 0.9));
      grad.addColorStop(0.3, rgba(d.baseColor, 1));
      grad.addColorStop(0.7, rgba(darken(d.baseColor, 0.3), 1));
      grad.addColorStop(1, rgba(0x220000, 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.12 + sway, s * 0.2);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.4, cx - s * 0.18 + sway, s * 0.7);
      ctx.quadraticCurveTo(cx - s * 0.1, s * 0.85, cx, s * 0.88);
      ctx.quadraticCurveTo(cx + s * 0.1, s * 0.85, cx + s * 0.18 + sway, s * 0.7);
      ctx.quadraticCurveTo(cx + s * 0.2, s * 0.4, cx + s * 0.12 + sway, s * 0.2);
      ctx.quadraticCurveTo(cx, s * 0.15, cx - s * 0.12 + sway, s * 0.2);
      ctx.fill();

      // hair — flowing lava
      for (let i = 0; i < 7; i++) {
        const hx = cx - s * 0.1 + i * s * 0.03 + sway;
        const hh = s * (0.12 + Math.sin(frame + i) * 0.03);
        ctx.beginPath();
        ctx.moveTo(hx, s * 0.22);
        ctx.quadraticCurveTo(hx + 2, s * 0.22 + hh, hx + 4, s * 0.22 + hh * 1.5);
        ctx.strokeStyle = rgba(d.accentColor, 0.7);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // arms
      drawLimb(ctx, cx - s * 0.15 + sway, s * 0.3, cx - s * 0.35, s * 0.55, 6, 3, d.baseColor);
      drawLimb(ctx, cx + s * 0.15 + sway, s * 0.3, cx + s * 0.35, s * 0.55, 6, 3, d.baseColor);

      // lava cracks
      ctx.strokeStyle = rgba(d.accentColor, 0.6);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.08 + sway, s * 0.35 + i * s * 0.15);
        ctx.lineTo(cx + s * 0.05 + sway, s * 0.4 + i * s * 0.15);
        ctx.stroke();
      }

      // eyes — blazing
      drawEye(ctx, cx - s * 0.05 + sway, s * 0.3, 4, d.eyeColor);
      drawEye(ctx, cx + s * 0.05 + sway, s * 0.3, 4, d.eyeColor);

      // attack — fire burst
      if (frame === 3) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, s * 0.5);
          ctx.lineTo(cx + Math.cos(a) * s * 0.3, s * 0.5 + Math.sin(a) * s * 0.25);
          ctx.strokeStyle = rgba(d.accentColor, 0.5);
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  // Mo'o-nui — Great Dragon Lizard
  {
    name: "moo-nui",
    baseColor: 0x1a4a2a,
    accentColor: 0x3a7a5a,
    eyeColor: 0xffcc00,
    radius: 34,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 1.2) * 4;
      drawGroundShadow(ctx, cx, groundY, s * 0.42);

      ctx.save();
      // massive reptilian body
      const grad = ctx.createRadialGradient(cx - 6, s * 0.45, 4, cx, s * 0.55, s * 0.45);
      grad.addColorStop(0, rgba(lighten(d.baseColor, 0.2), 1));
      grad.addColorStop(0.5, rgba(d.baseColor, 1));
      grad.addColorStop(1, rgba(darken(d.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.55, s * 0.4, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // scales
      drawScales(ctx, cx + sway, s * 0.55, s * 0.35, s * 0.16, d.baseColor, 6);

      // head — large wedge
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.3 + sway, s * 0.45);
      ctx.lineTo(cx + s * 0.48 + sway, s * 0.5);
      ctx.lineTo(cx + s * 0.48 + sway, s * 0.62);
      ctx.lineTo(cx + s * 0.3 + sway, s * 0.65);
      ctx.closePath();
      ctx.fillStyle = rgba(darken(d.baseColor, 0.1), 1);
      ctx.fill();

      // spinal crest
      ctx.strokeStyle = rgba(d.accentColor, 0.9);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const px = cx - s * 0.3 + i * s * 0.1 + sway;
        ctx.beginPath();
        ctx.moveTo(px, s * 0.4);
        ctx.lineTo(px + 3, s * 0.33);
        ctx.lineTo(px + 6, s * 0.4);
        ctx.stroke();
      }

      // legs — thick and clawed
      drawLimb(ctx, cx - s * 0.2 + sway, s * 0.68, cx - s * 0.25, groundY, 8, 4, d.baseColor);
      drawLimb(ctx, cx + s * 0.15 + sway, s * 0.68, cx + s * 0.2, groundY, 8, 4, d.baseColor);

      // tail
      ctx.strokeStyle = rgba(d.baseColor, 1);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35 + sway, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.48 + sway, s * 0.5, cx - s * 0.5 + sway, s * 0.7);
      ctx.stroke();

      // eyes — large glowing
      drawEye(ctx, cx + s * 0.38 + sway, s * 0.52, 5, d.eyeColor);
      drawEye(ctx, cx + s * 0.38 + sway, s * 0.58, 4, d.eyeColor);

      // attack — lunging bite
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.4 + sway, s * 0.55);
        ctx.lineTo(cx + s * 0.55, s * 0.5);
        ctx.lineTo(cx + s * 0.55, s * 0.62);
        ctx.closePath();
        ctx.fillStyle = rgba(0x220000, 0.9);
        ctx.fill();
      }
      ctx.restore();
    },
  },
];
