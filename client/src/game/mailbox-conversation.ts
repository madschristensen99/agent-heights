/**
 * In-world Phaser conversation panel for platform mailboxes.
 *
 * Replaces the DOM-based popup with a Phaser-rendered parchment panel
 * that appears in the game world. Uses a minimal DOM <input> for the
 * reply field (standard approach for text entry in Phaser games).
 */
import Phaser from "phaser";
import type { PlatformEvent } from "../../../shared/types";
import { getPlatformEntry } from "../../../shared/types";

const FONT = "'M PLUS Rounded 1c', sans-serif";

const PANEL_W = 420;
const PANEL_H = 360;
const HEADER_H = 44;
const REPLY_H = 52;
const CLOSE_BTN_W = 24;
const MSG_AREA_PADDING = 12;
const MSG_BUBBLE_MAX_W = PANEL_W - 80;
const MSG_BUBBLE_PADDING_X = 10;
const MSG_BUBBLE_PADDING_Y = 8;
const MSG_SPACING = 6;

interface Bubble {
  y: number;
  h: number;
  isInbound: boolean;
  text: Phaser.GameObjects.Text;
  bg: Phaser.GameObjects.Graphics;
}

export class MailboxConversation {
  private scene: Phaser.Scene;
  private platform: string;
  private onReply: (platform: string, target: string, text: string) => void;
  private onClose: () => void;

  private container: Phaser.GameObjects.Container;
  private panelBg: Phaser.GameObjects.Graphics;
  private headerBg: Phaser.GameObjects.Graphics;
  private headerText: Phaser.GameObjects.Text;
  private closeBtn: Phaser.GameObjects.Text;
  private scrollRect: Phaser.Geom.Rectangle;
  private bubbles: Bubble[] = [];
  private replyInput: HTMLInputElement;
  private replyBg: Phaser.GameObjects.Graphics;
  private sendBtn: Phaser.GameObjects.Text;
  private lastInboundSender: string | null = null;
  private liveHandler: ((platform: string, events: PlatformEvent[]) => void) | null = null;
  private unsubscribeLive: ((handler: (platform: string, events: PlatformEvent[]) => void) => void) | null = null;
  private escKey: Phaser.Input.Keyboard.Key | null = null;
  private enterKey: Phaser.Input.Keyboard.Key | null = null;
  private destroyed = false;
  private contentH = 0;
  private scrollY = 0;

