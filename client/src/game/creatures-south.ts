import { type CreatureDesign, type FriendlyDesign, type BeastDesign, rgba, lighten, darken, drawEye, drawGroundShadow, drawLimb } from "./textures";

// ============================================================
// OLD SOUTH CREATURES — Southern folklore and wildlife
// Low: raccoon, possum, crow, rabbit
// Mid: wild boar, rattlesnake, alligator, black panther
// High: wampus cat, rougarou (Cajun werewolf), mothman
// Boss: spectral general, infernal plantation owner
// ============================================================

export const SOUTH_CREATURES: CreatureDesign[] = [
  // Hostility 0: Raccoon — masked bandit
  {
    name: "raccoon",
    baseColor: 0x6a6a7a,
    accentColor: 0x8a8a9a,
    eyeColor: 0xffcc00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const scurry = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.28);

      ctx.save();
      // body
      const grad = ctx.createRadialGradient(cx - 4, s * 0.5, 2, cx, s * 0.55, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.6, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + scurry, s * 0.58, s * 0.28, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // striped tail
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 1);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22 + scurry, s * 0.58);
      ctx.quadraticCurveTo(cx - s * 0.35 + scurry, s * 0.55, cx - s * 0.38 + scurry, s * 0.7);
      ctx.stroke();
      // tail rings
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.5), 1);
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const tx = cx - s * 0.28 - i * s * 0.04 + scurry;
        ctx.beginPath();
        ctx.moveTo(tx, s * 0.56);
        ctx.lineTo(tx, s * 0.62 + i * 2);
        ctx.stroke();
      }

      // head
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.22 + scurry, s * 0.5, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // mask — black eye band
      ctx.fillStyle = rgba(0x222233, 0.8);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.22 + scurry, s * 0.48, s * 0.1, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18 + scurry, s * 0.42);
      ctx.lineTo(cx + s * 0.16 + scurry, s * 0.36);
      ctx.lineTo(cx + s * 0.22 + scurry, s * 0.4);
      ctx.moveTo(cx + s * 0.26 + scurry, s * 0.42);
      ctx.lineTo(cx + s * 0.28 + scurry, s * 0.36);
      ctx.lineTo(cx + s * 0.22 + scurry, s * 0.4);
      ctx.fill();

      // eyes — glowing in mask
      drawEye(ctx, cx + s * 0.18 + scurry, s * 0.48, 2, c.eyeColor, false);
      drawEye(ctx, cx + s * 0.26 + scurry, s * 0.48, 2, c.eyeColor, false);

      // legs
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      drawLimb(ctx, cx - s * 0.1 + scurry, s * 0.68, cx - s * 0.12, groundY + legPhase, 3, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.08 + scurry, s * 0.68, cx + s * 0.1, groundY - legPhase, 3, 2, c.baseColor);

      ctx.restore();
    },
  },
  // Hostility 1: Possum — hissing marsupial
  {
    name: "possum",
    baseColor: 0x8a8a8a,
    accentColor: 0xaaaaaa,
    eyeColor: 0x222222,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const waddle = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 4 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.28);

      ctx.save();
      // body — scruffy
      const grad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.55, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.25), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + waddle, s * 0.58, s * 0.26, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // scruffy fur texture
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.5);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = s * 0.25;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r + waddle, s * 0.58 + Math.sin(a) * r * 0.6);
        ctx.lineTo(cx + Math.cos(a) * (r + 3) + waddle, s * 0.58 + Math.sin(a) * (r + 3) * 0.6);
        ctx.stroke();
      }

      // head — pointed snout
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18 + waddle, s * 0.5);
      ctx.lineTo(cx + s * 0.35 + waddle, s * 0.54);
      ctx.lineTo(cx + s * 0.18 + waddle, s * 0.58);
      ctx.fill();

      // pink nose
      ctx.fillStyle = rgba(0xcc8888, 1);
      ctx.beginPath();
      ctx.arc(cx + s * 0.34 + waddle, s * 0.54, 2, 0, Math.PI * 2);
      ctx.fill();

      // ears
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.16 + waddle, s * 0.44, s * 0.04, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();

      // tail — prehensile, hairless
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.3), 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22 + waddle, s * 0.58);
      ctx.quadraticCurveTo(cx - s * 0.32 + waddle, s * 0.6, cx - s * 0.35 + waddle, s * 0.5);
      ctx.stroke();

      // eyes
      drawEye(ctx, cx + s * 0.22 + waddle, s * 0.52, 2, c.eyeColor, false);

      // legs
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      drawLimb(ctx, cx - s * 0.08 + waddle, s * 0.66, cx - s * 0.1, groundY + legPhase, 3, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.06 + waddle, s * 0.66, cx + s * 0.08, groundY - legPhase, 3, 2, c.baseColor);

      // attack — hissing, mouth open showing teeth
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.28 + waddle, s * 0.54);
        ctx.lineTo(cx + s * 0.38, s * 0.52);
        ctx.lineTo(cx + s * 0.38, s * 0.58);
        ctx.closePath();
        ctx.fillStyle = rgba(0x442222, 0.9);
        ctx.fill();
        // teeth
        ctx.fillStyle = rgba(0xffffff, 0.9);
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + s * 0.3 + i * 2 + waddle, s * 0.54);
          ctx.lineTo(cx + s * 0.31 + i * 2 + waddle, s * 0.57);
          ctx.lineTo(cx + s * 0.32 + i * 2 + waddle, s * 0.54);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  // Hostility 2: Alligator — armored swamp predator
  {
    name: "alligator",
    baseColor: 0x2a4a2a,
    accentColor: 0x4a6a4a,
    eyeColor: 0xffaa00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const lunge = frame === 3 ? 6 : 0;
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      drawGroundShadow(ctx, cx + lunge, groundY, s * 0.38);

      ctx.save();
      // body — low and elongated
      const grad = ctx.createLinearGradient(0, s * 0.45, 0, s * 0.7);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.38 + lunge, s * 0.58);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.48, cx, s * 0.5);
      ctx.quadraticCurveTo(cx + s * 0.25, s * 0.48, cx + s * 0.35 + lunge, s * 0.55);
      ctx.lineTo(cx + s * 0.38 + lunge, s * 0.6);
      ctx.quadraticCurveTo(cx + s * 0.2, s * 0.68, cx, s * 0.68);
      ctx.quadraticCurveTo(cx - s * 0.2, s * 0.68, cx - s * 0.38 + lunge, s * 0.58);
      ctx.fill();

      // back scutes — bony ridges
      ctx.fillStyle = rgba(darken(c.baseColor, 0.2), 1);
      for (let i = 0; i < 6; i++) {
        const px = cx - s * 0.28 + i * s * 0.09 + lunge;
        ctx.beginPath();
        ctx.moveTo(px, s * 0.48);
        ctx.lineTo(px + 3, s * 0.44);
        ctx.lineTo(px + 6, s * 0.48);
        ctx.fill();
      }

      // head — broad snout
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.25 + lunge, s * 0.52);
      ctx.lineTo(cx + s * 0.45 + lunge, s * 0.55);
      ctx.lineTo(cx + s * 0.45 + lunge, s * 0.62);
      ctx.lineTo(cx + s * 0.25 + lunge, s * 0.62);
      ctx.fill();

      // teeth — visible along jaw
      ctx.fillStyle = rgba(0xffffff, 0.8);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.3 + i * 4 + lunge, s * 0.62);
        ctx.lineTo(cx + s * 0.31 + i * 4 + lunge, s * 0.65);
        ctx.lineTo(cx + s * 0.32 + i * 4 + lunge, s * 0.62);
        ctx.fill();
      }

      // legs
      drawLimb(ctx, cx - s * 0.18 + lunge, s * 0.66, cx - s * 0.22, groundY + legPhase, 5, 3, c.baseColor);
      drawLimb(ctx, cx + s * 0.12 + lunge, s * 0.66, cx + s * 0.16, groundY - legPhase, 5, 3, c.baseColor);

      // tail
      const tailWave = frame === 1 ? 4 : frame === 2 ? -4 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35 + lunge, s * 0.58);
      ctx.quadraticCurveTo(cx - s * 0.45 + lunge, s * 0.55 + tailWave, cx - s * 0.48 + lunge, s * 0.65 + tailWave);
      ctx.stroke();

      // eye — on top of head
      drawEye(ctx, cx + s * 0.28 + lunge, s * 0.5, 2.5, c.eyeColor);

      // attack — open jaws
      if (frame === 3) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.28 + lunge, s * 0.55);
        ctx.lineTo(cx + s * 0.48, s * 0.5);
        ctx.lineTo(cx + s * 0.48, s * 0.65);
        ctx.closePath();
        ctx.fillStyle = rgba(0x330000, 0.9);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  // Hostility 3: Wampus Cat — supernatural feline
  {
    name: "wampus-cat",
    baseColor: 0x3a3a4a,
    accentColor: 0x6a6a8a,
    eyeColor: 0xff0000,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const prowl = frame === 1 ? 3 : frame === 2 ? -3 : frame === 3 ? 7 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      ctx.save();
      // body — feline, low slung
      const grad = ctx.createRadialGradient(cx - 4, s * 0.48, 2, cx, s * 0.55, s * 0.32);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.7, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + prowl, s * 0.55, s * 0.3, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.25 + prowl, s * 0.48, s * 0.12, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // ears — pointed
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.2 + prowl, s * 0.42);
      ctx.lineTo(cx + s * 0.18 + prowl, s * 0.34);
      ctx.lineTo(cx + s * 0.24 + prowl, s * 0.4);
      ctx.moveTo(cx + s * 0.28 + prowl, s * 0.42);
      ctx.lineTo(cx + s * 0.3 + prowl, s * 0.34);
      ctx.lineTo(cx + s * 0.24 + prowl, s * 0.4);
      ctx.fill();

      // glowing eyes — supernatural red
      drawEye(ctx, cx + s * 0.21 + prowl, s * 0.47, 3, c.eyeColor);
      drawEye(ctx, cx + s * 0.29 + prowl, s * 0.47, 3, c.eyeColor);

      // legs — stealthy
      const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      drawLimb(ctx, cx - s * 0.15 + prowl, s * 0.65, cx - s * 0.18, groundY + legPhase, 3, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.05 + prowl, s * 0.65, cx + s * 0.08, groundY - legPhase, 3, 2, c.baseColor);
      drawLimb(ctx, cx + s * 0.15 + prowl, s * 0.65, cx + s * 0.18, groundY + legPhase, 3, 2, c.baseColor);

      // tail — long and sinuous
      const tailWave = frame === 1 ? 5 : frame === 2 ? -5 : 0;
      ctx.strokeStyle = rgba(c.baseColor, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.28 + prowl, s * 0.55);
      ctx.quadraticCurveTo(cx - s * 0.4 + prowl, s * 0.5 + tailWave, cx - s * 0.42 + prowl, s * 0.4 + tailWave);
      ctx.stroke();

      // whisker glow
      ctx.strokeStyle = rgba(c.accentColor, 0.4);
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.3 + prowl, s * 0.5 + i * 2);
        ctx.lineTo(cx + s * 0.38 + prowl, s * 0.49 + i * 2);
        ctx.stroke();
      }

      // attack — pouncing
      if (frame === 3) {
        ctx.fillStyle = rgba(0x440000, 0.9);
        ctx.beginPath();
        ctx.arc(cx + s * 0.35 + prowl, s * 0.5, s * 0.04, 0, Math.PI);
        ctx.fill();
        // claws
        ctx.strokeStyle = rgba(0xffffff, 0.9);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + s * 0.32 + i * 3 + prowl, s * 0.6);
          ctx.lineTo(cx + s * 0.34 + i * 3 + prowl, s * 0.68);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  // Hostility 4: Rougarou — Cajun werewolf
  {
    name: "rougarou",
    baseColor: 0x5a4a3a,
    accentColor: 0x7a6a5a,
    eyeColor: 0xffaa00,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.85;
      const stalk = frame === 1 ? 2 : frame === 2 ? -2 : frame === 3 ? 6 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      ctx.save();
      // body — muscular humanoid-wolf
      const grad = ctx.createRadialGradient(cx - 5, s * 0.4, 2, cx, s * 0.55, s * 0.35);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(0.5, rgba(c.baseColor, 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.4), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18 + stalk, s * 0.3);
      ctx.lineTo(cx + s * 0.18 + stalk, s * 0.3);
      ctx.lineTo(cx + s * 0.22 + stalk, s * 0.7);
      ctx.lineTo(cx - s * 0.22 + stalk, s * 0.7);
      ctx.closePath();
      ctx.fill();

      // fur texture
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.2), 0.6);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 12; i++) {
        const fx = cx - s * 0.15 + Math.random() * s * 0.3 + stalk;
        const fy = s * 0.35 + Math.random() * s * 0.3;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + 1, fy + 4);
        ctx.stroke();
      }

      // head — wolf snout
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.1 + stalk, s * 0.28);
      ctx.lineTo(cx + s * 0.3 + stalk, s * 0.32);
      ctx.lineTo(cx + s * 0.3 + stalk, s * 0.42);
      ctx.lineTo(cx + s * 0.1 + stalk, s * 0.4);
      ctx.fill();

      // ears — pointed wolf
      ctx.fillStyle = rgba(c.baseColor, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.05 + stalk, s * 0.25);
      ctx.lineTo(cx + s * 0.02 + stalk, s * 0.15);
      ctx.lineTo(cx + s * 0.12 + stalk, s * 0.22);
      ctx.moveTo(cx + s * 0.18 + stalk, s * 0.25);
      ctx.lineTo(cx + s * 0.22 + stalk, s * 0.15);
      ctx.lineTo(cx + s * 0.12 + stalk, s * 0.22);
      ctx.fill();

      // eyes — feral glow
      drawEye(ctx, cx + s * 0.15 + stalk, s * 0.33, 3, c.eyeColor);
      drawEye(ctx, cx + s * 0.22 + stalk, s * 0.33, 3, c.eyeColor);

      // arms — clawed
      drawLimb(ctx, cx - s * 0.15 + stalk, s * 0.35, cx - s * 0.3, s * 0.6, 5, 3, c.baseColor);
      drawLimb(ctx, cx + s * 0.15 + stalk, s * 0.35, cx + s * 0.3, s * 0.6, 5, 3, c.baseColor);

      // legs
      const legPhase = frame === 1 ? 3 : frame === 2 ? -3 : 0;
      drawLimb(ctx, cx - s * 0.1 + stalk, s * 0.68, cx - s * 0.12, groundY + legPhase, 5, 3, c.baseColor);
      drawLimb(ctx, cx + s * 0.1 + stalk, s * 0.68, cx + s * 0.12, groundY - legPhase, 5, 3, c.baseColor);

      // attack — slashing claws
      if (frame === 3) {
        ctx.strokeStyle = rgba(0xffffff, 0.9);
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + s * 0.3, s * 0.55 + i * 4);
          ctx.lineTo(cx + s * 0.4, s * 0.53 + i * 4);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  // Hostility 5: Mothman — winged supernatural harbinger
  {
    name: "mothman",
    baseColor: 0x1a1a2a,
    accentColor: 0x3a3a5a,
    eyeColor: 0xff0000,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const hover = frame === 1 ? -2 : frame === 2 ? 2 : frame === 3 ? -4 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.32);

      ctx.save();
      // body — dark humanoid
      const grad = ctx.createRadialGradient(cx, s * 0.4, 2, cx, s * 0.55, s * 0.3);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.15), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.5 + hover, s * 0.18, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      // wings — large, moth-like
      const wingFlap = frame === 1 ? 8 : frame === 2 ? -8 : frame === 3 ? 12 : 0;
      ctx.fillStyle = rgba(darken(c.baseColor, 0.2), 0.8);
      // left wing
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15, s * 0.4 + hover);
      ctx.quadraticCurveTo(cx - s * 0.4, s * 0.3 + hover - wingFlap, cx - s * 0.42, s * 0.5 + hover);
      ctx.quadraticCurveTo(cx - s * 0.3, s * 0.55 + hover, cx - s * 0.15, s * 0.55 + hover);
      ctx.fill();
      // right wing
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.15, s * 0.4 + hover);
      ctx.quadraticCurveTo(cx + s * 0.4, s * 0.3 + hover + wingFlap, cx + s * 0.42, s * 0.5 + hover);
      ctx.quadraticCurveTo(cx + s * 0.3, s * 0.55 + hover, cx + s * 0.15, s * 0.55 + hover);
      ctx.fill();

      // wing veins
      ctx.strokeStyle = rgba(c.accentColor, 0.4);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.15, s * 0.42 + hover);
        ctx.lineTo(cx - s * 0.35 + i * 3, s * (0.35 + i * 0.05) + hover - wingFlap);
        ctx.moveTo(cx + s * 0.15, s * 0.42 + hover);
        ctx.lineTo(cx + s * 0.35 - i * 3, s * (0.35 + i * 0.05) + hover + wingFlap);
        ctx.stroke();
      }

      // eyes — large, red, hypnotic
      drawEye(ctx, cx - s * 0.07, s * 0.38 + hover, 5, c.eyeColor);
      drawEye(ctx, cx + s * 0.07, s * 0.38 + hover, 5, c.eyeColor);

      // attack — diving with spread wings
      if (frame === 3) {
        ctx.strokeStyle = rgba(c.eyeColor, 0.4);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, s * 0.4 + hover, s * 0.15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
];

