"""
Lightweight GLB preview images for scan cards (headless, no WebGL).
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from core.config import get_settings

logger = logging.getLogger(__name__)

THUMB_WIDTH = 384
THUMB_HEIGHT = 288
_SURFACE_SAMPLES = 3500


def thumbnail_path_for_job(job_id: str) -> Path:
    return get_settings().MODELS_DIR / f"{job_id}_thumb.png"


def thumbnail_api_url(job_id: str) -> str:
    return f"/api/jobs/{job_id}/thumbnail"


def render_glb_thumbnail(
    glb_path: Path,
    out_path: Path,
    width: int = THUMB_WIDTH,
    height: int = THUMB_HEIGHT,
) -> bool:
    """Project a decimated surface sample to a PNG (isometric-style preview)."""
    try:
        import numpy as np
        from PIL import Image
        import trimesh
    except ImportError as exc:
        logger.warning("Thumbnail dependencies missing: %s", exc)
        return False

    if not glb_path.is_file():
        return False

    try:
        scene = trimesh.load(str(glb_path), force="scene")
        if hasattr(scene, "to_geometry"):
            mesh = scene.to_geometry()
        else:
            mesh = scene.dump(concatenate=True)
    except Exception as exc:
        logger.warning("Failed to load GLB for thumbnail %s: %s", glb_path, exc)
        return False

    if mesh is None or not hasattr(mesh, "vertices") or len(mesh.vertices) == 0:
        return False

    try:
        if hasattr(mesh, "faces") and len(mesh.faces) > 0:
            count = min(_SURFACE_SAMPLES, max(400, len(mesh.faces) // 2))
            pts, _ = trimesh.sample.sample_surface(mesh, count)
        else:
            verts = mesh.vertices
            count = min(_SURFACE_SAMPLES, len(verts))
            idx = np.linspace(0, len(verts) - 1, count, dtype=int)
            pts = verts[idx]
    except Exception as exc:
        logger.warning("Surface sampling failed for %s: %s", glb_path, exc)
        pts = mesh.vertices
        if len(pts) > _SURFACE_SAMPLES:
            step = max(1, len(pts) // _SURFACE_SAMPLES)
            pts = pts[::step]

    pts = np.asarray(pts, dtype=np.float64)
    pts -= pts.mean(axis=0)
    radius = float(np.linalg.norm(pts, axis=1).max()) or 1.0
    pts /= radius

    elev = np.radians(32.0)
    azim = np.radians(-42.0)
    cy, sy = np.cos(elev), np.sin(elev)
    cz, sz = np.cos(azim), np.sin(azim)
    rot_y = np.array([[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]])
    rot_z = np.array([[cz, -sz, 0.0], [sz, cz, 0.0], [0.0, 0.0, 1.0]])
    proj = pts @ rot_y @ rot_z
    x = proj[:, 0]
    y = -proj[:, 1]

    margin = 10
    span_x = float(x.max() - x.min()) or 1.0
    span_y = float(y.max() - y.min()) or 1.0
    xs = (x - x.min()) / span_x * (width - 2 * margin) + margin
    ys = (y - y.min()) / span_y * (height - 2 * margin) + margin

    xi = np.clip(xs.astype(np.int32), 0, width - 1)
    yi = np.clip(ys.astype(np.int32), 0, height - 1)

    img = np.zeros((height, width, 3), dtype=np.uint8)
    img[:] = (14, 14, 16)
    img[yi, xi] = (210, 210, 215)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img, mode="RGB").save(out_path, format="PNG", optimize=True)
    return True


def ensure_glb_thumbnail(glb_path: Path, job_id: str) -> Optional[Path]:
    out = thumbnail_path_for_job(job_id)
    if out.is_file():
        return out
    if render_glb_thumbnail(glb_path, out):
        return out
    return None
