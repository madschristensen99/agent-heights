import { getToken, isAuthEnabled } from "./auth";
import { SUBSCRIPTION_TIER_LIST, type SubscriptionTier, type BillingPeriod } from "../../shared/types";

export interface PaymentState {
  subscriptionActive: boolean;
  subscriptionStatus: string;
  subscriptionTier: SubscriptionTier | null;
  agentLimit: number;
  usageCap: number;
  currentPeriodEnd: number | null;
  freeTrialExpiresAt: number | null;
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

async function stripeApi(path: string, method = "POST", body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = getToken();
  if (!token) return { error: "Not authenticated" };
  try {
    const res = await fetch(path, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as Record<string, unknown>;
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Request failed" };
  }
}

export async function startSubscriptionCheckout(tier: SubscriptionTier, billingPeriod: BillingPeriod = "annual"): Promise<void> {
  const result = await stripeApi("/api/stripe/checkout-subscription", "POST", { tier, billingPeriod });
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
      subscriptionActive: result.subscriptionActive as boolean,
      subscriptionStatus: result.subscriptionStatus as string,
      subscriptionTier: (result.subscriptionTier as SubscriptionTier | null) ?? null,
      agentLimit: (result.agentLimit as number) ?? 0,
      usageCap: (result.usageCap as number) ?? 0,
      currentPeriodEnd: (result.currentPeriodEnd as number | null) ?? null,
      freeTrialExpiresAt: (result.freeTrialExpiresAt as number | null) ?? null,
    });
  }
}

