# Pi Camera — Gawdary client

Node.js service for a Raspberry Pi: capture a JPEG with `rpicam-still` every 5 minutes and upload it to [Gawdary](https://gawdary-server.onrender.com).

## Requirements

- Raspberry Pi OS with camera enabled
- `rpicam-still` on `PATH` (libcamera stack)
- Node.js 20+

## Setup

```bash
cp .env.example .env
# Only API_TOKEN is required (same as Gawdary server)
npm install
npm start
```

Local health: `http://localhost:3080/health`

## Config

**Required**

| Variable | Purpose |
|----------|---------|
| `API_TOKEN` | Bearer token (shared with Gawdary) |

**Optional** (built-in defaults)

| Variable | Default | Purpose |
|----------|---------|---------|
| `GAWDARY_URL` | `https://gawdary-server.onrender.com` | API base URL |
| `CAPTURE_INTERVAL_MS` | `300000` | Interval between captures (5 min) |
| `CAPTURE_DIR` | `/tmp/pi-camera` | Where JPEGs are written |
| `RPICAM_BIN` | `rpicam-still` | Capture binary |
| `IMAGE_WIDTH` / `IMAGE_HEIGHT` / `IMAGE_QUALITY` | `1920` / `1080` / `90` | Still settings |
| `PORT` | `3080` | Local health HTTP port |

## Upload contract

```
POST {GAWDARY_URL}/api/v1/captures
Authorization: Bearer {API_TOKEN}
multipart: image=<jpeg>, captured_at=<ISO-8601 UTC>
→ 202 { id, status: "pending" }
```

## systemd (boot autostart)

Edit paths in `systemd/pi-camera.service`, then:

```bash
sudo cp systemd/pi-camera.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-camera
sudo systemctl status pi-camera
```
