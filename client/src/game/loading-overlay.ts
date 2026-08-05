/**
 * Shared DOM loading overlay used by both BootScene and OfficeScene.
 * Creates a single progress bar that persists across scene transitions,
 * so the user sees one continuous 0→100% bar instead of three separate
 * bars that each reset to 0%.
 *
 * Progress is divided into segments:
 *   0.0–0.4  Asset download      (BootScene preload)
 *   0.4–0.7  Texture generation  (BootScene create)
 *   0.7–1.0  Office building     (OfficeScene create)
 */

const OVERLAY_ID = "game-loading-overlay";
const FILL_ID = "game-loading-fill";
const LABEL_ID = "game-loading-label";
const BAR_COLOR = "#4cb866";

let segmentStart = 0;
let segmentEnd = 1;

function ensureOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    background: #a3bdd0;
    font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
  `;
  overlay.innerHTML = `
    <div id="${LABEL_ID}" style="color:#fff; font-size:20px; font-weight:600;
      text-shadow:0 2px 4px rgba(0,0,0,0.3); margin-bottom:18px;">Loading…</div>
    <div style="width:320px; height:24px; background:#222233; border-radius:6px; overflow:hidden;">
      <div id="${FILL_ID}" style="width:0%; height:100%; background:${BAR_COLOR};
        border-radius:6px; transition:width 0.1s ease;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/** Set the current progress segment range (0–1 global). */
export function setSegment(start: number, end: number): void {
  segmentStart = start;
  segmentEnd = end;
  ensureOverlay();
}

/** Update progress within the current segment. fraction is 0–1 within the segment. */
export function updateProgress(fraction: number, label: string): void {
  const overlay = ensureOverlay();
  const fill = overlay.querySelector(`#${FILL_ID}`) as HTMLDivElement | null;
  const labelEl = overlay.querySelector(`#${LABEL_ID}`) as HTMLDivElement | null;
  if (fill) {
    const globalProgress = segmentStart + (segmentEnd - segmentStart) * fraction;
    fill.style.width = `${Math.round(globalProgress * 100)}%`;
  }
  if (labelEl) labelEl.textContent = label;
}

/** Set absolute progress (0–1 global), bypassing segment logic. */
export function setProgress(progress: number, label: string): void {
  const overlay = ensureOverlay();
  const fill = overlay.querySelector(`#${FILL_ID}`) as HTMLDivElement | null;
  const labelEl = overlay.querySelector(`#${LABEL_ID}`) as HTMLDivElement | null;
  if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
  if (labelEl) labelEl.textContent = label;
}

export function remove(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function exists(): boolean {
  return document.getElementById(OVERLAY_ID) !== null;
}
