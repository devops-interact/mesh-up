"""
High-level orchestration: video → KIRI 3DGS-to-mesh → GLB.
"""
import logging
import time
from pathlib import Path
from typing import Optional

from core.config import get_settings, QUALITY_PRESETS, QualityPreset
from core.models import Job, JobStatus, ModelMetadata
from jobs.job_manager import get_job_manager
from services.video.orientation import resolve_pipeline_orientation
from services.video.prepare import prepare_video_for_kiri
from services.kiri.client import (
    KiriClient,
    KiriError,
    STATUS_PROCESSING,
    STATUS_QUEUED,
    extract_scan_assets,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def _extract_glb_metadata(glb_path: Path, thumbnail_url: Optional[str] = None) -> Optional[ModelMetadata]:
    try:
        import trimesh

        file_size = glb_path.stat().st_size
        scene = trimesh.load(str(glb_path), force="scene")
        if hasattr(scene, "geometry"):
            meshes = list(scene.geometry.values())
        else:
            meshes = [scene]

        total_verts = sum(len(m.vertices) for m in meshes if hasattr(m, "vertices"))
        total_faces = sum(len(m.faces) for m in meshes if hasattr(m, "faces"))

        bbox = None
        if meshes:
            bounds = scene.bounds if hasattr(scene, "bounds") else meshes[0].bounds
            bbox = {
                "min": bounds[0].tolist(),
                "max": bounds[1].tolist(),
            }

        return ModelMetadata(
            file_size=file_size,
            vertex_count=total_verts,
            face_count=total_faces,
            has_colors=True,
            has_pbr=True,
            bounding_box=bbox,
            format="glb",
            thumbnail_url=thumbnail_url,
        )
    except Exception as e:
        logger.warning("Failed to extract GLB metadata: %s", e)
        return ModelMetadata(
            file_size=glb_path.stat().st_size if glb_path.exists() else None,
            format="glb",
            thumbnail_url=thumbnail_url,
        )


async def _run_kiri_reconstruction(job: Job, video_path: Path, *, is_mask: bool, start_time: float) -> Job:
    """Submit a prepared video to KIRI, poll, and store the scene GLB."""
    job_manager = get_job_manager()
    client = KiriClient(
        api_key=settings.KIRI_API_KEY,
        poll_interval_s=settings.KIRI_POLL_INTERVAL_S,
        timeout_s=settings.KIRI_TIMEOUT_S,
    )

    job.status = JobStatus.SUBMITTING_RECONSTRUCTION
    job.progress = 0.25
    await job_manager.update_job(job)

    serialize = await client.submit_3dgs_video(video_path, is_mask=is_mask)
    job.meshy_task_id = serialize
    await job_manager.update_job(job)

    job.status = JobStatus.RECONSTRUCTING
    job.progress = 0.4
    await job_manager.update_job(job)

    async def on_poll(status: int) -> None:
        if status == STATUS_QUEUED:
            job.progress = max(job.progress, 0.45)
        elif status == STATUS_PROCESSING:
            job.progress = min(0.85, job.progress + 0.02)
        await job_manager.update_job(job)

    await client.poll_until_complete(serialize, on_poll=on_poll)

    job.status = JobStatus.DOWNLOADING_MODEL
    job.progress = 0.9
    await job_manager.update_job(job)

    job_dir = settings.MODELS_DIR / job.job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    zip_path = job_dir / "kiri.zip"
    await client.download_model_zip(serialize, zip_path)
    extracted_glb, ply_path = extract_scan_assets(zip_path, job_dir)
    final_glb = settings.MODELS_DIR / f"{job.job_id}.glb"
    final_glb.write_bytes(extracted_glb.read_bytes())
    zip_path.unlink(missing_ok=True)

    metadata = _extract_glb_metadata(final_glb)
    if metadata:
        metadata.meshy_task_id = serialize
        job.model_metadata = metadata

    job.status = JobStatus.COMPLETED
    job.progress = 1.0
    job.model_filename = f"{job.job_id}.glb"
    job.model_url = f"/api/jobs/{job.job_id}/model"
    job.error_message = None
    job.processing_time_seconds = round(time.time() - start_time, 1)
    await job_manager.update_job(job)
    logger.info(
        "Job %s completed in %ss (KIRI %s, splat=%s)",
        job.job_id,
        job.processing_time_seconds,
        serialize,
        ply_path is not None,
    )
    return job



async def process_job(job: Job) -> Job:
    """Upload video -> normalize -> KIRI 3DGS mesh -> GLB."""
    if not settings.KIRI_API_KEY:
        job.status = JobStatus.ERROR
        job.error_message = "KIRI_API_KEY is not configured"
        await get_job_manager().update_job(job)
        return job

    job_manager = get_job_manager()
    start_time = time.time()
    preset = job.quality_preset or QualityPreset.QUALITY
    preset_config = QUALITY_PRESETS[preset]

    try:
        video_path = settings.UPLOADS_DIR / job.video_filename
        if not video_path.exists():
            raise KiriError(f"Uploaded video missing: {video_path.name}")

        job.status = JobStatus.VALIDATING
        job.progress = 0.08
        await job_manager.update_job(job)

        orient = resolve_pipeline_orientation(video_path, job.validation)
        prepared = settings.UPLOADS_DIR / f"{job.job_id}-kiri.mp4"
        video_for_kiri = await prepare_video_for_kiri(
            video_path,
            prepared,
            rotation_deg=orient.rotation_deg,
            display_width=orient.display_width,
            display_height=orient.display_height,
        )
        return await _run_kiri_reconstruction(
            job,
            video_for_kiri,
            is_mask=preset_config.kiri_object_mask,
            start_time=start_time,
        )
    except KiriError as e:
        msg = str(e)
        if job.meshy_task_id and "timed out" in msg.lower():
            logger.warning(
                "KIRI still in progress for job %s serialize=%s; leaving it reconstructing",
                job.job_id,
                job.meshy_task_id,
            )
            job.status = JobStatus.RECONSTRUCTING
            job.error_message = None
            await job_manager.update_job(job)
            return job
        logger.error("Error processing job %s: %s", job.job_id, msg, exc_info=True)
        job.status = JobStatus.ERROR
        job.error_message = msg
        await job_manager.update_job(job)
        return job
    except Exception as e:
        logger.error("Error processing job %s: %s", job.job_id, e, exc_info=True)
        job.status = JobStatus.ERROR
        job.error_message = str(e)
        await job_manager.update_job(job)
        return job
