"""Generate a room shell envelope aligned to video-derived bounds."""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Mapping, Optional, Sequence

logger = logging.getLogger(__name__)

MIN_FRAMES_FOR_SHELL = 8
MIN_COVERAGE_DEG_FOR_SHELL = 200.0
_NEUTRAL_SHELL_COLOR = [190, 188, 185, 255]
_TEXTURE_SIZE = 512
_WALL_THICKNESS_RATIO = 0.02


def estimate_room_envelope(
    *,
    coverage_span_deg: float,
    orbit_radius_m: float = 2.5,
    default_height_m: float = 2.7,
) -> dict:
    """
    Estimate room width/depth/height from walkthrough coverage, not zone object bboxes.

    Returns dict with size_x, size_z, size_y, center_y.
    """
    span_rad = math.radians(max(coverage_span_deg, 90.0))
    width = max(2.0 * orbit_radius_m * math.sin(span_rad / 2.0) * 1.15, 3.0)
    depth = max(orbit_radius_m * 1.6, 3.0)
    height = default_height_m
    return {
        "size_x": width,
        "size_z": depth,
        "size_y": height,
        "center_y": height / 2.0,
    }


def should_create_shell(
    frame_count: int,
    coverage_span_deg: float,
) -> bool:
    return frame_count >= MIN_FRAMES_FOR_SHELL and coverage_span_deg >= MIN_COVERAGE_DEG_FOR_SHELL


def _load_texture_image(path: Path):
    from PIL import Image

    with Image.open(path) as img:
        rgb = img.convert("RGB")
        rgb = rgb.resize((_TEXTURE_SIZE, _TEXTURE_SIZE), Image.Resampling.LANCZOS)
        return rgb


