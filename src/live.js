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
  lastFrameAt: null,
  lastPushAt: null,
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
 * Uses one camera process so still + video don't fight for exclusive access.
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
    "-n",
    "-o",
    "-",
  ];

  console.log(
    `[live] starting ${config.rpicamVidBin} ${config.liveWidth}x${config.liveHeight}@${config.liveFps} → live + analysis every ${config.captureIntervalMs}ms`,
  );

  let child = null;
  let restartTimer = null;
  let stopping = false;
  let buffer = Buffer.alloc(0);
  let pushBusy = false;
  let analysisBusy = false;
  let lastAnalysisMs = 0;
  let parsedSincePush = 0;

  const spawnCam = () => {
    if (stopping) return;
    child = spawn(config.rpicamVidBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stderr.on("data", (chunk) => {
      const msg = chunk.toString().trim();
      if (msg) console.warn("[live/rpicam]", msg.slice(0, 300));
    });

    child.on("error", (err) => {
      liveState.lastError = `spawn failed: ${err.message}`;
      console.error("[live]", liveState.lastError);
    });

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      // Cap buffer to avoid OOM if stream corrupts
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
        void onJpeg(jpeg);
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

  async function onJpeg(jpeg) {
    liveState.framesParsed += 1;
    liveState.lastFrameAt = new Date().toISOString();
    parsedSincePush += 1;

    // Persist latest for local debug / analysis upload source
    try {
      await fs.mkdir(config.captureDir, { recursive: true });
      await fs.writeFile(livePath(), jpeg);
    } catch {
      /* non-fatal */
    }

    if (parsedSincePush >= config.livePushEvery && !pushBusy) {
      parsedSincePush = 0;
      pushBusy = true;
      try {
        await pushLiveFrame(jpeg);
        liveState.framesPushed += 1;
        liveState.lastPushAt = new Date().toISOString();
        liveState.lastPushOk = true;
        liveState.consecutivePushFailures = 0;
        liveState.lastError = null;
      } catch (err) {
        liveState.lastPushOk = false;
        liveState.consecutivePushFailures += 1;
        liveState.lastError = err.message || String(err);
        if (liveState.consecutivePushFailures <= 3 || liveState.consecutivePushFailures % 20 === 0) {
          console.warn("[live] push failed:", liveState.lastError);
        }
      } finally {
        pushBusy = false;
      }
    }

    const now = Date.now();
    if (
      !analysisBusy &&
      now - lastAnalysisMs >= config.captureIntervalMs
    ) {
      analysisBusy = true;
      lastAnalysisMs = now;
      try {
        const capturedAt = new Date().toISOString();
        const filePath = livePath();
        await fs.writeFile(filePath, jpeg);
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
  }

  spawnCam();

  return {
    stop() {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (child) child.kill("SIGTERM");
      liveState.running = false;
    },
  };
}
