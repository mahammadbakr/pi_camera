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

1. **Live** (default): `rpicam-vid` MJPEG → `POST /api/v1/live/frame` (~5 fps)
2. **Analysis**: every `CAPTURE_INTERVAL_MS`, same camera frame → `POST /api/v1/captures`

One camera process only (avoids exclusive-access conflicts).

Set `LIVE_ENABLED=false` to use the old still-only scheduler (`rpicam-still`).

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
| `LIVE_ENABLED` | `true` | Use rpicam-vid live stream |
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
