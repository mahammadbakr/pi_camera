import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { config, capturePath } from "./config.js";

/**
 * Run rpicam-still and write a JPEG to CAPTURE_DIR/latest.jpg
 * @returns {Promise<{ filePath: string, capturedAt: string }>}
 */
export async function captureStill() {
  await fs.mkdir(config.captureDir, { recursive: true });
  const filePath = capturePath();
  const capturedAt = new Date().toISOString();

  const args = [
    "-o",
    filePath,
    "-n",
    "--width",
    String(config.imageWidth),
    "--height",
    String(config.imageHeight),
    "--quality",
    String(config.imageQuality),
  ];

  await new Promise((resolve, reject) => {
    const child = spawn(config.rpicamBin, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(
        new Error(
          `Failed to spawn ${config.rpicamBin}: ${err.message}. Is the camera stack installed?`,
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${config.rpicamBin} exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      }
    });
  });

  const stat = await fs.stat(filePath);
  if (!stat.size) {
    throw new Error(`Capture wrote empty file: ${filePath}`);
  }

  return { filePath, capturedAt };
}