export function createPaymentOverlay(onClose?: () => void): { show: () => void; hide: () => void } {
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
      <p style="color:#a0a5b4;font-size:0.7rem;font-weight:500;margin:0 0 1.5rem;letter-spacing:0.15em;text-transform:uppercase;">Agent Subscription Plans</p>

      <div id="payment-trial-section" style="display:none;flex-direction:column;gap:0.5rem;background:rgba(88,200,102,0.1);border:1px solid #3da64a;border-radius:12px;padding:1.2rem;margin-bottom:1rem;">
        <h2 style="font-size:1rem;color:#58c866;margin:0;">Free Trial Active</h2>
        <p style="color:#a0a5b4;font-size:0.85rem;margin:0;line-height:1.4;">You're looking around for free! Time remaining:</p>
        <p id="trial-countdown" style="font-size:1.6rem;font-weight:800;color:#58c866;margin:0;letter-spacing:0.05em;">5:00</p>
        <p style="color:#7a8090;font-size:0.75rem;margin:0.3rem 0 0;line-height:1.3;">Subscribe to the Starter plan for $0.99/mo to run tasks and chat with your agents.</p>
      </div>

      <div id="payment-subscription-section" style="display:none;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <h2 style="font-size:1.1rem;color:#58c866;margin:0 0 0.3rem;">Choose Your Plan</h2>
        <p style="color:#a0a5b4;font-size:0.85rem;margin:0 0 0.8rem;line-height:1.4;">Subscribe to hire and manage AI agents in your own private office. Cancel anytime.</p>
        <div id="billing-toggle" style="display:flex;gap:0.4rem;margin-bottom:0.8rem;background:#1a1e2e;border-radius:8px;padding:0.25rem;border:1px solid #2a2e42;">
          <button id="billing-monthly-btn" data-period="monthly" style="flex:1;padding:0.5rem;border-radius:6px;border:none;background:transparent;color:#a0a5b4;font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.15s;">Monthly</button>
          <button id="billing-annual-btn" data-period="annual" style="flex:1;padding:0.5rem;border-radius:6px;border:none;background:linear-gradient(180deg,#58c866,#3da64a);color:#0d0d0d;font-size:0.82rem;font-weight:700;cursor:pointer;transition:all 0.15s;">Annual <span style="font-size:0.7rem;opacity:0.8;">(2 months free)</span></button>
        </div>
        <div id="tier-cards" style="display:flex;flex-direction:column;gap:0.6rem;"></div>
      </div>

      <div id="payment-active-section" style="display:none;flex-direction:column;gap:0.7rem;background:rgba(18,22,36,0.7);border:1px solid #2a2e42;border-radius:12px;padding:1.5rem;margin-bottom:1rem;">
        <h2 id="payment-active-title" style="font-size:1.1rem;color:#58c866;margin:0 0 0.3rem;">Subscription Active</h2>
        <p id="payment-period-info" style="color:#a0a5b4;font-size:0.85rem;margin:0 0 0.5rem;line-height:1.4;"></p>
        <div id="payment-upgrade-section" style="display:none;flex-direction:column;gap:0.5rem;margin-bottom:0.5rem;">
          <p style="color:#a0a5b4;font-size:0.8rem;margin:0;">Need more agents? Upgrade your plan:</p>
          <div id="upgrade-tier-cards" style="display:flex;flex-direction:column;gap:0.4rem;"></div>
        </div>
        <button id="manage-subscription-btn"
          style="padding:0.7rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;color:#e0e0e0;font-size:0.9rem;cursor:pointer;transition:border-color 0.15s;">
          Manage Subscription
        </button>
      </div>

      <div id="payment-loading" style="color:#7a8090;font-size:0.9rem;text-align:center;">Loading payment status…</div>

      <button id="payment-close-btn" style="margin-top:1rem;padding:0.6rem 1.2rem;border-radius:8px;border:1px solid #2a2e42;background:transparent;color:#7a8090;font-size:0.85rem;cursor:pointer;display:none;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const subscriptionSection = overlay.querySelector("#payment-subscription-section") as HTMLDivElement;
  const activeSection = overlay.querySelector("#payment-active-section") as HTMLDivElement;
  const trialSection = overlay.querySelector("#payment-trial-section") as HTMLDivElement;
  const trialCountdown = overlay.querySelector("#trial-countdown") as HTMLParagraphElement;
  const loadingEl = overlay.querySelector("#payment-loading") as HTMLDivElement;
  const periodInfo = overlay.querySelector("#payment-period-info") as HTMLParagraphElement;
  const activeTitle = overlay.querySelector("#payment-active-title") as HTMLHeadingElement;
  const upgradeSection = overlay.querySelector("#payment-upgrade-section") as HTMLDivElement;
  const upgradeTierCards = overlay.querySelector("#upgrade-tier-cards") as HTMLDivElement;
  const tierCardsContainer = overlay.querySelector("#tier-cards") as HTMLDivElement;
  const monthlyBtn = overlay.querySelector("#billing-monthly-btn") as HTMLButtonElement;
  const annualBtn = overlay.querySelector("#billing-annual-btn") as HTMLButtonElement;
  const manageBtn = overlay.querySelector("#manage-subscription-btn") as HTMLButtonElement;
  const closeBtn = overlay.querySelector("#payment-close-btn") as HTMLButtonElement;

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let selectedBillingPeriod: BillingPeriod = "annual";

  function updateCountdown() {
    if (!currentState || !currentState.freeTrialExpiresAt) {
      trialSection.style.display = "none";
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      return;
    }
    const remaining = currentState.freeTrialExpiresAt - Date.now();
    if (remaining <= 0) {
      trialSection.style.display = "none";
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      return;
    }
    trialSection.style.display = "flex";
    const secs = Math.ceil(remaining / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    trialCountdown.textContent = `${m}:${s.toString().padStart(2, "0")}`;
  }

  function buildTierCard(tier: typeof SUBSCRIPTION_TIER_LIST[number], isUpgrade: boolean): string {
    const agentLabel = tier.agentLimit === Infinity ? "Unlimited agents" : `${tier.agentLimit} agent${tier.agentLimit === 1 ? "" : "s"}`;
    const priceLabel = selectedBillingPeriod === "annual" ? tier.annualLabel : tier.label;
    return `
      <div data-tier="${tier.id}" style="display:flex;align-items:center;justify-content:space-between;gap:0.8rem;padding:0.8rem 1rem;border-radius:8px;border:1px solid #2a2e42;background:#1a1e2e;cursor:pointer;transition:border-color 0.15s,filter 0.15s;">
        <div style="text-align:left;">
          <div style="font-size:0.95rem;font-weight:700;color:#e0e0e0;">${tier.name} <span style="color:#58c866;font-weight:600;">${priceLabel}</span></div>
          <div style="font-size:0.78rem;color:#a0a5b4;margin-top:0.15rem;">${agentLabel} — ${tier.description}</div>
        </div>
        <button class="tier-select-btn" data-tier="${tier.id}" style="padding:0.5rem 0.9rem;border-radius:6px;border:none;background:linear-gradient(180deg,#58c866,#3da64a);color:#0d0d0d;font-size:0.82rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:filter 0.15s,transform 0.1s;">
          ${isUpgrade ? "Upgrade" : "Subscribe"}
        </button>
      </div>`;
  }

  function renderState() {
    if (!currentState) {
      loadingEl.style.display = "block";
      subscriptionSection.style.display = "none";
      activeSection.style.display = "none";
      trialSection.style.display = "none";
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      return;
    }
    loadingEl.style.display = "none";

    // Show trial banner if trial is active
    const trialActive = currentState.freeTrialExpiresAt && currentState.freeTrialExpiresAt > Date.now();
    if (trialActive) {
      trialSection.style.display = "flex";
      if (!countdownInterval) countdownInterval = setInterval(updateCountdown, 1000);
      updateCountdown();
    } else {
      trialSection.style.display = "none";
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    if (!currentState.subscriptionActive) {
      subscriptionSection.style.display = "flex";
      activeSection.style.display = "none";
      tierCardsContainer.innerHTML = SUBSCRIPTION_TIER_LIST.map(t => buildTierCard(t, false)).join("");
    } else {
      subscriptionSection.style.display = "none";
      activeSection.style.display = "flex";
      const st = currentState;
      const tierName = st.subscriptionTier ? SUBSCRIPTION_TIER_LIST.find(t => t.id === st.subscriptionTier)?.name : null;
      activeTitle.textContent = tierName ? `${tierName} Plan Active` : "Subscription Active";
      if (st.currentPeriodEnd) {
        const date = new Date(st.currentPeriodEnd * 1000);
        periodInfo.textContent = `Your subscription renews on ${date.toLocaleDateString()}.`;
      } else {
        periodInfo.textContent = "Your subscription is active.";
      }
      // Show upgrade options if not on the highest tier
      if (st.subscriptionTier && st.subscriptionTier !== "business") {
        const currentPrice = SUBSCRIPTION_TIER_LIST.find(t => t.id === st.subscriptionTier)!.price;
        const upgrades = SUBSCRIPTION_TIER_LIST.filter(t => t.price > currentPrice);
        if (upgrades.length > 0) {
          upgradeSection.style.display = "flex";
          upgradeTierCards.innerHTML = upgrades.map(t => buildTierCard(t, true)).join("");
        } else {
          upgradeSection.style.display = "none";
        }
      } else {
        upgradeSection.style.display = "none";
      }
    }
  }

  onPaymentChange(renderState);

  // Show/hide close button based on trial status — hard gate when trial expired
  onPaymentChange((state) => {
    const trialActive = state && state.freeTrialExpiresAt && state.freeTrialExpiresAt > Date.now();
    const subActive = state && state.subscriptionActive;
    // Only show close button during active trial (soft gate)
    // When trial expired and no subscription, hide it (hard gate)
    closeBtn.style.display = (trialActive || subActive) ? "block" : "none";
  });

  manageBtn.addEventListener("click", () => void openCustomerPortal());
  closeBtn.addEventListener("click", () => { overlay.style.display = "none"; onClose?.(); });

  function setBillingPeriod(period: BillingPeriod) {
    selectedBillingPeriod = period;
    if (period === "annual") {
      annualBtn.style.background = "linear-gradient(180deg,#58c866,#3da64a)";
      annualBtn.style.color = "#0d0d0d";
      annualBtn.style.fontWeight = "700";
      monthlyBtn.style.background = "transparent";
      monthlyBtn.style.color = "#a0a5b4";
      monthlyBtn.style.fontWeight = "600";
    } else {
      monthlyBtn.style.background = "linear-gradient(180deg,#58c866,#3da64a)";
      monthlyBtn.style.color = "#0d0d0d";
      monthlyBtn.style.fontWeight = "700";
      annualBtn.style.background = "transparent";
      annualBtn.style.color = "#a0a5b4";
      annualBtn.style.fontWeight = "600";
    }
    // Re-render tier cards with updated pricing
    if (currentState && !currentState.subscriptionActive) {
      tierCardsContainer.innerHTML = SUBSCRIPTION_TIER_LIST.map(t => buildTierCard(t, false)).join("");
    }
  }

  monthlyBtn.addEventListener("click", () => setBillingPeriod("monthly"));
  annualBtn.addEventListener("click", () => setBillingPeriod("annual"));

  // Delegate tier card button clicks
  overlay.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest(".tier-select-btn") as HTMLButtonElement | null;
    if (btn) {
      const tier = btn.dataset.tier as SubscriptionTier;
      if (tier) void startSubscriptionCheckout(tier, selectedBillingPeriod);
    }
  });

  // Hover effects
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
