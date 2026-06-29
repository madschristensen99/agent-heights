import Phaser from "phaser";
import { BootScene } from "./game/boot";
import { OfficeScene } from "./game/scene";
import { Net } from "./net";
import { Store } from "./store";
import { Hud } from "./ui/hud";
import { initAuth, onAuthChange, getToken, isAuthEnabled, createAuthOverlay, refreshSession, getUserId } from "./auth";

const store = new Store();
const net = new Net();
net.onMessage = (msg) => store.apply(msg);
net.onStatus = (connected) => store.setConnected(connected);
net.onRefreshToken = async () => {
  const token = await refreshSession();
  if (token) net.setToken(token);
  return token;
};

const authOverlay = createAuthOverlay();

new Hud(store, net);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
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
  input: { windowEvents: false },
  scene: [BootScene, OfficeScene],
});

game.registry.set("store", store);
game.registry.set("net", net);

let connected = false;
let currentUserId: string | null = null;

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
  } else {
    // Auth is enabled but no session — show login overlay, don't connect
    authOverlay.show();
    if (connected) { net.disconnect(); connected = false; }
  }
});

void initAuth();
