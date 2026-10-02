import fs from "node:fs/promises";
import { captureStill } from "./capture.js";
import { uploadCapture } from "./upload.js";
import { pushLiveFrame } from "./live-upload.js";

/** Shared mutable status for /health */
export const state = {
  running: false,
  startedAt: null,
  lastCaptureAt: null,
  lastUploadAt: null,
  lastUploadId: null,
  lastUploadStatus: null,
  lastLivePushAt: null,
  lastError: null,
  consecutiveFailures: 0,
  tickCount: 0,
};

/**
 * One capture + live push + analysis upload. Safe to call while previous is running (no-op).
 */
export async function runCycle() {
  if (state.running) {
    console.warn("[scheduler] previous cycle still running, skipping tick");
    return;
  }

  state.running = true;
  state.tickCount += 1;
  const tick = state.tickCount;

  try {
    console.log(`[scheduler] tick #${tick}: capturing…`);
    const capture = await captureStill();
    state.lastCaptureAt = capture.capturedAt;
    console.log(`[scheduler] tick #${tick}: captured ${capture.filePath}`);

    const buf = await fs.readFile(capture.filePath);

    // Live dashboard first (cheap, in-memory on server)
    try {
      await pushLiveFrame(buf);
      state.lastLivePushAt = new Date().toISOString();
      console.log(`[scheduler] tick #${tick}: live frame pushed`);
    } catch (liveErr) {
      console.warn(
        `[scheduler] tick #${tick}: live push failed:`,
        liveErr.message || liveErr,
      );
    }

    console.log(`[scheduler] tick #${tick}: analysis uploading…`);
    const result = await uploadCapture(capture);
    state.lastUploadAt = new Date().toISOString();
    state.lastUploadId = result.id;
    state.lastUploadStatus = result.status;
    state.lastError = null;
    state.consecutiveFailures = 0;
    console.log(
      `[scheduler] tick #${tick}: uploaded id=${result.id} status=${result.status}`,
    );
  } catch (err) {
    state.lastError = err.message || String(err);
    state.consecutiveFailures += 1;
    console.error(`[scheduler] tick #${tick} failed:`, state.lastError);
  } finally {
    state.running = false;
  }
}

/**
 * Run immediately, then on intervalMs. Returns the interval handle.
 */
export function startScheduler(intervalMs) {
  state.startedAt = new Date().toISOString();
  console.log(
    `[scheduler] starting; interval=${intervalMs}ms (${(intervalMs / 1000 / 60).toFixed(1)} min)`,
  );

  void runCycle();

  return setInterval(() => {
    void runCycle();
  }, intervalMs);
}
