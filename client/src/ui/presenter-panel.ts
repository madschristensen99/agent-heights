import type { Presenter } from "../../../shared/types";
import { MAX_PRESENTERS } from "../../../shared/types";

export interface PresenterPanelCallbacks {
  onFocus: (userId: string, type: "screen" | "webcam") => void;
  onMute: (userId: string, type: "screen" | "webcam") => void;
  onKick: (userId: string, type: "screen" | "webcam") => void;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  onStartWebcam: () => void;
  onStopWebcam: () => void;
  onClose: () => void;
}

export class PresenterPanel {
  private el: HTMLDivElement | null = null;
  private focusedKey: string | null = null;
  private mutedKeys = new Set<string>();
  private presenters: Presenter[] = [];
  private myUserId: string | null = null;
  private isSharing = false;
  private isBroadcasting = false;
  private cb: PresenterPanelCallbacks;

  constructor(cb: PresenterPanelCallbacks) {
    this.cb = cb;
  }

  setMyUserId(userId: string | null): void {
    this.myUserId = userId;
  }

  setPresenters(presenters: Presenter[]): void {
    this.presenters = presenters;
    this.render();
  }

  setFocus(key: string | null): void {
    this.focusedKey = key;
    this.render();
  }

  setMuted(keys: Set<string>): void {
    this.mutedKeys = new Set(keys);
    this.render();
  }

  setSharing(sharing: boolean): void {
    this.isSharing = sharing;
    this.render();
  }

  setBroadcasting(broadcasting: boolean): void {
    this.isBroadcasting = broadcasting;
    this.render();
  }

