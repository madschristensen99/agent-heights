# Mobile Tilt Mechanics — Design Document

## Overview

Agent HQ is a 2D top-down office game built with Phaser. On desktop, movement is WASD/arrows with E for interact. On mobile, a virtual joystick + action buttons exist but feel like a ported desktop experience rather than something native to the platform.

**Goal:** Make the game feel truly mobile-oriented by adding tilt-to-move and shake-to-interact mechanics using the DeviceOrientation and DeviceMotion APIs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Mobile Browser                       │
│                                                          │
│  deviceorientation event ──► TiltController ──► touchInput │
│  devicemotion event    ────►   (shake detect)      │      │
│                                                      │      │
│  Virtual Joystick ─────────────────────────────────►│      │
│                                                      ▼      │
│                                            touchInput.moveX │
│                                            touchInput.moveY │
│                                            touchInput.action │
│                                                      │      │
│                                                      ▼      │
│                                          OfficeScene.update() │
│                                          (reads touchInput)   │
└─────────────────────────────────────────────────────────┘
```

### Key Insight

The game scene (`scene.ts`) already reads from a shared `touchInput` object (`touchInput.moveX`, `touchInput.moveY`, `touchInput.action`). The virtual joystick writes to it. Tilt controls write to the same object. **The scene doesn't need to know or care which input source is active.**

This means:
- Zero changes to game movement logic
- Tilt and joystick can coexist (tilt takes priority when active)
- Easy to add more input sources later (e.g., gamepad)

---

## Components

### 1. TiltController (`client/src/touch.ts`)

A self-contained class that:

- Listens to `deviceorientation` events for tilt angles (gamma = left/right, beta = forward/back)
- Listens to `devicemotion` events for accelerometer data (shake detection)
- Applies calibration, deadzone, smoothing, and clamping
- Writes normalized -1..1 vectors to `touchInput.moveX/moveY`
- Triggers `touchInput.action = "interact"` on shake

#### Calibration

The user holds their phone in a comfortable resting position and taps "Calibrate". The controller stores the current gamma/beta as the neutral position. All future tilt deltas are measured relative to this neutral point.

This is critical because:
- People hold phones at different angles (lap, desk, bed)
- The same person changes posture during a session
- Without calibration, the character would drift

#### Deadzone

A configurable angular deadzone (default: 5°) ignores micro-tilts to prevent drift from shaky hands or sensor noise. Input below the deadzone = zero movement. Input above = scaled from 0 to 1 starting at the deadzone edge.

#### Smoothing

Exponential moving average (EMA) with α=0.25 smooths sensor jitter:

```
smoothX += (rawX - smoothX) * 0.25
```

This gives responsive but clean analog input — no snapping or stuttering.

#### Sensitivity

A configurable "full tilt" angle (default: 25°). Tilting the phone this many degrees from neutral = maximum speed. Lower values = more sensitive (less tilt needed). The effective range is `sensitivity - deadzone` degrees mapped to 0..1.

#### Shake Detection

Uses `DeviceMotionEvent.accelerationIncludingGravity` — the total acceleration magnitude (hypot of x, y, z). When it exceeds a threshold (default: 18 m/s²) and the cooldown has elapsed (600ms), fires the shake callback.

The cooldown prevents a single shake gesture from triggering multiple interactions.

### 2. TiltSettings (localStorage)

```typescript
interface TiltSettings {
  enabled: boolean;        // master toggle
  sensitivity: number;     // degrees for full-speed (default: 25)
  deadzone: number;        // degrees of deadzone (default: 5)
  shakeToInteract: boolean;// enable shake gesture (default: true)
  shakeThreshold: number;  // m/s² to trigger shake (default: 18)
}
```

Stored in `localStorage` under key `agenthq_tilt_settings`. These are **device-specific** preferences — they don't sync to the server. A player might have tilt enabled on their phone but not on their tablet.

### 3. HUD Integration (`client/src/ui/hud.ts`)

#### Tilt Toggle Button (📱)

Added to the mobile action button cluster alongside E and Q. Behavior:

- **Tap:** Toggle tilt on/off. On first enable, requests iOS motion permissions (requires user gesture). Auto-calibrates on first enable.
- **Long-press (600ms):** Recalibrate tilt to current holding angle.
- **Active state:** Button glows blue with box-shadow.

#### Tilt Indicator

A circular visual element that appears in place of the joystick when tilt is active:

- Same position/size as the joystick base
- A small blue dot moves to show current tilt direction and magnitude
- Dot opacity increases when actively tilting, dims when level
- Joystick is dimmed (opacity 0.3) and touch-disabled when tilt is active

#### Settings Modal

New "MOBILE TILT CONTROLS" section in the Controls tab:

- Enable tilt checkbox
- Enable shake-to-interact checkbox
- Sensitivity slider (10°–45°)
- Deadzone slider (1°–15°)
- Shake force slider (10–30 m/s²)
- Calibrate button (requests permission if needed, then calibrates)

### 4. CSS (`client/src/style.css`)

- `.tilt-indicator` — circular backdrop, same position as joystick, pointer-events: none
- `.tilt-dot` — small circle, moves via transform, smooth transition
- `.mobile-action-btn.tilt-btn` — styled to match action buttons, `.active` state glows
- Responsive: tilt indicator shrinks to 90px on small screens (matches joystick)

### 5. Scene (`client/src/game/scene.ts`)

**No changes required.** The scene already reads `touchInput.moveX/moveY` at line ~3010 and `touchInput.action` at line ~3076. Tilt writes to these same fields.

The only consideration: when both tilt and joystick provide input simultaneously, tilt wins because:
1. The joystick's touch events are disabled when tilt is active
2. Tilt writes to `touchInput` on every `deviceorientation` event (~60Hz)

---

## Platform Compatibility

| Platform | Tilt-to-Move | Shake-to-Interact | Permission Required |
|----------|:---:|:---:|:---:|
| iOS 13+  | ✅ | ✅ | Yes (user gesture) |
| Android  | ✅ | ✅ | No |
| Desktop  | ❌ | ❌ | N/A |

### iOS Permission Flow

iOS 13+ requires an explicit user gesture to access DeviceOrientation and DeviceMotion. The flow:

1. User taps the 📱 button
2. `TiltController.requestPermission()` calls `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()`
3. iOS shows a permission prompt
4. If granted, tilt starts immediately with auto-calibration
5. If denied, toast: "Motion permission denied. Check browser settings."

### Desktop Behavior

The 📱 button only appears on touch devices (gated by `isTouchDevice()`). Desktop users see no tilt UI. If a desktop browser somehow fires `deviceorientation` events (some laptops have gyroscopes), the tilt controller still works — it's just not advertised.

---

## User Experience

### First-Time Flow

1. Player opens the game on mobile — sees joystick + buttons as before
2. Player taps 📱 button → iOS permission prompt → tilt activates
3. Auto-calibration captures their resting position
4. Toast: "Tilt controls ON! Tilt phone to move. Shake to interact."
5. Joystick dims, tilt indicator appears with a live dot
6. Player tilts phone → character moves → dot shows direction
7. Player shakes phone → interacts with nearest object → toast confirms

### Recalibration

- Long-press 📱 button (600ms) → recalibrates to current angle
- Or use Settings → Controls → Calibrate button
- Toast: "Tilt calibrated! Hold phone level to go straight."

### Disabling

- Tap 📱 button again → tilt off, joystick reactivates
- Or uncheck in Settings → Controls

---

## File Changes Summary

| File | Change | Lines |
|------|--------|-------|
| `client/src/touch.ts` | Add `TiltSettings`, `TiltController`, persistence helpers | ~150 new |
| `client/src/ui/hud.ts` | Tilt button, indicator, settings UI, wiring | ~100 new |
| `client/src/style.css` | Tilt indicator, tilt button styles | ~50 new |
| `client/src/game/scene.ts` | No changes needed | 0 |

---

## Future Considerations

- **Haptic feedback** — `navigator.vibrate()` on shake interact and collision
- **Tilt-to-look** — camera panning based on tilt when standing still
- **Gesture shortcuts** — double-shake for teleport, tilt-circle for menu
- **Gamepad support** — same `touchInput` pipeline, just a new controller
- **Adaptive sensitivity** — auto-adjust based on how much the player tilts over time
