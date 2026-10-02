import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

/** Only API_TOKEN is required; everything else has a default. */
function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function strEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return String(raw).trim();
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[config] invalid ${name}=${JSON.stringify(raw)}, using default ${fallback}`);
    return fallback;
  }
  return n;
}

export const config = {
  gawdaryUrl: strEnv("GAWDARY_URL", "https://gawdary-server.onrender.com").replace(
    /\/+$/,
    "",
  ),
  apiToken: requireEnv("API_TOKEN"),
  captureIntervalMs: intEnv("CAPTURE_INTERVAL_MS", 300_000),
  captureDir: strEnv("CAPTURE_DIR", "/tmp/pi-camera"),
  rpicamBin: strEnv("RPICAM_BIN", "rpicam-still"),
  imageWidth: intEnv("IMAGE_WIDTH", 1920),
  imageHeight: intEnv("IMAGE_HEIGHT", 1080),
  imageQuality: intEnv("IMAGE_QUALITY", 90),
  port: intEnv("PORT", 3080),
  captureFilename: "latest.jpg",
};

export function capturePath() {
  return path.join(config.captureDir, config.captureFilename);
}
