"""KIRI client: zip extraction and mocked HTTP."""
import asyncio
import zipfile
from unittest.mock import AsyncMock, patch

import pytest

from services.kiri.client import (
    STATUS_FAILED,
    STATUS_SUCCESS,
    KiriClient,
    KiriError,
    extract_scan_assets,
)


def test_extract_scan_assets_writes_glb_and_ply(tmp_path):
    archive = tmp_path / "scan.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("out/scene.glb", b"glb-bytes")
        zf.writestr("out/scene.ply", b"ply-bytes")
        zf.writestr("out/readme.txt", b"skip")

    dest = tmp_path / "extracted"
    glb, ply = extract_scan_assets(archive, dest)
    assert glb.read_bytes() == b"glb-bytes"
    assert ply is not None
    assert ply.read_bytes() == b"ply-bytes"


def test_extract_scan_assets_requires_glb(tmp_path):
    archive = tmp_path / "scan.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("only.ply", b"ply")
    with pytest.raises(KiriError, match="no GLB"):
        extract_scan_assets(archive, tmp_path / "out")


def test_submit_sends_mesh_and_mask(tmp_path):
    video = tmp_path / "walk.mp4"
    video.write_bytes(b"video")
    captured: dict = {}

    class Response:
        status_code = 200

        def json(self):
            return {"code": 0, "ok": True, "data": {"serialize": "abc123"}}

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers=None, data=None, files=None):
            captured["url"] = url
            captured["data"] = data
            captured["auth"] = headers["Authorization"]
            return Response()

    async def run():
        with patch("services.kiri.client.httpx.AsyncClient", Client):
            return await KiriClient("secret").submit_3dgs_video(video, is_mask=True)

    serialize = asyncio.run(run())
    assert serialize == "abc123"
    assert captured["url"].endswith("/3dgs/video")
    assert captured["data"] == {"isMesh": "1", "isMask": "1", "fileFormat": "glb"}
    assert captured["auth"] == "Bearer secret"


def _upload_client(body: dict):
    class Response:
        status_code = 200

        def json(self):
            return body

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, headers=None, data=None, files=None):
            return Response()

    return Client


def test_submit_accepts_http_style_success_code(tmp_path):
    video = tmp_path / "walk.mp4"
    video.write_bytes(b"video")

    async def run():
        with patch(
            "services.kiri.client.httpx.AsyncClient",
            _upload_client({
                "code": 200,
                "msg": "success",
                "ok": True,
                "data": {"serialize": "paid-scan-1"},
            }),
        ):
            return await KiriClient("secret").submit_3dgs_video(video, is_mask=False)

    assert asyncio.run(run()) == "paid-scan-1"


def test_submit_keeps_serialize_when_code_is_unexpected(tmp_path):
    video = tmp_path / "walk.mp4"
    video.write_bytes(b"video")

    async def run():
        with patch(
            "services.kiri.client.httpx.AsyncClient",
            _upload_client({
                "code": "0",
                "msg": "success",
                "ok": True,
                "data": {"serialize": "string-code"},
            }),
        ):
            return await KiriClient("secret").submit_3dgs_video(video, is_mask=True)

    assert asyncio.run(run()) == "string-code"


def test_submit_rejects_ok_false(tmp_path):
    video = tmp_path / "walk.mp4"
    video.write_bytes(b"video")

    async def run():
        with patch(
            "services.kiri.client.httpx.AsyncClient",
            _upload_client({"code": 200, "msg": "success", "ok": False, "data": {}}),
        ):
            await KiriClient("secret").submit_3dgs_video(video, is_mask=False)

    with pytest.raises(KiriError, match="ok=False"):
        asyncio.run(run())


def test_poll_status_failed_raises():
    client = KiriClient("secret", poll_interval_s=0.01, timeout_s=5)

    async def run():
        with patch.object(client, "get_status", AsyncMock(return_value=STATUS_FAILED)):
            await client.poll_until_complete("abc123")

    with pytest.raises(KiriError, match="failed"):
        asyncio.run(run())


def test_poll_status_success():
    client = KiriClient("secret", poll_interval_s=0.01, timeout_s=5)
    seen: list[int] = []

    async def on_poll(status: int) -> None:
        seen.append(status)

    async def run():
        with patch.object(client, "get_status", AsyncMock(return_value=STATUS_SUCCESS)):
            return await client.poll_until_complete("abc123", on_poll=on_poll)

    assert asyncio.run(run()) == STATUS_SUCCESS
    assert seen == [STATUS_SUCCESS]
