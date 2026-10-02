import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer`);
  }
  return n;
}

export const config = {
  gawdaryUrl: String(process.env.GAWDARY_URL || "https://gawdary-server.onrender.com")
    .trim()
    .replace(/\/+$/, ""),
  apiToken: requireEnv("API_TOKEN"),
  captureIntervalMs: intEnv("CAPTURE_INTERVAL_MS", 300_000),
  captureDir: String(process.env.CAPTURE_DIR || "/tmp/pi-camera").trim(),
  rpicamBin: String(process.env.RPICAM_BIN || "rpicam-still").trim(),
  imageWidth: intEnv("IMAGE_WIDTH", 1920),
  imageHeight: intEnv("IMAGE_HEIGHT", 1080),
  imageQuality: intEnv("IMAGE_QUALITY", 90),
  port: intEnv("PORT", 3080),
  captureFilename: "latest.jpg",
};

export function capturePath() {
  return path.join(config.captureDir, config.captureFilename);
}
