from pathlib import Path
from unittest.mock import MagicMock, patch

from services.meshy.room_shell import (
    _best_keyframe_per_wall,
    create_room_shell,
    estimate_room_envelope,
    should_create_shell,
)


def test_estimate_room_envelope_from_coverage() -> None:
    env = estimate_room_envelope(coverage_span_deg=300.0, orbit_radius_m=2.5, default_height_m=2.7)
    assert env["size_x"] >= 3.0
    assert env["size_z"] >= 3.0
    assert env["size_y"] == 2.7


def test_should_create_shell_requires_coverage() -> None:
    assert should_create_shell(20, 250.0) is True
    assert should_create_shell(5, 250.0) is False
    assert should_create_shell(20, 150.0) is False


def test_best_keyframe_per_wall_picks_by_zone() -> None:
    frames = [Path(f"/tmp/frame_{i}.jpg") for i in range(4)]
    yaw_by_path = {
        frames[0]: 45.0,
        frames[1]: 135.0,
        frames[2]: 225.0,
        frames[3]: 315.0,
    }
    arch_by_path = {p: 0.5 for p in frames}
    arch_by_path[frames[0]] = 0.9

    walls = _best_keyframe_per_wall(frames, yaw_by_path, arch_by_path, n_zones=4)
    assert walls["+x"] == frames[0]


def test_create_room_shell_exports_neutral_box(tmp_path: Path) -> None:
    frames = []
    for i in range(10):
        p = tmp_path / f"frame_{i:03d}.jpg"
        p.write_bytes(b"fake")
        frames.append(p)

    with (
        patch("trimesh.creation.box") as mock_box,
        patch("services.meshy.room_shell._export_textured_box_shell", return_value=False),
    ):
        mock_mesh = mock_box.return_value
        mock_mesh.vertices = list(range(8))
        mock_mesh.export = lambda path: Path(path).write_bytes(b"glb")
        result, textured = create_room_shell(
            "job-1",
            tmp_path / "models",
            frames,
            coverage_span_deg=320.0,
            orbit_radius_m=2.5,
            default_height_m=2.7,
        )

    assert result is not None
    assert textured is False
    extents = mock_box.call_args[1]["extents"]
    assert extents[0] >= 3.0
    assert extents[2] >= 3.0


def test_create_room_shell_skips_low_coverage(tmp_path: Path) -> None:
    frames = [tmp_path / f"frame_{i:03d}.jpg" for i in range(10)]
    for p in frames:
        p.write_bytes(b"fake")

    result, textured = create_room_shell(
        "job-1",
        tmp_path / "models",
        frames,
        coverage_span_deg=150.0,
    )

    assert result is None
    assert textured is False


def test_create_room_shell_textured_path(tmp_path: Path) -> None:
    frames = [tmp_path / f"frame_{i:03d}.jpg" for i in range(10)]
    for p in frames:
        p.write_bytes(b"fake")
    shell_path = tmp_path / "models" / "job-1" / "shell.glb"

    with patch("services.meshy.room_shell._export_textured_box_shell", return_value=True):
        result, textured = create_room_shell(
            "job-1",
            tmp_path / "models",
            frames,
            coverage_span_deg=320.0,
        )

    assert result == shell_path
    assert textured is True
