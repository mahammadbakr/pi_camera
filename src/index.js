import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { startScheduler, state } from "./scheduler.js";
import { startLiveStream, liveState } from "./live.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

const app = express();

app.get("/", (_req, res) => {
  res.json({
    name: pkg.name,
    version: pkg.version,
    ok: true,
    liveEnabled: config.liveEnabled,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok:
      config.liveEnabled
        ? liveState.consecutivePushFailures < 10
        : state.consecutiveFailures < 3,
    gawdaryUrl: config.gawdaryUrl,
    liveEnabled: config.liveEnabled,
    captureIntervalMs: config.captureIntervalMs,
    still: state,
    live: liveState,
  });
});

app.listen(config.port, () => {
  console.log(`[pi-camera] health listening on :${config.port}`);
  console.log(`[pi-camera] gawdary ${config.gawdaryUrl}`);

  if (config.liveEnabled) {
    console.log("[pi-camera] live stream ON (rpicam-vid → /live/frame + periodic /captures)");
    startLiveStream();
  } else {
    console.log("[pi-camera] live stream OFF — still capture scheduler only");
    startScheduler(config.captureIntervalMs);
  }
});
