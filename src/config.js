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

function boolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  console.warn(`[config] invalid ${name}=${JSON.stringify(raw)}, using default ${fallback}`);
  return fallback;
}

export const config = {
  gawdaryUrl: strEnv("GAWDARY_URL", "https://gawdary-server.onrender.com").replace(
    /\/+$/,
    "",
  ),
  apiToken: requireEnv("API_TOKEN"),
  /** How often to upload a frame for AI analysis (not live). */
  captureIntervalMs: intEnv("CAPTURE_INTERVAL_MS", 8_000),
  captureDir: strEnv("CAPTURE_DIR", "/tmp/pi-camera"),
  rpicamBin: strEnv("RPICAM_BIN", "rpicam-still"),
  rpicamVidBin: strEnv("RPICAM_VID_BIN", "rpicam-vid"),
  imageWidth: intEnv("IMAGE_WIDTH", 1920),
  imageHeight: intEnv("IMAGE_HEIGHT", 1080),
  imageQuality: intEnv("IMAGE_QUALITY", 90),
  /** Live MJPEG stream via rpicam-vid (default on). */
  liveEnabled: boolEnv("LIVE_ENABLED", false),
  liveWidth: intEnv("LIVE_WIDTH", 640),
  liveHeight: intEnv("LIVE_HEIGHT", 480),
  liveFps: intEnv("LIVE_FPS", 5),
  /** Skip pushing every Nth parsed frame? 1 = push all. */
  livePushEvery: intEnv("LIVE_PUSH_EVERY", 1),
  port: intEnv("PORT", 3080),
  captureFilename: "latest.jpg",
  liveFilename: "live.jpg",
};

export function capturePath() {
  return path.join(config.captureDir, config.captureFilename);
}

export function livePath() {
  return path.join(config.captureDir, config.liveFilename);
}
