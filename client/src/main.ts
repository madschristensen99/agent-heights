import Phaser from "phaser";
import { BootScene } from "./game/boot";
import { OfficeScene } from "./game/scene";
import { Net } from "./net";
import { Store } from "./store";
import { Hud } from "./ui/hud";
import { initAuth, onAuthChange, getToken, isAuthEnabled, createAuthOverlay, refreshSession, getUserId, signOut } from "./auth";
import { createPaymentOverlay, updatePaymentState, refreshPaymentStatus } from "./payment";

const isSpectator = new URLSearchParams(window.location.search).get("spectator") === "1";

const store = new Store();
const net = new Net();
store.sendFn = (msg) => net.send(msg);
store.wireAchievements();
net.onMessage = (msg) => {
  if (msg.type === "payment_status") {
    updatePaymentState({
      subscriptionActive: msg.subscriptionActive,
      subscriptionStatus: msg.subscriptionStatus,
      subscriptionTier: msg.subscriptionTier,
      agentLimit: msg.agentLimit,
      usageCap: msg.usageCap,
      currentPeriodEnd: msg.currentPeriodEnd,
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
net.onSessionExpired = async () => {
  console.log("[net] session expired — clearing stale session and reloading");
  await signOut();
  location.reload();
};

const authOverlay = createAuthOverlay();
const paymentOverlay = createPaymentOverlay();

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
const _upgradeDeployment = _params.get("deployment");
if (_paymentResult) {
  history.replaceState({}, "", window.location.pathname);
}

// Start auth early — runs in parallel with Phaser init and asset downloads
// so the session is likely ready before BootScene finishes.
if (!isSpectator) {
  void initAuth();

  // If we returned from a successful asset upgrade checkout, trigger generation
  if (_paymentResult === "asset_upgrade_success" && _upgradeDeployment) {
    // The send() method queues messages if WS isn't open yet
    setTimeout(() => {
      store.sendFn?.({ type: "upgrade_assets", deploymentId: _upgradeDeployment });
      store.toast("AI asset upgrade started — generating high-fidelity graphics…");
    }, 2000);
  }

  // If we returned from a successful Stripe checkout, poll payment status
  if (_paymentResult && _paymentResult.endsWith("success")) {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      await refreshPaymentStatus();
      if (attempts < 10) {
        setTimeout(() => void poll(), 2000);
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
  fps: { smoothStep: true },
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

