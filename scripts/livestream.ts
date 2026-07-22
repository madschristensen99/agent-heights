/**
 * The Singularity Will Be Livestreamed — headless browser → RTMP pipeline.
 *
 * Launches a headless Chromium via Playwright, loads the Agent Heights
 * client in spectator mode, captures the canvas, and pipes it through
 * FFmpeg to an RTMP endpoint (YouTube / Twitch).
 *
 * Usage:
 *   npx tsx scripts/livestream.ts
 *
 * Required env vars:
 *   LIVESTREAM_SERVER_URL  URL of the Agent Heights server (e.g. http://localhost:3001)
 *   RTMP_URL               RTMP endpoint (e.g. rtmp://a.rtmp.youtube.com/live2)
 *   RTMP_STREAM_KEY        Stream key from YouTube/Twitch dashboard
 *
 * Optional env vars:
 *   STREAM_WIDTH           Canvas width  (default 1280)
 *   STREAM_HEIGHT          Canvas height (default 720)
 *   STREAM_FPS             Frame rate    (default 30)
 *   STREAM_BITRATE         Video bitrate (default 3000k)
 *   STREAM_OUTPUT_FILE      If set, write to this file instead of RTMP (for local testing)
 */

import { spawn } from "node:child_process";

const SERVER_URL = process.env.LIVESTREAM_SERVER_URL ?? "http://localhost:3001";
const RTMP_URL = process.env.RTMP_URL ?? "";
const RTMP_STREAM_KEY = process.env.RTMP_STREAM_KEY ?? "";
const STREAM_WIDTH = parseInt(process.env.STREAM_WIDTH ?? "1280", 10);
const STREAM_HEIGHT = parseInt(process.env.STREAM_HEIGHT ?? "720", 10);
const STREAM_FPS = parseInt(process.env.STREAM_FPS ?? "30", 10);
const STREAM_BITRATE = process.env.STREAM_BITRATE ?? "3000k";
const STREAM_OUTPUT_FILE = process.env.STREAM_OUTPUT_FILE ?? "";

if (!STREAM_OUTPUT_FILE && (!RTMP_URL || !RTMP_STREAM_KEY)) {
  console.error("[livestream] Missing RTMP_URL/RTMP_STREAM_KEY or STREAM_OUTPUT_FILE — set one in your environment.");
  console.error("  For local testing: STREAM_OUTPUT_FILE=./test-output.mp4");
  console.error("  For RTMP:          RTMP_URL=rtmp://... RTMP_STREAM_KEY=...");
  process.exit(1);
}

const FULL_RTMP = `${RTMP_URL}/${RTMP_STREAM_KEY}`;

