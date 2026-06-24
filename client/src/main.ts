import Phaser from "phaser";
import { OfficeScene } from "./game/scene";
import { WorldScene } from "./game/world";
import { Net } from "./net";
import { Store } from "./store";
import { Hud } from "./ui/hud";

const store = new Store();
const net = new Net();
net.onMessage = (msg) => store.apply(msg);
net.onStatus = (connected) => store.setConnected(connected);
net.connect();

new Hud(store, net);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#dce4ec",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: "100%",
    height: "100%",
  },
  // variable step keeps movement in lockstep with the display's refresh rate
  // (fixed 60Hz stepping stutters on 120Hz ProMotion screens)
  physics: { default: "arcade", arcade: { fixedStep: false } },
  // ProMotion displays shift refresh rate constantly (24–120Hz); Phaser's
  // 10-frame delta smoothing lags those shifts, so speeds drift slow-then-fast.
  // The raw RAF delta is always correct — use it.
  fps: { smoothStep: false },
  scene: [OfficeScene, WorldScene],
});

game.registry.set("store", store);
game.registry.set("net", net);
