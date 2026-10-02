import { config } from "./config.js";

/**
 * Push a JPEG buffer to Gawdary live endpoint (display only).
 * Uses multipart FormData — same path that analysis uploads already use successfully.
 * @param {Buffer} buffer
 */
export async function pushLiveFrame(buffer) {
  const url = `${config.gawdaryUrl}/api/v1/live/frame`;
  const form = new FormData();
  form.append(
    "image",
    new Blob([buffer], { type: "image/jpeg" }),
    "live.jpg",
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
    },
    body: form,
  });

  if (res.status === 204 || res.status === 200) return;

  const text = await res.text().catch(() => "");
  const err = new Error(`Live push failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  err.status = res.status;
  throw err;
}