async function main(): Promise<void> {
  // Dynamic import — Playwright is an optional dependency
  let chromium: any;
  try {
    const pw = await import("playwright");
    chromium = pw.chromium;
  } catch {
    console.error("[livestream] Playwright is not installed. Install it with:");
    console.error("  pnpm add -D playwright && npx playwright install chromium");
    process.exit(1);
  }

  console.log(`[livestream] launching headless Chromium (${STREAM_WIDTH}x${STREAM_HEIGHT}@${STREAM_FPS}fps)`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
      `--window-size=${STREAM_WIDTH},${STREAM_HEIGHT}`,
    ],
  });

  const page = await browser.newPage({
    viewport: { width: STREAM_WIDTH, height: STREAM_HEIGHT },
  });

  // Collect console logs from the page for debugging
  page.on("console", (msg: any) => {
    const text = msg.text();
    if (text.includes("[net]") || text.includes("[store]") || text.includes("[spectator]")) {
      console.log(`[page] ${text}`);
    }
  });
  page.on("pageerror", (err: Error) => {
    console.error(`[page-error] ${err.message}`);
  });

  const spectatorUrl = `${SERVER_URL}/?spectator=1`;
  console.log(`[livestream] loading ${spectatorUrl}`);
  await page.goto(spectatorUrl, { waitUntil: "networkidle", timeout: 60_000 });

  // Wait for the Phaser canvas to appear
  console.log("[livestream] waiting for canvas...");
  await page.waitForSelector("canvas", { timeout: 30_000 });
  console.log("[livestream] canvas found");

  // Give the scene a moment to render
  await page.waitForTimeout(3000);

  // Start FFmpeg — output to local file or RTMP
  const outputTarget = STREAM_OUTPUT_FILE || FULL_RTMP;
  const outputFormat = STREAM_OUTPUT_FILE ? "mp4" : "flv";
  const ffmpegArgs = [
    "-y",
    "-f", "webm",           // input format (from MediaRecorder)
    "-i", "pipe:0",         // read from stdin
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-tune", "zerolatency",
    "-b:v", STREAM_BITRATE,
    "-maxrate", STREAM_BITRATE,
    "-bufsize", `${parseInt(STREAM_BITRATE) * 2}k`,
    "-pix_fmt", "yuv420p",
    "-g", String(STREAM_FPS * 2),  // keyframe every 2 seconds
    "-r", String(STREAM_FPS),
    "-f", outputFormat,
    outputTarget,
  ];

  console.log(`[livestream] starting FFmpeg → ${outputTarget}`);
  const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "pipe", "pipe"] });

  ffmpeg.stdout?.on("data", (data: Buffer) => {
    process.stdout.write(data);
  });
  ffmpeg.stderr?.on("data", (data: Buffer) => {
    // FFmpeg prints progress on stderr — only show errors and key lines
    const text = data.toString();
    if (text.includes("error") || text.includes("Error") || text.includes("Invalid")) {
      console.error(`[ffmpeg] ${text.trim()}`);
    }
  });
  ffmpeg.on("close", (code: number) => {
    console.log(`[livestream] FFmpeg exited with code ${code}`);
  });

  // Capture the canvas as a MediaStream and pipe chunks to FFmpeg
  const streamHandle = await page.evaluateHandle(
    async (fps: number) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) throw new Error("Canvas not found");
      const stream = (canvas as HTMLCanvasElement).captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp9",
        videoBitsPerSecond: 4_000_000,
      });
      return recorder;
    },
    STREAM_FPS,
  );

  // Wire MediaRecorder data → FFmpeg stdin via page.exposeFunction
  await page.exposeFunction("livestreamChunk", (chunkB64: string) => {
    const buf = Buffer.from(chunkB64, "base64");
    if (ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(buf);
    }
  });

  // Start recording and pipe chunks through the exposed function
  await page.evaluate(
    async (recorderHandle: any) => {
      const recorder = recorderHandle as MediaRecorder;
      recorder.ondataavailable = async (e: BlobEvent) => {
        if (e.data.size === 0) return;
        const arrayBuf = await e.data.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
        (window as any).livestreamChunk(b64);
      };
      recorder.start(1000); // 1-second chunks
    },
    streamHandle,
  );

  console.log("[livestream] streaming started — press Ctrl+C to stop");

  // Keep the process alive
  const keepAlive = setInterval(() => {
    if (ffmpeg.stdin.destroyed || !ffmpeg.stdin.writable) {
      console.error("[livestream] FFmpeg stdin closed — stopping");
      clearInterval(keepAlive);
      void cleanup();
    }
  }, 5000);

  async function cleanup(): Promise<void> {
    clearInterval(keepAlive);
    console.log("[livestream] cleaning up...");
    try {
      await page.evaluate((recorderHandle: any) => {
        (recorderHandle as MediaRecorder).stop();
      }, streamHandle);
    } catch { /* page may be gone */ }
    ffmpeg.stdin.end();
    await browser.close();
    process.exit(0);
  }

  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());
}

main().catch((err) => {
  console.error("[livestream] fatal error:", err);
  process.exit(1);
});
