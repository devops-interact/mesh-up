"""Async client for the KIRI Engine 3DGS video API."""
from __future__ import annotations

import asyncio
import logging
import zipfile
from pathlib import Path
from typing import Awaitable, Callable, Optional

import httpx

logger = logging.getLogger(__name__)

KIRI_OPEN_BASE = "https://api.kiriengine.app/api/v1/open"
DEFAULT_POLL_INTERVAL_S = 8.0
DEFAULT_TIMEOUT_S = 6 * 60 * 60
MAX_POLL_INTERVAL_S = 30.0
DOWNLOAD_TIMEOUT_S = 10 * 60

STATUS_UPLOADING = -1
STATUS_PROCESSING = 0
STATUS_FAILED = 1
STATUS_SUCCESS = 2
STATUS_QUEUED = 3
STATUS_EXPIRED = 4

STATUS_LABELS = {
    STATUS_UPLOADING: "uploading",
    STATUS_PROCESSING: "processing",
    STATUS_FAILED: "failed",
    STATUS_SUCCESS: "successful",
    STATUS_QUEUED: "queued",
    STATUS_EXPIRED: "expired",
}


class KiriError(Exception):
    pass


def extract_scan_assets(zip_path: Path, dest_dir: Path) -> tuple[Path, Optional[Path]]:
    """Pull the scene GLB and optional Gaussian-splat PLY out of a KIRI zip."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    glb_member: Optional[str] = None
    ply_member: Optional[str] = None
    with zipfile.ZipFile(zip_path) as archive:
        for name in archive.namelist():
            lower = name.lower()
            if lower.endswith("/"):
                continue
            if lower.endswith(".glb") and glb_member is None:
                glb_member = name
            elif lower.endswith(".ply") and ply_member is None:
                ply_member = name
        if glb_member is None:
            raise KiriError(f"KIRI zip has no GLB: {zip_path.name}")
        glb_path = dest_dir / "scene.glb"
        glb_path.write_bytes(archive.read(glb_member))
        ply_path = None
        if ply_member is not None:
            ply_path = dest_dir / "scene.ply"
            ply_path.write_bytes(archive.read(ply_member))
    return glb_path, ply_path


class KiriClient:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str = KIRI_OPEN_BASE,
        poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.poll_interval_s = poll_interval_s
        self.timeout_s = timeout_s

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    async def submit_3dgs_video(self, video_path: Path, *, is_mask: bool) -> str:
        """Upload a video and return the KIRI serialize id."""
        if not video_path.exists():
            raise KiriError(f"Video not found: {video_path}")
        data = {
            "isMesh": "1",
            "isMask": "1" if is_mask else "0",
            "fileFormat": "glb",
        }
        timeout = httpx.Timeout(600.0, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            with video_path.open("rb") as handle:
                response = await client.post(
                    f"{self.base_url}/3dgs/video",
                    headers=self._headers(),
                    data=data,
                    files={"videoFile": (video_path.name, handle, "video/mp4")},
                )
        payload = _parse_kiri_response(response)
        serialize = (payload.get("data") or {}).get("serialize")
        if not serialize:
            raise KiriError(f"KIRI upload did not return a serialize id: {payload}")
        logger.info("KIRI 3DGS submitted serialize=%s mask=%s", serialize, is_mask)
        return str(serialize)

    async def get_status(self, serialize: str) -> int:
        timeout = httpx.Timeout(30.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{self.base_url}/model/getStatus",
                headers=self._headers(),
                params={"serialize": serialize},
            )
        payload = _parse_kiri_response(response)
        status = (payload.get("data") or {}).get("status")
        if status is None:
            raise KiriError(f"KIRI status response missing status: {payload}")
        return int(status)

    async def poll_until_complete(
        self,
        serialize: str,
        on_poll: Optional[Callable[[int], Awaitable[None]]] = None,
    ) -> int:
        started = asyncio.get_running_loop().time()
        delay = self.poll_interval_s
        while True:
            status = await self.get_status(serialize)
            label = STATUS_LABELS.get(status, str(status))
            logger.info("KIRI task %s status=%s", serialize, label)
            if on_poll is not None:
                await on_poll(status)
            if status == STATUS_SUCCESS:
                return status
            if status in (STATUS_FAILED, STATUS_EXPIRED):
                raise KiriError(f"KIRI reconstruction {label} (serialize {serialize})")
            elapsed = asyncio.get_running_loop().time() - started
            if elapsed >= self.timeout_s:
                raise KiriError(
                    f"KIRI task {serialize} timed out after {self.timeout_s:.0f}s "
                    f"(last status: {label})"
                )
            await asyncio.sleep(delay)
            delay = min(MAX_POLL_INTERVAL_S, delay * 1.25)

    async def download_model_zip(self, serialize: str, dest_zip: Path) -> None:
        timeout = httpx.Timeout(DOWNLOAD_TIMEOUT_S, connect=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{self.base_url}/model/getModelZip",
                headers=self._headers(),
                params={"serialize": serialize},
            )
            payload = _parse_kiri_response(response)
            model_url = (payload.get("data") or {}).get("modelUrl")
            if not model_url:
                raise KiriError(f"KIRI download response missing modelUrl: {payload}")
            dest_zip.parent.mkdir(parents=True, exist_ok=True)
            async with client.stream("GET", model_url, follow_redirects=True) as download:
                download.raise_for_status()
                with dest_zip.open("wb") as handle:
                    async for chunk in download.aiter_bytes():
                        handle.write(chunk)
        logger.info("Downloaded KIRI zip %s (%d bytes)", dest_zip, dest_zip.stat().st_size)


_SUCCESS_CODES = {0, 200}


def _code_is_success(code: object) -> bool:
    if code is None:
        return True
    try:
        return int(code) in _SUCCESS_CODES
    except (TypeError, ValueError):
        return False


def _response_serialize(payload: dict) -> Optional[str]:
    data = payload.get("data")
    if not isinstance(data, dict):
        return None
    serialize = data.get("serialize")
    return str(serialize) if serialize else None


def _parse_kiri_response(response: httpx.Response) -> dict:
    try:
        payload = response.json()
    except Exception as exc:
        raise KiriError(f"KIRI returned non-JSON (HTTP {response.status_code})") from exc
    if not isinstance(payload, dict):
        raise KiriError(f"KIRI returned a non-object JSON body (HTTP {response.status_code})")

    code = payload.get("code")
    ok = payload.get("ok")
    serialize = _response_serialize(payload)
    http_ok = response.status_code < 400
    # A paid upload can return msg "success" with code 200, or code "0".
    # If serialize is present, keep it: rejecting here drops the scan after the credit is spent.
    accepted = http_ok and ok is not False and (_code_is_success(code) or bool(serialize))
    if accepted:
        if serialize and not _code_is_success(code):
            logger.warning(
                "KIRI accepted the task with unexpected code=%s; keeping serialize",
                code,
            )
        return payload

    message = payload.get("msg") or payload.get("message") or ""
    logger.error(
        "KIRI rejected response http=%s code=%s ok=%s msg=%s body=%s",
        response.status_code,
        code,
        ok,
        message,
        str(payload)[:500],
    )
    raise KiriError(
        f"KIRI API error (HTTP {response.status_code}, code={code}, ok={ok}): {message}"
    )
