# Pi Camera — Gawdary client

Node.js service for a Raspberry Pi: stream live MJPEG frames to Gawdary for the dashboard, and periodically upload stills for AI analysis.

## Requirements

- Raspberry Pi OS with camera enabled
- `rpicam-vid` (live) and `rpicam-still` (fallback) on `PATH`
- Node.js 20+

## Setup

```bash
cp .env.example .env
# Only API_TOKEN is required (same as Gawdary server)
npm install
npm start
```

Local health: `http://localhost:3080/health`

## What it does

1. **Live stream** (default): `rpicam-vid` MJPEG ~5 fps → `POST /api/v1/live/frame`
2. **Analysis**: every `CAPTURE_INTERVAL_MS`, a frame from that stream → `POST /api/v1/captures`

One camera process (`rpicam-vid`) avoids exclusive-access conflicts.

Set `LIVE_ENABLED=false` to fall back to `rpicam-still` (still pushes live frames each interval).

## Config

**Required**

| Variable | Purpose |
|----------|---------|
| `API_TOKEN` | Bearer token (shared with Gawdary) |

**Optional**

| Variable | Default | Purpose |
|----------|---------|---------|
| `GAWDARY_URL` | `https://gawdary-server.onrender.com` | API base URL |
| `CAPTURE_INTERVAL_MS` | `8000` | Analysis upload interval |
| `LIVE_ENABLED` | `true` | `rpicam-vid` live stream (set `false` for still-only) |
| `LIVE_WIDTH` / `LIVE_HEIGHT` / `LIVE_FPS` | `640` / `480` / `5` | Stream settings |
| `RPICAM_VID_BIN` | `rpicam-vid` | Video binary |
| `RPICAM_BIN` | `rpicam-still` | Still binary (fallback mode) |
| `PORT` | `3080` | Local health HTTP port |

## systemd (boot autostart)

Edit paths in `systemd/pi-camera.service`, then:

```bash
sudo cp systemd/pi-camera.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pi-camera
sudo systemctl status pi-camera
```
