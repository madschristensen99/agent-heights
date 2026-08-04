import Phaser from "phaser";
import { BootScene } from "./game/boot";
import { OfficeScene } from "./game/scene";
import { Net } from "./net";
import { Store } from "./store";
import { Hud } from "./ui/hud";
import { initAuth, onAuthChange, getToken, isAuthEnabled, createAuthOverlay, refreshSession, getUserId } from "./auth";
import { createPaymentOverlay, updatePaymentState, refreshPaymentStatus, onPaymentChange } from "./payment";

const isSpectator = new URLSearchParams(window.location.search).get("spectator") === "1";

const store = new Store();
const net = new Net();
store.sendFn = (msg) => net.send(msg);
net.onMessage = (msg) => {
  if (msg.type === "payment_status") {
    updatePaymentState({
      subscriptionActive: msg.subscriptionActive,
      subscriptionStatus: msg.subscriptionStatus,
      subscriptionTier: msg.subscriptionTier,
      agentLimit: msg.agentLimit,
      usageCap: msg.usageCap,
      currentPeriodEnd: msg.currentPeriodEnd,
      freeTrialExpiresAt: msg.freeTrialExpiresAt,
      nextTrialAt: msg.nextTrialAt,
    });
  } else if (msg.type === "payment_required") {
    store.toast(msg.message);
  }
  store.apply(msg);
};
net.onStatus = (connected) => store.setConnected(connected);
net.onRefreshToken = async () => {
  const token = await refreshSession();
  if (token) net.setToken(token);
  return token;
};

const authOverlay = createAuthOverlay();
// If true, the user manually closed the overlay — don't auto-re-show it.
let paymentOverlayDismissed = false;
const paymentOverlay = createPaymentOverlay(() => { paymentOverlayDismissed = true; });

// If true, suppress auto-showing the payment overlay because we just returned
// from a successful Stripe checkout and the webhook may not have processed yet.
let suppressPaymentOverlay = false;

// Auto-show/hide payment overlay based on subscription + free trial status
onPaymentChange((state) => {
  if (state && state.subscriptionActive) {
    suppressPaymentOverlay = false;
    paymentOverlayDismissed = false;
    paymentOverlay.hide();
    return;
  }
  if (state && !state.subscriptionActive) {
    const trialActive = state.freeTrialExpiresAt && state.freeTrialExpiresAt > Date.now();
    if (!trialActive && !suppressPaymentOverlay) {
      // Trial expired (or never started) — hard gate, always show
      paymentOverlay.show();
    } else if (trialActive && !paymentOverlayDismissed) {
      // Trial active and user hasn't dismissed — show overlay so they see plans
      paymentOverlay.show();
    } else {
      paymentOverlay.hide();
    }
  }
});

if (isSpectator) {
  // Spectator mode: skip auth, HUD, and payment — just render the world
  net.setSpectator(true);
  authOverlay.hide();
  paymentOverlay.hide();
} else {
  new Hud(store, net);
}

// Clean Stripe redirect params BEFORE initAuth so Supabase doesn't see them
const _params = new URLSearchParams(window.location.search);
const _paymentResult = _params.get("payment");
if (_paymentResult) {
  history.replaceState({}, "", window.location.pathname);
}

// Start auth early — runs in parallel with Phaser init and asset downloads
// so the session is likely ready before BootScene finishes.
if (!isSpectator) {
  void initAuth();

  // If we returned from a successful Stripe checkout, poll payment status
  // while suppressing the payment overlay (webhook may not have processed yet)
  if (_paymentResult && _paymentResult.endsWith("success")) {
    suppressPaymentOverlay = true;
    let attempts = 0;
    const poll = async () => {
      attempts++;
      await refreshPaymentStatus();
      // If payment is now confirmed, onPaymentChange will clear the suppress flag
      if (attempts < 10) {
        setTimeout(() => void poll(), 2000);
      } else {
        // Polling exhausted — stop suppressing so overlay can show if still unpaid
        suppressPaymentOverlay = false;
      }
    };
    setTimeout(() => void poll(), 1500);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  dom: { createContainer: true },
  backgroundColor: "#a3bdd0",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  physics: { default: "arcade", arcade: { fixedStep: false } },
  fps: { smoothStep: false },
  input: isSpectator ? { windowEvents: false, keyboard: false, mouse: false, touch: false } : { windowEvents: false },
  scene: [BootScene, OfficeScene],
});

game.registry.set("store", store);
game.registry.set("net", net);
game.registry.set("spectator", isSpectator);

let connected = false;
let currentUserId: string | null = null;

if (isSpectator) {
  // Connect immediately — no auth needed
  net.connect();
  connected = true;
} else {
  onAuthChange((state) => {
    if (state.loading) return;

    if (!isAuthEnabled) {
      authOverlay.hide();
      if (!connected) { net.connect(); connected = true; }
      return;
    }

    if (state.session) {
      const newUserId = getUserId();
      // If switching accounts, reset all client state before connecting
      if (currentUserId && currentUserId !== newUserId) {
        console.log(`[auth] switching accounts: ${currentUserId} → ${newUserId}, resetting store`);
        store.reset();
        if (connected) { net.disconnect(); connected = false; }
      }
      currentUserId = newUserId;
      authOverlay.hide();
      const token = getToken();
      net.setToken(token);
      game.registry.set("userId", newUserId);
      if (!connected) { net.connect(); connected = true; }
      // Check payment status after login
      void refreshPaymentStatus();
    } else {
      // Auth is enabled but no session — show login overlay, don't connect
      authOverlay.show();
      if (connected) { net.disconnect(); connected = false; }
    }
  });
}

