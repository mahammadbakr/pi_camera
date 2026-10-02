import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { startScheduler, state } from "./scheduler.js";

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
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: state.consecutiveFailures < 3,
    gawdaryUrl: config.gawdaryUrl,
    captureIntervalMs: config.captureIntervalMs,
    startedAt: state.startedAt,
    running: state.running,
    tickCount: state.tickCount,
    lastCaptureAt: state.lastCaptureAt,
    lastUploadAt: state.lastUploadAt,
    lastUploadId: state.lastUploadId,
    lastUploadStatus: state.lastUploadStatus,
    lastError: state.lastError,
    consecutiveFailures: state.consecutiveFailures,
  });
});

app.listen(config.port, () => {
  console.log(`[pi-camera] health listening on :${config.port}`);
  console.log(`[pi-camera] uploading to ${config.gawdaryUrl}/api/v1/captures`);
  startScheduler(config.captureIntervalMs);
});
