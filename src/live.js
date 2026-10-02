import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { config, livePath } from "./config.js";
import { pushLiveFrame } from "./live-upload.js";
import { uploadCapture } from "./upload.js";

const JPEG_SOI = Buffer.from([0xff, 0xd8]);

/** Shared status for /health */
export const liveState = {
  running: false,
  startedAt: null,
  framesParsed: 0,
  framesPushed: 0,
  framesDropped: 0,
  lastFrameAt: null,
  lastPushAt: null,
  lastPushMs: null,
  lastPushOk: null,
  lastAnalysisAt: null,
  lastAnalysisId: null,
  lastError: null,
  consecutivePushFailures: 0,
};

function findJpegEnd(buf, from = 0) {
  for (let i = Math.max(from, 1); i < buf.length; i++) {
    if (buf[i - 1] === 0xff && buf[i] === 0xd9) return i + 1;
  }
  return -1;
}

/**
 * Continuous rpicam-vid MJPEG → live push + periodic analysis upload.
 *
 * Important: network to Render is slower than camera FPS. We keep only the
 * newest frame ("latest wins") and push as fast as uploads allow — never
 * wait for every camera frame or you'll only get ~1 frame per RTT (~8s).
 */
export function startLiveStream() {
  liveState.startedAt = new Date().toISOString();
  liveState.running = true;

  const args = [
    "-t",
    "0",
    "--codec",
    "mjpeg",
    "--width",
    String(config.liveWidth),
    "--height",
    String(config.liveHeight),
    "--framerate",
    String(config.liveFps),
    "--flush",
    "-n",
    "-o",
    "-",
  ];

  console.log(
    `[live] starting ${config.rpicamVidBin} ${config.liveWidth}x${config.liveHeight}@${config.liveFps}`,
  );
  console.log(
    `[live] analysis every ${config.captureIntervalMs}ms; live push = latest-wins (not every frame)`,
  );
  console.log(
    `[live] note: "Stream configuration adjusted" from rpicam is normal`,
  );

  let child = null;
  let restartTimer = null;
  let statsTimer = null;
  let stopping = false;
  let buffer = Buffer.alloc(0);

  /** @type {Buffer | null} */
  let pendingLive = null;
  let pushBusy = false;

  let analysisBusy = false;
  let lastAnalysisMs = 0;
  /** @type {Buffer | null} */
  let latestForAnalysis = null;

  let parsedWindow = 0;
  let pushedWindow = 0;
  let droppedWindow = 0;

  const spawnCam = () => {
    if (stopping) return;
    child = spawn(config.rpicamVidBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stderr.on("data", (chunk) => {
      const msg = chunk.toString().trim();
      // libcamera prints "Stream configuration adjusted" once at start — ignore noise
      if (!msg) return;
      if (/stream configuration adjusted/i.test(msg)) return;
      console.warn("[live/rpicam]", msg.slice(0, 300));
    });

    child.on("error", (err) => {
      liveState.lastError = `spawn failed: ${err.message}`;
      console.error("[live]", liveState.lastError);
    });

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 8 * 1024 * 1024) {
        buffer = buffer.subarray(buffer.length - 2 * 1024 * 1024);
      }

      while (true) {
        const start = buffer.indexOf(JPEG_SOI);
        if (start < 0) {
          buffer = Buffer.alloc(0);
          break;
        }
        if (start > 0) buffer = buffer.subarray(start);

        const end = findJpegEnd(buffer, 2);
        if (end < 0) break;

        const jpeg = Buffer.from(buffer.subarray(0, end));
        buffer = buffer.subarray(end);
        onJpeg(jpeg);
      }
    });

    child.on("close", (code) => {
      liveState.running = false;
      if (stopping) return;
      liveState.lastError = `${config.rpicamVidBin} exited ${code}`;
      console.error("[live] camera exited, restarting in 3s:", liveState.lastError);
      restartTimer = setTimeout(() => {
        liveState.running = true;
        spawnCam();
      }, 3_000);
    });
  };

  function onJpeg(jpeg) {
    liveState.framesParsed += 1;
    parsedWindow += 1;
    liveState.lastFrameAt = new Date().toISOString();
    latestForAnalysis = jpeg;

    // Latest-wins: overwrite pending; if a push is in flight this frame may be dropped
    if (pendingLive) {
      liveState.framesDropped += 1;
      droppedWindow += 1;
    }
    pendingLive = jpeg;
    void kickLivePush();
    void maybeAnalysis();
  }

  async function kickLivePush() {
    if (pushBusy || stopping) return;
    pushBusy = true;

    try {
      while (pendingLive && !stopping) {
        const frame = pendingLive;
        pendingLive = null;

        const t0 = Date.now();
        try {
          await pushLiveFrame(frame);
          const ms = Date.now() - t0;
          liveState.framesPushed += 1;
          pushedWindow += 1;
          liveState.lastPushAt = new Date().toISOString();
          liveState.lastPushMs = ms;
          liveState.lastPushOk = true;
          liveState.consecutivePushFailures = 0;
          liveState.lastError = null;
        } catch (err) {
          liveState.lastPushOk = false;
          liveState.lastPushMs = Date.now() - t0;
          liveState.consecutivePushFailures += 1;
          liveState.lastError = err.message || String(err);
          if (
            liveState.consecutivePushFailures <= 3 ||
            liveState.consecutivePushFailures % 20 === 0
          ) {
            console.warn("[live] push failed:", liveState.lastError);
          }
          // brief backoff on failure so we don't hammer a dead server
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    } finally {
      pushBusy = false;
      if (pendingLive && !stopping) void kickLivePush();
    }
  }

  async function maybeAnalysis() {
    const now = Date.now();
    if (analysisBusy || !latestForAnalysis) return;
    if (now - lastAnalysisMs < config.captureIntervalMs) return;

    analysisBusy = true;
    lastAnalysisMs = now;
    const jpeg = latestForAnalysis;

    try {
      await fs.mkdir(config.captureDir, { recursive: true });
      const filePath = livePath();
      await fs.writeFile(filePath, jpeg);
      const capturedAt = new Date().toISOString();
      const result = await uploadCapture({ filePath, capturedAt });
      liveState.lastAnalysisAt = capturedAt;
      liveState.lastAnalysisId = result.id;
      console.log(`[live] analysis upload id=${result.id}`);
    } catch (err) {
      console.warn("[live] analysis upload failed:", err.message || err);
    } finally {
      analysisBusy = false;
    }
  }

  statsTimer = setInterval(() => {
    if (stopping) return;
    console.log(
      `[live] stats 5s: parsed=${parsedWindow} pushed=${pushedWindow} dropped=${droppedWindow} lastPushMs=${liveState.lastPushMs ?? "—"}`,
    );
    parsedWindow = 0;
    pushedWindow = 0;
    droppedWindow = 0;
  }, 5_000);

  spawnCam();

  return {
    stop() {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (statsTimer) clearInterval(statsTimer);
      if (child) child.kill("SIGTERM");
      liveState.running = false;
    },
  };
}
