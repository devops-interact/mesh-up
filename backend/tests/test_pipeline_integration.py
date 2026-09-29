"""Integration test for process_job with a mocked KIRI client."""
import asyncio
import zipfile
from datetime import datetime
from unittest.mock import AsyncMock, patch

from core.models import Job, JobStatus, ModelMetadata, QualityPreset
from core.pipeline import process_job
from services.kiri.client import KiriError
from services.video.orientation import VideoOrientation


def _job(job_id: str, preset: QualityPreset) -> Job:
    now = datetime.now()
    return Job(
        job_id=job_id,
        status=JobStatus.UPLOADED,
        video_filename=f"{job_id}.mp4",
        quality_preset=preset,
        created_at=now,
        updated_at=now,
    )


def _orientation() -> VideoOrientation:
    return VideoOrientation(
        stored_width=1280,
        stored_height=720,
        rotation_deg=0,
        display_width=1280,
        display_height=720,
        aspect_label="16:9",
        is_portrait=False,
    )


def test_process_job_completes_with_mocked_kiri(temp_storage):
    job = _job("test-job", QualityPreset.QUALITY)
    video_path = temp_storage.UPLOADS_DIR / "test-job.mp4"
    video_path.write_bytes(b"fake")

    async def fake_download(serialize, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(dest, "w") as archive:
            archive.writestr("scene.glb", b"glTF" + b"\x00" * 12)
            archive.writestr("scene.ply", b"ply")

    mock_client = AsyncMock()
    mock_client.submit_3dgs_video.return_value = "kiri-serialize-1"
    mock_client.download_model_zip.side_effect = fake_download

    async def run():
        with patch("core.pipeline.settings.KIRI_API_KEY", "test-key"), \
             patch("core.pipeline.settings.UPLOADS_DIR", temp_storage.UPLOADS_DIR), \
             patch("core.pipeline.settings.MODELS_DIR", temp_storage.MODELS_DIR), \
             patch("core.pipeline.KiriClient", return_value=mock_client), \
             patch("core.pipeline.resolve_pipeline_orientation", return_value=_orientation()), \
             patch("core.pipeline.prepare_video_for_kiri", new_callable=AsyncMock, return_value=video_path), \
             patch("core.pipeline._extract_glb_metadata", return_value=ModelMetadata(
                 file_size=16, vertex_count=1, face_count=1, format="glb",
             )), \
             patch("core.pipeline.get_job_manager") as mock_jm:
            mock_jm.return_value.update_job = AsyncMock()
            result = await process_job(job)
            assert result.status == JobStatus.COMPLETED
            assert result.meshy_task_id == "kiri-serialize-1"
            assert result.model_filename == "test-job.glb"
            assert (temp_storage.MODELS_DIR / "test-job.glb").exists()
            assert (temp_storage.MODELS_DIR / "test-job" / "scene.ply").exists()
            mock_client.submit_3dgs_video.assert_awaited_once()
            assert mock_client.submit_3dgs_video.await_args.kwargs["is_mask"] is True

    asyncio.run(run())


def test_process_job_room_does_not_mask(temp_storage):
    job = _job("room-job", QualityPreset.ROOM)
    video_path = temp_storage.UPLOADS_DIR / "room-job.mp4"
    video_path.write_bytes(b"fake")

    async def fake_download(serialize, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(dest, "w") as archive:
            archive.writestr("scene.glb", b"glTF")

    mock_client = AsyncMock()
    mock_client.submit_3dgs_video.return_value = "kiri-room"
    mock_client.download_model_zip.side_effect = fake_download

    async def run():
        with patch("core.pipeline.settings.KIRI_API_KEY", "test-key"), \
             patch("core.pipeline.settings.UPLOADS_DIR", temp_storage.UPLOADS_DIR), \
             patch("core.pipeline.settings.MODELS_DIR", temp_storage.MODELS_DIR), \
             patch("core.pipeline.KiriClient", return_value=mock_client), \
             patch("core.pipeline.resolve_pipeline_orientation", return_value=_orientation()), \
             patch("core.pipeline.prepare_video_for_kiri", new_callable=AsyncMock, return_value=video_path), \
             patch("core.pipeline._extract_glb_metadata", return_value=None), \
             patch("core.pipeline.get_job_manager") as mock_jm:
            mock_jm.return_value.update_job = AsyncMock()
            result = await process_job(job)
            assert result.status == JobStatus.COMPLETED
            assert mock_client.submit_3dgs_video.await_args.kwargs["is_mask"] is False

    asyncio.run(run())


def test_process_job_kiri_failure(temp_storage):
    job = _job("fail-job", QualityPreset.QUALITY)
    (temp_storage.UPLOADS_DIR / "fail-job.mp4").write_bytes(b"fake")
    mock_client = AsyncMock()
    mock_client.submit_3dgs_video.return_value = "kiri-fail"
    mock_client.poll_until_complete.side_effect = KiriError(
        "KIRI reconstruction failed (serialize kiri-fail)"
    )

    async def run():
        with patch("core.pipeline.settings.KIRI_API_KEY", "test-key"), \
             patch("core.pipeline.settings.UPLOADS_DIR", temp_storage.UPLOADS_DIR), \
             patch("core.pipeline.settings.MODELS_DIR", temp_storage.MODELS_DIR), \
             patch("core.pipeline.KiriClient", return_value=mock_client) as client_cls, \
             patch("core.pipeline.resolve_pipeline_orientation", return_value=_orientation()), \
             patch("core.pipeline.prepare_video_for_kiri", new_callable=AsyncMock), \
             patch("core.pipeline.get_job_manager") as mock_jm:
            mock_jm.return_value.update_job = AsyncMock()
            result = await process_job(job)
            assert result.status == JobStatus.ERROR
            assert "failed" in (result.error_message or "")
            assert client_cls.call_args.kwargs["timeout_s"] == 21600.0

    asyncio.run(run())


def test_process_job_requires_kiri_key(temp_storage):
    job = _job("nokey", QualityPreset.QUALITY)
    (temp_storage.UPLOADS_DIR / "nokey.mp4").write_bytes(b"fake")

    async def run():
        with patch("core.pipeline.settings.KIRI_API_KEY", ""), \
             patch("core.pipeline.get_job_manager") as mock_jm:
            mock_jm.return_value.update_job = AsyncMock()
            result = await process_job(job)
            assert result.status == JobStatus.ERROR
            assert "KIRI_API_KEY" in (result.error_message or "")

    asyncio.run(run())