  show(): void {
    if (this.el) {
      this.el.hidden = false;
      this.render();
      return;
    }
    this.el = document.createElement("div");
    this.el.className = "presenter-panel";
    this.el.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:420px;max-width:90vw;max-height:80vh;overflow-y:auto;
      background:#1a1a2e;color:#e0e0e0;border:1px solid #333;border-radius:8px;
      z-index:200;box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:inherit;
      padding:1rem;
    `;
    document.body.appendChild(this.el);
    this.render();
  }

  hide(): void {
    if (this.el) this.el.hidden = true;
  }

  toggle(): void {
    if (!this.el || this.el.hidden) this.show();
    else this.hide();
  }

  isOpen(): boolean {
    return !!this.el && !this.el.hidden;
  }

  destroy(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  private key(p: Presenter): string {
    return `${p.userId}:${p.type}`;
  }

  private render(): void {
    if (!this.el) return;
    const cb = this.cb;

    const header = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
        <span style="font-size:0.9rem;font-weight:bold;letter-spacing:0.05em;">PROJECTOR MANAGE</span>
        <button id="pp-close" style="background:none;border:none;color:#888;cursor:pointer;font-size:1.1rem;">✕</button>
      </div>
    `;

    const cap = this.presenters.length;
    const capLabel = `<div style="font-size:0.75rem;color:#888;margin-bottom:0.6rem;">${cap}/${MAX_PRESENTERS} slots in use</div>`;

    const rows = this.presenters.map(p => {
      const k = this.key(p);
      const isMe = p.userId === this.myUserId;
      const isFocused = this.focusedKey === k;
      const isMuted = this.mutedKeys.has(k);
      const typeIcon = p.type === "screen" ? "🖥" : "📷";
      const typeLabel = p.type === "screen" ? "Screen" : "Webcam";

      return `
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem;border:1px solid #333;border-radius:4px;margin-bottom:0.4rem;${isFocused ? "border-color:#4af;background:rgba(68,170,255,0.08);" : ""}">
          <span style="font-size:1.1rem;">${typeIcon}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.85rem;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.name}${isMe ? " (You)" : ""}</div>
            <div style="font-size:0.7rem;color:#888;">${typeLabel}</div>
          </div>
          <button class="pp-focus" data-key="${k}" data-uid="${p.userId}" data-type="${p.type}"
            style="background:${isFocused ? "#4af" : "#333"};color:${isFocused ? "#000" : "#ccc"};border:none;border-radius:3px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;">
            ${isFocused ? "★" : "☆"}
          </button>
          <button class="pp-mute" data-key="${k}" data-uid="${p.userId}" data-type="${p.type}"
            style="background:${isMuted ? "#e55" : "#333"};color:#ccc;border:none;border-radius:3px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;">
            ${isMuted ? "🔇" : "🔊"}
          </button>
          <button class="pp-kick" data-uid="${p.userId}" data-type="${p.type}"
            style="background:#333;color:#e55;border:none;border-radius:3px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;">
            ✕
          </button>
        </div>
      `;
    }).join("");

    const emptyMsg = this.presenters.length === 0
      ? `<div style="text-align:center;color:#666;font-size:0.85rem;padding:1rem 0;">No active presenters. Use the buttons below to start.</div>`
      : "";

    const myScreenActive = this.presenters.some(p => p.userId === this.myUserId && p.type === "screen");
    const myWebcamActive = this.presenters.some(p => p.userId === this.myUserId && p.type === "webcam");

    const actions = `
      <div style="display:flex;gap:0.5rem;margin-top:0.6rem;">
        <button id="pp-screen" ${this.isSharing || myScreenActive ? "disabled" : ""}
          style="flex:1;background:${cap >= MAX_PRESENTERS ? "#333" : "#2a4a6a"};color:${cap >= MAX_PRESENTERS ? "#666" : "#ccc"};border:none;border-radius:4px;padding:0.5rem;cursor:${cap >= MAX_PRESENTERS ? "not-allowed" : "pointer"};font-size:0.8rem;">
          ${this.isSharing || myScreenActive ? "Sharing…" : "🖥 Share Screen"}
        </button>
        <button id="pp-webcam" ${this.isBroadcasting || myWebcamActive ? "disabled" : ""}
          style="flex:1;background:${cap >= MAX_PRESENTERS ? "#333" : "#2a4a6a"};color:${cap >= MAX_PRESENTERS ? "#666" : "#ccc"};border:none;border-radius:4px;padding:0.5rem;cursor:${cap >= MAX_PRESENTERS ? "not-allowed" : "pointer"};font-size:0.8rem;">
          ${this.isBroadcasting || myWebcamActive ? "Broadcasting…" : "📷 Start Webcam"}
        </button>
      </div>
      ${(this.isSharing || myScreenActive) ? `<button id="pp-stop-screen" style="width:100%;background:#4a2a2a;color:#e55;border:none;border-radius:4px;padding:0.4rem;cursor:pointer;font-size:0.78rem;margin-top:0.3rem;">Stop Screen Share</button>` : ""}
      ${(this.isBroadcasting || myWebcamActive) ? `<button id="pp-stop-webcam" style="width:100%;background:#4a2a2a;color:#e55;border:none;border-radius:4px;padding:0.4rem;cursor:pointer;font-size:0.78rem;margin-top:0.3rem;">Stop Webcam</button>` : ""}
    `;

    this.el.innerHTML = header + capLabel + emptyMsg + rows + actions;

    // Wire up buttons
    const closeBtn = this.el.querySelector("#pp-close") as HTMLButtonElement;
    closeBtn.onclick = () => cb.onClose();

    this.el.querySelectorAll<HTMLButtonElement>(".pp-focus").forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.uid!;
        const type = btn.dataset.type as "screen" | "webcam";
        const k = `${uid}:${type}`;
        this.focusedKey = this.focusedKey === k ? null : k;
        cb.onFocus(uid, type);
        this.render();
      };
    });

    this.el.querySelectorAll<HTMLButtonElement>(".pp-mute").forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.uid!;
        const type = btn.dataset.type as "screen" | "webcam";
        const k = `${uid}:${type}`;
        if (this.mutedKeys.has(k)) this.mutedKeys.delete(k);
        else this.mutedKeys.add(k);
        cb.onMute(uid, type);
        this.render();
      };
    });

    this.el.querySelectorAll<HTMLButtonElement>(".pp-kick").forEach(btn => {
      btn.onclick = () => {
        const uid = btn.dataset.uid!;
        const type = btn.dataset.type as "screen" | "webcam";
        cb.onKick(uid, type);
      };
    });

    const screenBtn = this.el.querySelector("#pp-screen") as HTMLButtonElement | null;
    if (screenBtn) screenBtn.onclick = () => cb.onStartScreenShare();

    const webcamBtn = this.el.querySelector("#pp-webcam") as HTMLButtonElement | null;
    if (webcamBtn) webcamBtn.onclick = () => cb.onStartWebcam();

    const stopScreenBtn = this.el.querySelector("#pp-stop-screen") as HTMLButtonElement | null;
    if (stopScreenBtn) stopScreenBtn.onclick = () => cb.onStopScreenShare();

    const stopWebcamBtn = this.el.querySelector("#pp-stop-webcam") as HTMLButtonElement | null;
    if (stopWebcamBtn) stopWebcamBtn.onclick = () => cb.onStopWebcam();
  }
}