def _best_keyframe_per_wall(
    keyframe_paths: Sequence[Path],
    yaw_by_path: Optional[Mapping[Path, float]],
    architecture_by_path: Optional[Mapping[Path, float]],
    n_zones: int,
) -> dict[str, Optional[Path]]:
    """Pick the highest-scoring keyframe for each cardinal wall."""
    walls: dict[str, Optional[Path]] = {"+x": None, "-x": None, "+z": None, "-z": None}
    if not yaw_by_path or not keyframe_paths:
        return walls

    bucket = 360.0 / max(n_zones, 1)
    zone_candidates: dict[int, list[tuple[Path, float]]] = {i: [] for i in range(n_zones)}

    for path in keyframe_paths:
        yaw = yaw_by_path.get(path)
        if yaw is None:
            continue
        zone_id = int((float(yaw) % 360.0) // bucket) % n_zones
        arch = architecture_by_path.get(path, 0.5) if architecture_by_path else 0.5
        zone_candidates[zone_id].append((path, arch))

    wall_names = ["+x", "+z", "-x", "-z"]
    for zone_id, wall in enumerate(wall_names):
        candidates = zone_candidates.get(zone_id, [])
        if not candidates:
            continue
        walls[wall] = max(candidates, key=lambda item: item[1])[0]

    return walls


def _textured_wall_x(
    trimesh,
    depth: float,
    height: float,
    x_pos: float,
    center_y: float,
    texture_path: Path | None,
):
    """Wall panel on ±X face (thin along X)."""
    import numpy as np
    from trimesh.visual import TextureVisuals

    thickness = max(depth, height) * _WALL_THICKNESS_RATIO
    mesh = trimesh.creation.box(extents=[thickness, height, depth])
    mesh.apply_translation([x_pos, center_y, 0.0])
    if texture_path and texture_path.exists():
        try:
            image = _load_texture_image(texture_path)
            mesh.visual = TextureVisuals(uv=mesh.visual.uv, image=image)
            return mesh
        except Exception as exc:
            logger.debug("Wall texture load failed for %s: %s", texture_path, exc)
    mesh.visual.vertex_colors = np.tile(_NEUTRAL_SHELL_COLOR, (len(mesh.vertices), 1))
    return mesh


def _textured_wall_z(
    trimesh,
    width: float,
    height: float,
    z_pos: float,
    center_y: float,
    texture_path: Path | None,
):
    """Wall panel on ±Z face (thin along Z)."""
    import numpy as np
    from trimesh.visual import TextureVisuals

    thickness = max(width, height) * _WALL_THICKNESS_RATIO
    mesh = trimesh.creation.box(extents=[width, height, thickness])
    mesh.apply_translation([0.0, center_y, z_pos])
    if texture_path and texture_path.exists():
        try:
            image = _load_texture_image(texture_path)
            mesh.visual = TextureVisuals(uv=mesh.visual.uv, image=image)
            return mesh
        except Exception as exc:
            logger.debug("Wall texture load failed for %s: %s", texture_path, exc)
    mesh.visual.vertex_colors = np.tile(_NEUTRAL_SHELL_COLOR, (len(mesh.vertices), 1))
    return mesh


def _neutral_floor_ceiling(trimesh, size_x: float, size_z: float, y_pos: float):
    import numpy as np

    thickness = max(size_x, size_z) * _WALL_THICKNESS_RATIO
    mesh = trimesh.creation.box(extents=[size_x, thickness, size_z])
    mesh.apply_translation([0.0, y_pos, 0.0])
    mesh.visual.vertex_colors = np.tile(_NEUTRAL_SHELL_COLOR, (len(mesh.vertices), 1))
    return mesh


def _export_textured_box_shell(
    trimesh,
    size_x: float,
    size_y: float,
    size_z: float,
    center_y: float,
    wall_textures: dict[str, Optional[Path]],
    shell_path: Path,
) -> bool:
    """Build a room shell from four textured walls plus neutral floor/ceiling."""
    half_x = size_x / 2.0
    half_z = size_z / 2.0
    cy = center_y

    scene = trimesh.Scene()
    wall_specs = [
        ("+x", half_x, size_z, size_y, "x"),
        ("-x", -half_x, size_z, size_y, "x"),
        ("+z", half_z, size_x, size_y, "z"),
        ("-z", -half_z, size_x, size_y, "z"),
    ]

    textured_count = 0
    for wall_name, pos, span_a, span_b, axis in wall_specs:
        tex_path = wall_textures.get(wall_name)
        has_texture = bool(tex_path and tex_path.exists())
        if axis == "x":
            mesh = _textured_wall_x(trimesh, span_a, span_b, pos, cy, tex_path if has_texture else None)
        else:
            mesh = _textured_wall_z(trimesh, span_a, span_b, pos, cy, tex_path if has_texture else None)
        if has_texture:
            textured_count += 1
        scene.add_geometry(mesh, node_name=f"wall_{wall_name}")

    scene.add_geometry(_neutral_floor_ceiling(trimesh, size_x, size_z, 0.0), node_name="floor")
    scene.add_geometry(_neutral_floor_ceiling(trimesh, size_x, size_z, size_y), node_name="ceiling")

    if textured_count == 0:
        return False

    try:
        scene.export(str(shell_path))
        return True
    except Exception as exc:
        logger.warning("Textured room shell export failed: %s", exc)
        return False


def _export_neutral_box_shell(
    trimesh,
    size_x: float,
    size_y: float,
    size_z: float,
    center_y: float,
    shell_path: Path,
) -> bool:
    import numpy as np

    box = trimesh.creation.box(extents=[size_x, size_y, size_z])
    box.apply_translation([0, center_y, 0])
    box.visual.vertex_colors = np.tile(_NEUTRAL_SHELL_COLOR, (len(box.vertices), 1))
    try:
        box.export(str(shell_path))
        return True
    except Exception as e:
        logger.warning("Neutral room shell export failed: %s", e)
        return False


def create_room_shell(
    job_id: str,
    models_dir: Path,
    keyframe_paths: Sequence[Path],
    *,
    coverage_span_deg: float = 360.0,
    orbit_radius_m: float = 2.5,
    default_height_m: float = 2.7,
    n_zones: int = 4,
    yaw_by_path=None,
    architecture_by_path=None,
    margin_ratio: float = 0.05,
) -> tuple[Path | None, bool]:
    """
    Create a room shell GLB sized from video envelope.

    Returns (shell_path, is_textured). Falls back to neutral box when texturing fails.
    """
    if not keyframe_paths:
        return None, False

    if not should_create_shell(len(keyframe_paths), coverage_span_deg):
        logger.info(
            "Room shell skipped — need >=%d frames and >=%.0f° coverage",
            MIN_FRAMES_FOR_SHELL,
            MIN_COVERAGE_DEG_FOR_SHELL,
        )
        return None, False

    try:
        import trimesh
    except ImportError:
        logger.warning("trimesh unavailable — skipping room shell")
        return None, False

    envelope = estimate_room_envelope(
        coverage_span_deg=coverage_span_deg,
        orbit_radius_m=orbit_radius_m,
        default_height_m=default_height_m,
    )
    size_x = envelope["size_x"] * (1.0 + margin_ratio)
    size_z = envelope["size_z"] * (1.0 + margin_ratio)
    size_y = envelope["size_y"]
    center_y = envelope["center_y"]

    out_dir = models_dir / job_id
    out_dir.mkdir(parents=True, exist_ok=True)
    shell_path = out_dir / "shell.glb"

    wall_textures = _best_keyframe_per_wall(
        keyframe_paths,
        yaw_by_path,
        architecture_by_path,
        n_zones,
    )
    textured = _export_textured_box_shell(
        trimesh,
        size_x,
        size_y,
        size_z,
        center_y,
        wall_textures,
        shell_path,
    )

    if textured:
        logger.info(
            "Textured room shell created at %s (%.1fx%.1fx%.1f from video envelope)",
            shell_path,
            size_x,
            size_y,
            size_z,
        )
        return shell_path, True

    logger.info("Textured shell unavailable — falling back to neutral box at %s", shell_path)
    if not _export_neutral_box_shell(trimesh, size_x, size_y, size_z, center_y, shell_path):
        return None, False

    logger.info(
        "Neutral room shell created at %s (%.1fx%.1fx%.1f from video envelope)",
        shell_path,
        size_x,
        size_y,
        size_z,
    )
    return shell_path, False
