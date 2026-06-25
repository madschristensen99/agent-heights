import Phaser from "phaser";
import { BootScene } from "./game/boot";
import { OfficeScene } from "./game/scene";
import { Net } from "./net";
import { Store } from "./store";
import { Hud } from "./ui/hud";
import { initAuth, onAuthChange, getToken, isAuthEnabled, createAuthOverlay } from "./auth";

const store = new Store();
const net = new Net();
net.onMessage = (msg) => store.apply(msg);
net.onStatus = (connected) => store.setConnected(connected);

const authOverlay = createAuthOverlay();

new Hud(store, net);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#a3bdd0",
  pixelArt: false,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  physics: { default: "arcade", arcade: { fixedStep: false } },
  fps: { smoothStep: false },
  scene: [BootScene, OfficeScene],
});

game.registry.set("store", store);
game.registry.set("net", net);

let connected = false;

onAuthChange((state) => {
  if (state.loading) return;

  if (!isAuthEnabled) {
    authOverlay.hide();
    if (!connected) { net.connect(); connected = true; }
    return;
  }

  if (state.session) {
    authOverlay.hide();
    const token = getToken();
    net.setToken(token);
    if (!connected) { net.connect(); connected = true; }
  } else {
    // Dev fallback: connect without auth — server will use dev session
    authOverlay.hide();
    if (!connected) { net.connect(); connected = true; }
  }
});

void initAuth();