  constructor(
    scene: Phaser.Scene,
    platform: string,
    events: PlatformEvent[],
    onReply: (platform: string, target: string, text: string) => void,
    onClose: () => void,
    subscribeLive: (handler: (platform: string, events: PlatformEvent[]) => void) => void,
    unsubscribeLive: (handler: (platform: string, events: PlatformEvent[]) => void) => void,
  ) {
    this.scene = scene;
    this.platform = platform;
    this.onReply = onReply;
    this.onClose = onClose;
    this.unsubscribeLive = unsubscribeLive;

    const cam = scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const px = cx - PANEL_W / 2;
    const py = cy - PANEL_H / 2;

    this.container = scene.add.container(px, py).setDepth(950).setScrollFactor(0);

    // ── Panel background (parchment style) ──
    this.panelBg = scene.add.graphics();
    this.drawPanelBg(this.panelBg, 0, 0, PANEL_W, PANEL_H);
    this.container.add(this.panelBg);

    // ── Header ──
    this.headerBg = scene.add.graphics();
    this.headerBg.fillStyle(0xe8dcc8, 1);
    this.headerBg.fillRoundedRect(0, 0, PANEL_W, HEADER_H, { tl: 12, tr: 12, bl: 0, br: 0 });
    this.headerBg.lineStyle(2, 0xd4c5a9, 1);
    this.headerBg.strokeRoundedRect(0, 0, PANEL_W, HEADER_H, { tl: 12, tr: 12, bl: 0, br: 0 });
    // Platform color accent bar
    this.headerBg.fillStyle(getPlatformEntry(platform)?.color ?? 0x888888, 1);
    this.headerBg.fillRect(0, HEADER_H - 2, PANEL_W, 2);
    this.container.add(this.headerBg);

    this.headerText = scene.add.text(16, 8, "", {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#3d3528",
      fontStyle: "bold",
    });
    this.updateHeader(events.length);
    this.container.add(this.headerText);

    // ── Close button ──
    this.closeBtn = scene.add.text(PANEL_W - CLOSE_BTN_W - 12, 10, "✕", {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#8b7355",
      fontStyle: "bold",
    });
    this.closeBtn.setInteractive({ useHandCursor: true });
    this.closeBtn.on("pointerdown", () => this.destroy());
    this.container.add(this.closeBtn);

    // ── Message area (manual clip for scrolling) ──
    const msgAreaY = HEADER_H;
    const msgAreaH = PANEL_H - HEADER_H - REPLY_H;
    this.scrollRect = new Phaser.Geom.Rectangle(
      MSG_AREA_PADDING,
      msgAreaY + MSG_AREA_PADDING,
      PANEL_W - MSG_AREA_PADDING * 2,
      msgAreaH - MSG_AREA_PADDING * 2,
    );

    // ── Render initial messages ──
    this.renderMessages(events);

    // ── Reply area ──
    const replyY = PANEL_H - REPLY_H;
    this.replyBg = scene.add.graphics();
    this.replyBg.fillStyle(0xf0e8d8, 1);
    this.replyBg.fillRect(0, replyY, PANEL_W, REPLY_H);
    this.replyBg.lineStyle(2, 0xd4c5a9, 1);
    this.replyBg.strokeRect(0, replyY, PANEL_W, REPLY_H);
    this.container.add(this.replyBg);

    // DOM input for reply (positioned over canvas)
    this.replyInput = document.createElement("input");
    this.replyInput.type = "text";
    this.replyInput.placeholder = this.lastInboundSender
      ? `Reply to ${this.lastInboundSender}...`
      : "Reply to last sender...";
    this.replyInput.style.cssText = `
      position: absolute;
      left: ${px + 12}px;
      top: ${py + replyY + 12}px;
      width: ${PANEL_W - 100}px;
      height: 28px;
      padding: 4px 10px;
      border: 2px solid #d4c5a9;
      border-radius: 8px;
      font-size: 14px;
      font-family: ${FONT};
      outline: none;
      background: #fff;
      color: #3d3528;
      z-index: 10001;
    `;
    document.body.appendChild(this.replyInput);
    setTimeout(() => this.replyInput.focus(), 50);

    // Send button
    this.sendBtn = scene.add.text(PANEL_W - 70, replyY + 14, "Send", {
      fontFamily: FONT,
      fontSize: "14px",
      color: "#ffffff",
      fontStyle: "bold",
      backgroundColor: "#4a9b4a",
      padding: { x: 12, y: 6 },
    });
    this.sendBtn.setInteractive({ useHandCursor: true });
    this.sendBtn.on("pointerdown", () => this.sendReply());
    this.container.add(this.sendBtn);

    // ── Keyboard handlers ──
    const kb = scene.input.keyboard;
    if (kb) {
      this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.escKey.on("down", () => this.destroy());
      this.enterKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.enterKey.on("down", () => {
        if (document.activeElement === this.replyInput) this.sendReply();
      });
    }

    // ── Scroll wheel ──
    scene.input.on("wheel", this.onWheel, this);

    // ── Live updates ──
    this.liveHandler = (updPlatform: string, updEvents: PlatformEvent[]) => {
      if (updPlatform !== this.platform) return;
      this.renderMessages(updEvents);
    };
    subscribeLive(this.liveHandler);

    // ── Reposition on resize ──
    this.scene.scale.on("resize", this.onResize, this);
  }

