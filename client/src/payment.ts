import { getToken, isAuthEnabled } from "./auth";

export interface PaymentState {
  entrancePaid: boolean;
  subscriptionActive: boolean;
  subscriptionStatus: string;
  currentPeriodEnd: number | null;
}

type PaymentListener = (state: PaymentState | null) => void;

const listeners = new Set<PaymentListener>();
let currentState: PaymentState | null = null;

export function onPaymentChange(fn: PaymentListener): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn(currentState);
}

export function updatePaymentState(state: PaymentState | null): void {
  currentState = state;
  notify();
}

async function stripeApi(path: string, method = "POST"): Promise<Record<string, unknown>> {
  const token = getToken();
  if (!token) return { error: "Not authenticated" };
  try {
    const res = await fetch(path, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json() as Record<string, unknown>;
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function startEntranceCheckout(): Promise<void> {
  const result = await stripeApi("/api/stripe/checkout-entrance");
  if (typeof result.url === "string") {
    window.location.href = result.url;
  } else {
    alert((result.error as string) ?? "Failed to start checkout");
  }
}

export async function startSubscriptionCheckout(): Promise<void> {
  const result = await stripeApi("/api/stripe/checkout-subscription");
  if (typeof result.url === "string") {
    window.location.href = result.url;
  } else {
    alert((result.error as string) ?? "Failed to start checkout");
  }
}

export async function openCustomerPortal(): Promise<void> {
  const result = await stripeApi("/api/stripe/portal");
  if (typeof result.url === "string") {
    window.location.href = result.url;
  } else {
    alert((result.error as string) ?? "Failed to open portal");
  }
}

export async function refreshPaymentStatus(): Promise<void> {
  if (!isAuthEnabled) return;
  const result = await stripeApi("/api/stripe/status", "GET");
  if (result && !result.error) {
    updatePaymentState({
      entrancePaid: result.entrancePaid as boolean,
      subscriptionActive: result.subscriptionActive as boolean,
      subscriptionStatus: result.subscriptionStatus as string,
      currentPeriodEnd: (result.currentPeriodEnd as number | null) ?? null,
    });
  }
}

export function createPaymentOverlay(): { show: () => void; hide: () => void } {
  const overlay = document.createElement("div");
  overlay.id = "payment-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    display: none; flex-direction: column; align-items: center; justify-content: center;
    background: linear-gradient(180deg, #121420 0%, #1a1e32 100%);
    color: #e0e0e0;
    font-family: 'M PLUS Rounded 1c', system-ui, sans-serif;
    overflow-y: auto; padding: 2rem 1rem;
  `;

  overlay.innerHTML = `
    <div style="position:relative;z-index:1;text-align:center;max-width:440px;width:90vw;">
      <h1 style="font-size:2.2rem;font-weight:800;margin:0 0 0.5rem;letter-spacing:0.08em;color:#58c866;text-shadow:3px 3px 0 #080a10;">AGENT HEIGHTS</h1>
      <p style="color:#a0a5b4;font-size:0.7rem;font-weight:500;margin:0 0 1.5rem;letter-spacing:0.15em;text-transform:uppercase;">World Access & Agent Subscription</p>

      <div id="payment-entrance-section" style="display:none;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <h2 style="font-size:1.1rem;color:#58c866;margin:0 0 0.3rem;">World Entrance Fee — $1</h2>
        <p style="color:#a0a5b4;font-size:0.85rem;margin:0 0 0.5rem;line-height:1.4;">A one-time fee to enter the Agent Heights world and join the multiplayer lobby.</p>
        <button id="pay-entrance-btn"
          style="padding:0.8rem 1rem;border-radius:8px;border:none;background:linear-gradient(180deg,#58c866,#3da64a);color:#0d0d0d;font-size:0.95rem;font-weight:700;cursor:pointer;letter-spacing:0.03em;transition:filter 0.15s,transform 0.1s;">
          Pay $1 Entrance Fee
        </button>
      </div>

      <div id="payment-subscription-section" style="display:none;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <h2 style="font-size:1.1rem;color:#58c866;margin:0 0 0.3rem;">Agent Hire Subscription — $20/month</h2>
        <p style="color:#a0a5b4;font-size:0.85rem;margin:0 0 0.5rem;line-height:1.4;">Subscribe to hire and manage AI agents in your own private office. Cancel anytime.</p>
        <button id="pay-subscription-btn"
          style="padding:0.8rem 1rem;border-radius:8px;border:none;background:linear-gradient(180deg,#58c866,#3da64a);color:#0d0d0d;font-size:0.95rem;font-weight:700;cursor:pointer;letter-spacing:0.03em;transition:filter 0.15s,transform 0.1s;">
          Subscribe — $20/month
        </button>
      </div>

      <div id="payment-active-section" style="display:none;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <h2 style="font-size:1.1rem;color:#58c866;margin:0 0 0.3rem;">Subscription Active</h2>
        <p id="payment-period-info" style="color:#a0a5b4;font-size:0.85rem;margin:0 0 0.5rem;line-height:1.4;"></p>
        <button id="manage-subscription-btn"
          style="padding:0.7rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;">
          Manage Subscription
        </button>
      </div>

      <div id="payment-loading" style="color:#7a8090;font-size:0.9rem;text-align:center;">Loading payment status…</div>

      <button id="payment-close-btn" style="margin-top:1rem;padding:0.6rem 1.2rem;border-radius:8px;border:1px solid #2a2e42;background:transparent;color:#7a8090;font-size:0.85rem;cursor:pointer;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const entranceSection = overlay.querySelector("#payment-entrance-section") as HTMLDivElement;
  const subscriptionSection = overlay.querySelector("#payment-subscription-section") as HTMLDivElement;
  const activeSection = overlay.querySelector("#payment-active-section") as HTMLDivElement;
  const loadingEl = overlay.querySelector("#payment-loading") as HTMLDivElement;
  const periodInfo = overlay.querySelector("#payment-period-info") as HTMLParagraphElement;
  const entranceBtn = overlay.querySelector("#pay-entrance-btn") as HTMLButtonElement;
  const subscriptionBtn = overlay.querySelector("#pay-subscription-btn") as HTMLButtonElement;
  const manageBtn = overlay.querySelector("#manage-subscription-btn") as HTMLButtonElement;
  const closeBtn = overlay.querySelector("#payment-close-btn") as HTMLButtonElement;

  function renderState() {
    if (!currentState) {
      loadingEl.style.display = "block";
      entranceSection.style.display = "none";
      subscriptionSection.style.display = "none";
      activeSection.style.display = "none";
      return;
    }
    loadingEl.style.display = "none";
    entranceSection.style.display = currentState.entrancePaid ? "none" : "flex";
    if (currentState.entrancePaid && !currentState.subscriptionActive) {
      subscriptionSection.style.display = "flex";
      activeSection.style.display = "none";
    } else if (currentState.entrancePaid && currentState.subscriptionActive) {
      subscriptionSection.style.display = "none";
      activeSection.style.display = "flex";
      if (currentState.currentPeriodEnd) {
        const date = new Date(currentState.currentPeriodEnd * 1000);
        periodInfo.textContent = `Your subscription renews on ${date.toLocaleDateString()}.`;
      } else {
        periodInfo.textContent = "Your subscription is active.";
      }
    } else {
      subscriptionSection.style.display = "none";
      activeSection.style.display = "none";
    }
  }

  onPaymentChange(renderState);

  entranceBtn.addEventListener("click", () => void startEntranceCheckout());
  subscriptionBtn.addEventListener("click", () => void startSubscriptionCheckout());
  manageBtn.addEventListener("click", () => void openCustomerPortal());
  closeBtn.addEventListener("click", () => { overlay.style.display = "none"; });

  // Hover effects
  for (const btn of [entranceBtn, subscriptionBtn]) {
    btn.addEventListener("mouseenter", () => { btn.style.filter = "brightness(1.1)"; });
    btn.addEventListener("mouseleave", () => { btn.style.filter = "none"; });
    btn.addEventListener("mousedown", () => { btn.style.transform = "scale(0.97)"; });
    btn.addEventListener("mouseup", () => { btn.style.transform = "scale(1)"; });
  }
  manageBtn.addEventListener("mouseenter", () => { manageBtn.style.borderColor = "#58c866"; });
  manageBtn.addEventListener("mouseleave", () => { manageBtn.style.borderColor = "#2a2e42"; });

  return {
    show: () => {
      overlay.style.display = "flex";
      void refreshPaymentStatus();
    },
    hide: () => { overlay.style.display = "none"; },
  };
}
