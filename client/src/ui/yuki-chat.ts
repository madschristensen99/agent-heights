interface YukiMessage {
  role: "user" | "assistant";
  content: string;
}

export class YukiChat {
  private panel: HTMLDivElement;
  private messages: HTMLDivElement;
  private input: HTMLInputElement;
  private history: YukiMessage[] = [];
  private conversationId = crypto.randomUUID();
  private isOpen = false;

  constructor() {
    this.panel = document.createElement("div");
    this.panel.id = "yuki-chat";
    this.panel.style.cssText = `
      position: fixed; bottom: 0; right: 0; z-index: 8500;
      width: 360px; max-width: 90vw; height: 480px; max-height: 70vh;
      background: #0d0d0d; border: 1px solid #222; border-radius: 0.75rem 0 0 0;
      display: none; flex-direction: column;
      font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
      color: #e0e0e0;
    `;

    this.panel.innerHTML = `
      <div style="padding:0.6rem 0.85rem; border-bottom:1px solid #1a1a1a; display:flex; align-items:center; gap:0.5rem;">
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#c44a4a,#b54a93);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;">雪</div>
        <div style="flex:1;">
          <div style="font-size:0.85rem;font-weight:600;">Yuki</div>
          <div style="font-size:0.65rem;color:#666;">Marketplace & HQ assistant</div>
        </div>
        <button id="yuki-min" style="background:none;border:none;color:#666;font-size:1rem;cursor:pointer;">×</button>
      </div>
      <div id="yuki-messages" style="flex:1;overflow-y:auto;padding:0.6rem;display:flex;flex-direction:column;gap:0.5rem;"></div>
      <div style="padding:0.5rem 0.6rem; border-top:1px solid #1a1a1a; display:flex; gap:0.4rem;">
        <input id="yuki-input" type="text" placeholder="Ask Yuki…" style="flex:1;padding:0.5rem 0.7rem;border-radius:0.4rem;border:1px solid #222;background:#1a1a1a;color:#e0e0e0;font-size:0.82rem;outline:none;" />
        <button id="yuki-send" style="padding:0.5rem 0.8rem;border:none;border-radius:0.4rem;background:#e0e0e0;color:#0d0d0d;font-size:0.82rem;font-weight:600;cursor:pointer;">Send</button>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.messages = this.panel.querySelector("#yuki-messages") as HTMLDivElement;
    this.input = this.panel.querySelector("#yuki-input") as HTMLInputElement;

    this.panel.querySelector("#yuki-min")!.addEventListener("click", () => this.hide());

    const send = () => {
      const text = this.input.value.trim();
      if (!text) return;
      this.input.value = "";
      void this.send(text);
    };

    this.panel.querySelector("#yuki-send")!.addEventListener("click", send);
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });
  }

  show(): void {
    this.panel.style.display = "flex";
    this.isOpen = true;
    this.input.focus();
  }

  hide(): void {
    this.panel.style.display = "none";
    this.isOpen = false;
  }

  toggle(): void {
    if (this.isOpen) this.hide();
    else this.show();
  }

  private addMessage(role: "user" | "assistant", content: string): void {
    const el = document.createElement("div");
    el.style.cssText = role === "user"
      ? "align-self:flex-end; max-width:85%; padding:0.4rem 0.65rem; border-radius:0.5rem; background:#2a2a3a; font-size:0.82rem;"
      : "align-self:flex-start; max-width:85%; padding:0.4rem 0.65rem; border-radius:0.5rem; background:#1a1a1a; font-size:0.82rem; line-height:1.4;";
    el.textContent = content;
    this.messages.appendChild(el);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private addStreamingMessage(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = "align-self:flex-start; max-width:85%; padding:0.4rem 0.65rem; border-radius:0.5rem; background:#1a1a1a; font-size:0.82rem; line-height:1.4;";
    el.textContent = "";
    this.messages.appendChild(el);
    this.messages.scrollTop = this.messages.scrollHeight;
    return el;
  }

  private async send(text: string): Promise<void> {
    this.addMessage("user", text);
    this.history.push({ role: "user", content: text });

    const streamEl = this.addStreamingMessage();
    let fullText = "";

    try {
      const res = await fetch("/api/yuki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: this.history.slice(-10),
          conversationId: this.conversationId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        streamEl.textContent = `Error: ${err.error ?? res.statusText}`;
        streamEl.style.color = "#e05d5d";
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text" && data.delta) {
              fullText += data.delta;
              streamEl.textContent = fullText;
              this.messages.scrollTop = this.messages.scrollHeight;
            } else if (data.type === "error") {
              streamEl.textContent = `Error: ${data.message}`;
              streamEl.style.color = "#e05d5d";
              return;
            }
          } catch {
            // partial JSON, skip
          }
        }
      }

      if (fullText) {
        this.history.push({ role: "assistant", content: fullText });
      }
    } catch (err) {
      streamEl.textContent = `Error: ${err instanceof Error ? err.message : "Failed to reach Yuki"}`;
      streamEl.style.color = "#e05d5d";
    }
  }
}
