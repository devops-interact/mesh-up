# MESH-UP — Architecture

## Overview

Web app that converts a video into one measurable **textured 3D mesh (GLB)** using the **KIRI Engine 3DGS** video API (`isMesh=1`). Hosted on **Railway** (two services: API + frontend).

## Railway services

```
┌─────────────────────────┐     proxy /api, /static      ┌──────────────────────────┐
│  web (frontend)         │ ────────────────────────────▶│  api (backend)           │
│  nginx + React SPA      │     BACKEND_URL env var      │  FastAPI + FFmpeg + KIRI │
│  Dockerfile.frontend.railway │                              │  Dockerfile.railway      │
└─────────────────────────┘                              └──────────────────────────┘
         ▲                                                           │
         │ user browser                                              │ KIRI API
         └───────────────────────────────────────────────────────────┘
```

| Service | Dockerfile | Config |
|---|---|---|
| **api** | `Dockerfile.railway` | `railway.toml` |
| **web** | `Dockerfile.frontend.railway` | `railway.frontend.toml` |

The frontend uses **same-origin** `/api/...` calls; nginx proxies to the API service (no Vercel, no CORS setup needed).

## Pipeline

Both presets use the same path. The only difference is KIRI `isMask`.

```
Video upload → validate (≤3 min, scale above 1080p)
→ FFmpeg normalize (bake rotation)
→ POST /3dgs/video (isMesh=1, fileFormat=glb)
→ poll GET /model/getStatus
→ GET /model/getModelZip → store GLB
→ Babylon viewer, measure on the mesh
```

| Preset | `isMask` | What it reconstructs |
|---|---|---|
| quality (Object) | 1 | One subject, background cut |
| room | 0 | The whole space |

A Gaussian-splat PLY in the same zip is stored and not drawn. Measurement raycasts the GLB. Older Meshy jobs that already have a GLB stay downloadable. The zone/shell code is unused by new jobs.

The KIRI serialize id is stored in the existing `meshy_task_id` column. If the API restarts after submit and before the GLB is saved, startup resumes that poll.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Babylon.js (GLB mesh viewer), nginx |
| Backend | FastAPI, FFmpeg, httpx (KIRI client), SQLite jobs |
| Reconstruction | KIRI Engine 3DGS video (`isMesh=1`, `fileFormat=glb`) |
| Hosting | Railway (2 services) |

## API endpoints (jobs)

| Endpoint | Description |
|---|---|
| `GET /api/presets` | Preset list (single source of truth for UI) |
| `GET /api/jobs/{id}/status` | Progress, keyframes, scene_manifest |
| `GET /api/jobs/{id}/model` | Scene GLB |
| `GET /api/jobs/{id}/scene` | Scene manifest (older multi-zone jobs) |
| `GET /api/jobs/{id}/zones/{zone_id}` | Per-zone GLB (older jobs) |
| `GET /api/jobs/{id}/shell` | Room shell GLB (older jobs) |

## Deploy

See [`docs/RAILWAY-RUNBOOK.md`](docs/RAILWAY-RUNBOOK.md).

```bash
# API service
railway up --service api

# Frontend service (set BACKEND_URL to api public URL first)
railway up --service web
```

## Viewer features

- Orbit / pan / zoom on the GLB mesh
- Walkthrough (UniversalCamera + collision proxy; walk path from manifest when available)
- Two-point calibration measurement (mesh raycast) with scale warning until calibrated
- Zone and shell toggles only when an older job still has those meshes
- Lighting panel (ambient / directional / environment)
- WebXR VR
- Viewer defaults in Settings (localStorage)

## Scene manifest

```json
{
  "composition_mode": "zone_mesh",
  "zones": [
    { "id": 0, "mesh_url": "/api/jobs/{id}/zones/0", "transform": [[...4x4...]] }
  ],
  "shell_url": "/api/jobs/{id}/shell",
  "walk_path": [[x, y, z, tx, ty, tz], ...]
}
```

## Limits

KIRI accepts a display resolution up to 1920×1080 and a duration up to 3 minutes. One credit per scan. The zip download URL expires after 60 minutes, so the worker downloads it in the same process that sees status `2`.