  private drawPanelBg(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x + 4, y + 6, w, h, 12);
    // Parchment body
    g.fillStyle(0xf5f0e6, 1);
    g.fillRoundedRect(x, y, w, h, 12);
    // Border
    g.lineStyle(3, 0xd4c5a9, 1);
    g.strokeRoundedRect(x, y, w, h, 12);
    // Inner border (double-line effect)
    g.lineStyle(1, 0xc8b898, 0.5);
    g.strokeRoundedRect(x + 4, y + 4, w - 8, h - 8, 10);
  }

  private updateHeader(msgCount: number): void {
    this.headerText.setText(`${this.platform} Inbox  ·  ${msgCount} message${msgCount !== 1 ? "s" : ""}`);
  }

  private renderMessages(events: PlatformEvent[]): void {
    // Clear existing bubbles
    for (const b of this.bubbles) {
      b.text.destroy();
      b.bg.destroy();
    }
    this.bubbles = [];
    this.contentH = 0;
    this.scrollY = 0;

    const msgAreaY = HEADER_H;
    const startY = msgAreaY + MSG_AREA_PADDING;
    let cursorY = startY;

    for (const ev of events) {
      const isInbound = ev.direction === "inbound";
      const time = new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const dirIcon = isInbound ? "←" : "→";
      const senderLabel = isInbound ? ev.sender : "You";
      const fullText = `${dirIcon} ${senderLabel} · ${time}\n${ev.text.slice(0, 500)}`;

      // Measure text
      const tempText = this.scene.add.text(0, 0, fullText, {
        fontFamily: FONT,
        fontSize: "12px",
        color: "#3d3528",
        wordWrap: { width: MSG_BUBBLE_MAX_W - MSG_BUBBLE_PADDING_X * 2 },
      });
      const textBounds = tempText.getBounds();
      const bubbleH = Math.ceil(textBounds.height) + MSG_BUBBLE_PADDING_Y * 2;
      const bubbleW = Math.min(MSG_BUBBLE_MAX_W, Math.ceil(textBounds.width) + MSG_BUBBLE_PADDING_X * 2);
      tempText.destroy();

      // Position bubble
      const bubbleX = isInbound
        ? MSG_AREA_PADDING + 4
        : PANEL_W - MSG_AREA_PADDING - bubbleW - 4;

      const bg = this.scene.add.graphics();
      if (isInbound) {
        bg.fillStyle(0xffffff, 1);
        bg.lineStyle(1, 0xe0d8c8, 1);
      } else {
        bg.fillStyle(0xe3f2e3, 1);
        bg.lineStyle(1, 0xc8e0c8, 1);
      }
      bg.fillRoundedRect(bubbleX, cursorY, bubbleW, bubbleH, 10);
      bg.strokeRoundedRect(bubbleX, cursorY, bubbleW, bubbleH, 10);
      this.container.add(bg);

      const text = this.scene.add.text(
        bubbleX + MSG_BUBBLE_PADDING_X,
        cursorY + MSG_BUBBLE_PADDING_Y,
        fullText,
        {
          fontFamily: FONT,
          fontSize: "12px",
          color: "#3d3528",
          wordWrap: { width: MSG_BUBBLE_MAX_W - MSG_BUBBLE_PADDING_X * 2 },
        },
      );
      this.container.add(text);

      this.bubbles.push({ y: cursorY, h: bubbleH, isInbound, text, bg });
      cursorY += bubbleH + MSG_SPACING;

      if (isInbound) this.lastInboundSender = ev.sender;
    }

    this.contentH = cursorY - startY;
    this.updateHeader(events.length);

    // Update reply placeholder
    if (this.lastInboundSender) {
      this.replyInput.placeholder = `Reply to ${this.lastInboundSender}...`;
    }

    // Auto-scroll to bottom
    this.scrollToBottom();
    this.applyScroll();
  }

  private onWheel(_pointer: Phaser.Input.Pointer, _o: unknown, _d: unknown, deltaY: number): void {
    if (this.destroyed) return;
    const maxScroll = Math.max(0, this.contentH - this.scrollRect.height);
    this.scrollY = Phaser.Math.Clamp(this.scrollY + deltaY * 0.5, 0, maxScroll);
    this.applyScroll();
  }

  private scrollToBottom(): void {
    const maxScroll = Math.max(0, this.contentH - this.scrollRect.height);
    this.scrollY = maxScroll;
  }

  private applyScroll(): void {
    const msgAreaY = HEADER_H;
    const msgAreaH = PANEL_H - HEADER_H - REPLY_H;
    const clipTop = msgAreaY + MSG_AREA_PADDING;
    const clipBottom = msgAreaY + msgAreaH - MSG_AREA_PADDING;

    for (const b of this.bubbles) {
      const screenY = b.y - this.scrollY;
      const visible = screenY + b.h > clipTop && screenY < clipBottom;
      b.bg.setVisible(visible);
      b.text.setVisible(visible);
      b.bg.y = screenY;
      b.text.y = screenY + MSG_BUBBLE_PADDING_Y;
    }
  }

  private sendReply(): void {
    const text = this.replyInput.value.trim();
    if (!text || !this.lastInboundSender) return;
    this.onReply(this.platform, this.lastInboundSender, text);
    this.replyInput.value = "";
  }

  private onResize(): void {
    if (this.destroyed) return;
    const cam = this.scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const px = cx - PANEL_W / 2;
    const py = cy - PANEL_H / 2;
    this.container.setPosition(px, py);

    const replyY = PANEL_H - REPLY_H;
    this.replyInput.style.left = `${px + 12}px`;
    this.replyInput.style.top = `${py + replyY + 12}px`;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Unsubscribe live updates
    if (this.liveHandler && this.unsubscribeLive) {
      this.unsubscribeLive(this.liveHandler);
    }

    // Remove DOM input
    this.replyInput.remove();

    // Remove keyboard listeners
    if (this.escKey) this.escKey.removeAllListeners();
    if (this.enterKey) this.enterKey.removeAllListeners();

    // Remove wheel listener
    this.scene.input.off("wheel", this.onWheel, this);

    // Remove resize listener
    this.scene.scale.off("resize", this.onResize, this);

    // Destroy Phaser objects
    for (const b of this.bubbles) {
      b.text.destroy();
      b.bg.destroy();
    }
    this.container.destroy();

    this.onClose();
  }
}
