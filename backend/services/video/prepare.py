"""Normalize an uploaded video before sending it to KIRI."""
from __future__ import annotations

import logging
from pathlib import Path

from services.video.orientation import transpose_filter_for_rotation
from utils.shell import run_command

logger = logging.getLogger(__name__)

KIRI_MAX_WIDTH = 1280
KIRI_MAX_HEIGHT = 720
KIRI_FPS = 15


async def prepare_video_for_kiri(
    source: Path,
    dest: Path,
    *,
    rotation_deg: int,
    display_width: int,
    display_height: int,
) -> Path:
    """
    Bake display orientation into the pixels and send KIRI a 720p, 15 fps file.

    A smaller video finishes sooner. KIRI still charges one credit. Phone videos
    often keep a rotate tag; without baking it the reconstruction comes out sideways.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    filters: list[str] = []
    transpose = transpose_filter_for_rotation(rotation_deg)
    if transpose:
        filters.append(transpose)
    filters.append(
        f"scale='min({KIRI_MAX_WIDTH},iw)':'min({KIRI_MAX_HEIGHT},ih)':force_original_aspect_ratio=decrease"
    )
    filters.append("scale=trunc(iw/2)*2:trunc(ih/2)*2")
    filters.append(f"fps={KIRI_FPS}")

    cmd = [
        "ffmpeg",
        "-y",
        "-noautorotate",
        "-i",
        str(source),
        "-vf",
        ",".join(filters),
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "20",
        "-metadata:s:v:0",
        "rotate=0",
        str(dest),
    ]
    logger.info("Normalizing %s for KIRI (rotation=%s, display=%dx%d)", source.name, rotation_deg, display_width, display_height)
    await run_command(cmd, timeout=600)
    return dest
