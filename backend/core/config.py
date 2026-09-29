"""
Configuration settings for the application
"""
from pathlib import Path
from typing import List, Dict, Literal, Optional
from pydantic_settings import BaseSettings
from pydantic import BaseModel
from functools import lru_cache
from enum import Enum


class QualityPreset(str, Enum):
    """Scan presets. Both reconstruct one mesh; they differ only by KIRI masking."""
    QUALITY = "quality"
    ROOM = "room"


LEGACY_PRESET_ALIASES: Dict[str, QualityPreset] = {
    "fast": QualityPreset.QUALITY,
    "balanced": QualityPreset.QUALITY,
}


def resolve_quality_preset(value: Optional[str]) -> QualityPreset:
    """Map API/DB preset strings to active presets (legacy fast/balanced → quality)."""
    if not value:
        return QualityPreset.QUALITY
    try:
        return QualityPreset(value)
    except ValueError:
        return LEGACY_PRESET_ALIASES.get(value, QualityPreset.QUALITY)


class ScanPresetConfig(BaseModel):
    """UI and pipeline settings for one scan preset."""
    name: str
    description: str
    estimated_minutes: int
    composition_mode: Literal["single_object", "zone_mesh", "room_shell"] = "single_object"
    kiri_object_mask: bool = False


QUALITY_PRESETS: Dict[QualityPreset, ScanPresetConfig] = {
    QualityPreset.QUALITY: ScanPresetConfig(
        name="Object — isolated subject",
        description="One mesh of a single object. KIRI masks the background. Up to 3 minutes.",
        estimated_minutes=15,
        kiri_object_mask=True,
    ),
    QualityPreset.ROOM: ScanPresetConfig(
        name="Room — full space",
        description="One mesh of the whole space. Reconstruction can take over an hour. Video up to 3 minutes.",
        estimated_minutes=60,
        kiri_object_mask=False,
    ),
}


class Settings(BaseSettings):
    # Storage paths
    BASE_DIR: Path = Path(__file__).parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOADS_DIR: Path = STORAGE_DIR / "uploads"
    FRAMES_DIR: Path = STORAGE_DIR / "frames"
    MODELS_DIR: Path = STORAGE_DIR / "models"
    LOGS_DIR: Path = STORAGE_DIR / "logs"

    ENV: str = "development"

    # Video validation settings
    MIN_VIDEO_DURATION: float = 3.0
    MAX_VIDEO_DURATION: float = 180.0
    MIN_VIDEO_RESOLUTION: int = 480

    # Database (SQLite in storage dir)
    DATABASE_URL: str = ""

    # Auth (JWT)
    JWT_SECRET_KEY: str = "mesh-up-demo-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7

    # API settings
    MAX_UPLOAD_SIZE: int = 500 * 1024 * 1024
    ALLOWED_EXTENSIONS: List[str] = [".mp4", ".mov", ".avi", ".webm"]

    # KIRI Engine API (3DGS video → mesh)
    KIRI_API_KEY: str = ""
    KIRI_POLL_INTERVAL_S: float = 8.0
    KIRI_TIMEOUT_S: float = 21600.0
    KIRI_MAX_PARALLEL_JOBS: int = 2

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    for dir_path in [settings.UPLOADS_DIR, settings.FRAMES_DIR,
                     settings.MODELS_DIR, settings.LOGS_DIR]:
        dir_path.mkdir(parents=True, exist_ok=True)
    if not settings.DATABASE_URL:
        db_path = settings.STORAGE_DIR / "data.db"
        settings.DATABASE_URL = f"sqlite:///{db_path}"
    if settings.ENV == "production" and settings.JWT_SECRET_KEY == "mesh-up-demo-secret-change-in-production":
        raise RuntimeError("JWT_SECRET_KEY must be set in production")
    return settings