// ============================================================
// OLD SOUTH FRIENDLY CREATURES — Southern wildlife
// cardinal, fox squirrel, box turtle, bobwhite quail
// ============================================================

export const SOUTH_FRIENDLIES: FriendlyDesign[] = [
  // Cardinal — bright red songbird
  {
    name: "cardinal",
    baseColor: 0xc0202a,
    accentColor: 0xe0404a,
    eyeColor: 0x222222,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const hop = frame === 3 ? -5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.18);

      ctx.save();
      // body
      const grad = ctx.createRadialGradient(cx - 3, s * 0.5, 2, cx, s * 0.58, s * 0.22);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.2), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, s * 0.58 + hop, s * 0.18, s * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // head
      ctx.beginPath();
      ctx.arc(cx, s * 0.42 + hop, s * 0.09, 0, Math.PI * 2);
      ctx.fill();

      // crest
      ctx.fillStyle = rgba(lighten(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.04, s * 0.35 + hop);
      ctx.lineTo(cx - s * 0.02, s * 0.28 + hop);
      ctx.lineTo(cx + s * 0.02, s * 0.3 + hop);
      ctx.lineTo(cx + s * 0.04, s * 0.35 + hop);
      ctx.fill();

      // beak — orange
      ctx.fillStyle = rgba(0xee8822, 1);
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.08, s * 0.42 + hop);
      ctx.lineTo(cx + s * 0.16, s * 0.43 + hop);
      ctx.lineTo(cx + s * 0.08, s * 0.44 + hop);
      ctx.fill();

      // face mask
      ctx.fillStyle = rgba(0x222222, 0.6);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.04, s * 0.43 + hop, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.strokeStyle = rgba(0xee8822, 1);
      ctx.lineWidth = 1.5;
      const legPhase = frame === 1 ? 2 : frame === 2 ? -2 : 0;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.04, s * 0.7 + hop);
      ctx.lineTo(cx - s * 0.04, groundY + legPhase);
      ctx.moveTo(cx + s * 0.04, s * 0.7 + hop);
      ctx.lineTo(cx + s * 0.04, groundY - legPhase);
      ctx.stroke();

      drawEye(ctx, cx + s * 0.02, s * 0.41 + hop, 1.5, c.eyeColor, false);
      ctx.restore();
    },
  },
  // Box Turtle — slow dome-shell reptile
  {
    name: "box-turtle",
    baseColor: 0x6a5a3a,
    accentColor: 0x8a7a5a,
    eyeColor: 0x224422,
    size: 28,
    draw: (ctx, frame, s, c) => {
      const cx = s * 0.5;
      const groundY = s * 0.88;
      const step = frame === 1 ? 1.5 : frame === 2 ? -1.5 : 0;
      drawGroundShadow(ctx, cx, groundY, s * 0.25);

      ctx.save();
      // shell — high dome
      const grad = ctx.createRadialGradient(cx - 3, s * 0.4, 2, cx, s * 0.5, s * 0.28);
      grad.addColorStop(0, rgba(lighten(c.baseColor, 0.2), 1));
      grad.addColorStop(1, rgba(darken(c.baseColor, 0.3), 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx + step, s * 0.5, s * 0.25, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // shell pattern — starburst scutes
      ctx.strokeStyle = rgba(darken(c.baseColor, 0.3), 0.6);
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + step, s * 0.48);
        ctx.lineTo(cx + Math.cos(a) * s * 0.2 + step, s * 0.48 + Math.sin(a) * s * 0.18);
        ctx.stroke();
      }

      // head
      ctx.fillStyle = rgba(darken(c.baseColor, 0.1), 1);
      ctx.beginPath();
      ctx.ellipse(cx + s * 0.22 + step, s * 0.58, s * 0.07, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs
      ctx.fillStyle = rgba(darken(c.baseColor, 0.15), 1);
      ctx.beginPath();
      ctx.ellipse(cx - s * 0.15 + step, s * 0.68, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + s * 0.1 + step, s * 0.68, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      drawEye(ctx, cx + s * 0.24 + step, s * 0.57, 1.5, c.eyeColor, false);
      ctx.restore();
    },
  },
];

// ============================================================
// OLD SOUTH BEASTS — boss-tier creatures
// Spectral General, Infernal Plantation Owner
// ============================================================

export const SOUTH_BEASTS: BeastDesign[] = [
  // Spectral General — ghostly Civil War officer
  {
    name: "spectral-general",
    baseColor: 0x4a4a6a,
    accentColor: 0x8a8aaa,
    eyeColor: 0x66ffff,
    radius: 34,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 1.5) * 3;
      drawGroundShadow(ctx, cx, groundY, s * 0.3);

      ctx.save();
      // ghostly body — translucent
      const grad = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.9);
      grad.addColorStop(0, rgba(d.accentColor, 0.5));
      grad.addColorStop(0.5, rgba(d.baseColor, 0.6));
      grad.addColorStop(1, rgba(d.baseColor, 0.1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.15 + sway, s * 0.2);
      ctx.lineTo(cx + s * 0.15 + sway, s * 0.2);
      ctx.lineTo(cx + s * 0.2 + sway, s * 0.7);
      // wispy bottom
      ctx.quadraticCurveTo(cx + s * 0.15, s * 0.85, cx + s * 0.08 + sway, s * 0.88);
      ctx.quadraticCurveTo(cx, s * 0.82, cx - s * 0.08 + sway, s * 0.88);
      ctx.quadraticCurveTo(cx - s * 0.15, s * 0.85, cx - s * 0.2 + sway, s * 0.7);
      ctx.closePath();
      ctx.fill();

      // uniform details — coat buttons
      ctx.fillStyle = rgba(0xcccc44, 0.6);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + sway, s * 0.35 + i * s * 0.1, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // belt
      ctx.strokeStyle = rgba(0x4a3a2a, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.16 + sway, s * 0.5);
      ctx.lineTo(cx + s * 0.16 + sway, s * 0.5);
      ctx.stroke();

      // sword — ethereal
      ctx.strokeStyle = rgba(d.eyeColor, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.18 + sway, s * 0.4);
      ctx.lineTo(cx + s * 0.35, s * 0.55);
      ctx.stroke();

      // eyes — glowing icy blue
      drawEye(ctx, cx - s * 0.06 + sway, s * 0.3, 4, d.eyeColor);
      drawEye(ctx, cx + s * 0.06 + sway, s * 0.3, 4, d.eyeColor);

      // hat — officer's cap
      ctx.fillStyle = rgba(darken(d.baseColor, 0.2), 0.7);
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.22, s * 0.12, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + sway, s * 0.22);
      ctx.lineTo(cx - s * 0.06 + sway, s * 0.15);
      ctx.lineTo(cx + s * 0.06 + sway, s * 0.15);
      ctx.lineTo(cx + s * 0.08 + sway, s * 0.22);
      ctx.fill();

      // attack — spectral slash
      if (frame === 3) {
        ctx.strokeStyle = rgba(d.eyeColor, 0.6);
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx + s * 0.2, s * 0.5, s * 0.2, -Math.PI * 0.3, Math.PI * 0.3);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  // Infernal Plantation Owner — corrupted spirit
  {
    name: "infernal-owner",
    baseColor: 0x4a2a1a,
    accentColor: 0x8a4a2a,
    eyeColor: 0xff3300,
    radius: 32,
    draw: (ctx, frame, s, d) => {
      const cx = s * 0.5;
      const groundY = s * 0.92;
      const sway = Math.sin(frame * 1.3) * 2;
      drawGroundShadow(ctx, cx, groundY, s * 0.35);

      ctx.save();
      // body — corrupted gentleman
      const grad = ctx.createLinearGradient(0, s * 0.15, 0, s * 0.9);
      grad.addColorStop(0, rgba(d.accentColor, 0.9));
      grad.addColorStop(0.4, rgba(d.baseColor, 1));
      grad.addColorStop(1, rgba(0x220000, 1));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.16 + sway, s * 0.2);
      ctx.lineTo(cx + s * 0.16 + sway, s * 0.2);
      ctx.lineTo(cx + s * 0.22 + sway, s * 0.75);
      ctx.lineTo(cx - s * 0.22 + sway, s * 0.75);
      ctx.closePath();
      ctx.fill();

      // coat tails
      ctx.fillStyle = rgba(darken(d.baseColor, 0.2), 1);
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.22 + sway, s * 0.7);
      ctx.lineTo(cx - s * 0.28 + sway, s * 0.88);
      ctx.lineTo(cx - s * 0.12 + sway, s * 0.78);
      ctx.moveTo(cx + s * 0.22 + sway, s * 0.7);
      ctx.lineTo(cx + s * 0.28 + sway, s * 0.88);
      ctx.lineTo(cx + s * 0.12 + sway, s * 0.78);
      ctx.fill();

      // cravat
      ctx.fillStyle = rgba(0x884422, 0.8);
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.28, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      // lapels
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.3), 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.08 + sway, s * 0.25);
      ctx.lineTo(cx - s * 0.14 + sway, s * 0.45);
      ctx.moveTo(cx + s * 0.08 + sway, s * 0.25);
      ctx.lineTo(cx + s * 0.14 + sway, s * 0.45);
      ctx.stroke();

      // arms
      drawLimb(ctx, cx - s * 0.14 + sway, s * 0.3, cx - s * 0.32, s * 0.55, 5, 3, d.baseColor);
      drawLimb(ctx, cx + s * 0.14 + sway, s * 0.3, cx + s * 0.32, s * 0.55, 5, 3, d.baseColor);

      // eyes — burning
      drawEye(ctx, cx - s * 0.06 + sway, s * 0.27, 4, d.eyeColor);
      drawEye(ctx, cx + s * 0.06 + sway, s * 0.27, 4, d.eyeColor);

      // top hat
      ctx.fillStyle = rgba(darken(d.baseColor, 0.4), 1);
      ctx.beginPath();
      ctx.rect(cx - s * 0.08 + sway, s * 0.08, s * 0.16, s * 0.12);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + sway, s * 0.2, s * 0.12, s * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();

      // walking stick
      ctx.strokeStyle = rgba(darken(d.baseColor, 0.5), 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.32, s * 0.3);
      ctx.lineTo(cx + s * 0.35, s * 0.85);
      ctx.stroke();

      // attack — dark energy burst
      if (frame === 3) {
        ctx.fillStyle = rgba(d.eyeColor, 0.4);
        ctx.beginPath();
        ctx.arc(cx, s * 0.5, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  },
];
