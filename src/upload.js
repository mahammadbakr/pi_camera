import fs from "node:fs/promises";
import { config } from "./config.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload a JPEG to Gawdary POST /api/v1/captures
 * Retries once on network errors or 5xx.
 * @param {{ filePath: string, capturedAt: string }} capture
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function uploadCapture({ filePath, capturedAt }) {
  const url = `${config.gawdaryUrl}/api/v1/captures`;

  async function once() {
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append(
      "image",
      new Blob([buf], { type: "image/jpeg" }),
      "latest.jpg",
    );
    form.append("captured_at", capturedAt);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: form,
    });

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    if (res.status === 202 && body.id) {
      return { id: body.id, status: body.status || "pending" };
    }

    const err = new Error(
      `Upload failed HTTP ${res.status}: ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
    err.status = res.status;
    throw err;
  }

  try {
    return await once();
  } catch (err) {
    const retryable =
      !err.status || (err.status >= 500 && err.status < 600);
    if (!retryable) throw err;
    console.warn("[upload] transient failure, retrying once:", err.message);
    await sleep(2000);
    return await once();
  }
}
