from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class TimePeriod(str, Enum):
    LATEST = "latest"  # Most recent episode per podcast
    DAY = "day"
    WEEK = "week"
    TWO_WEEKS = "2weeks"
    THREE_WEEKS = "3weeks"
    MONTH = "month"
    CUSTOM = "custom"


# Episode Analysis schemas
class EpisodeAnalysisBase(BaseModel):
    overview: Optional[str] = None
    key_points: Optional[list[str]] = None
    topics: Optional[list[str]] = None
    themes: Optional[list[str]] = None
    predictions: Optional[list[str]] = None
    recommendations: Optional[list[str]] = None
    advice: Optional[list[str]] = None
    notable_quotes: Optional[list[str]] = None


class EpisodeAnalysis(EpisodeAnalysisBase):
    id: int
    episode_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Episode schemas
class EpisodeBase(BaseModel):
    title: str
    audio_url: str
    description: Optional[str] = None
    published_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


class EpisodeCreate(EpisodeBase):
    podcast_id: int
    guid: Optional[str] = None


class Episode(EpisodeBase):
    id: int
    podcast_id: int
    guid: Optional[str] = None
    status: str
    transcript: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime
    analysis: Optional[EpisodeAnalysis] = None

    class Config:
        from_attributes = True


class EpisodeCompact(BaseModel):
    """Compact episode representation for lists."""
    id: int
    podcast_id: int
    title: str
    status: str
    published_at: Optional[datetime] = None
    has_analysis: bool = False

    class Config:
        from_attributes = True


# Podcast schemas
class PodcastBase(BaseModel):
    title: str
    feed_url: str
    description: Optional[str] = None
    image_url: Optional[str] = None


class PodcastCreate(BaseModel):
    feed_url: str
    auto_analyze: bool = False


class PodcastUpdate(BaseModel):
    auto_analyze: Optional[bool] = None


class Podcast(PodcastBase):
    id: int
    auto_analyze: bool = False
    created_at: datetime
    last_checked_at: Optional[datetime] = None
    episodes: list[Episode] = []

    class Config:
        from_attributes = True


class PodcastSummary(PodcastBase):
    id: int
    auto_analyze: bool = False
    created_at: datetime
    last_checked_at: Optional[datetime] = None
    episode_count: int = 0
    analyzed_count: int = 0

    class Config:
        from_attributes = True


# Analysis request/status schemas
class AnalysisRequest(BaseModel):
    episode_id: int


class AnalysisStatus(BaseModel):
    episode_id: int
    status: str
    message: Optional[str] = None


class BatchAnalysisRequest(BaseModel):
    period: TimePeriod = TimePeriod.LATEST
    start_date: Optional[datetime] = None  # For custom period
    end_date: Optional[datetime] = None  # For custom period
    podcast_ids: Optional[list[int]] = None  # None = all podcasts


class BatchAnalysisStatus(BaseModel):
    total_episodes: int
    pending: int
    processing: int
    completed: int
    failed: int
    episode_ids: list[int]


# Digest schemas
class DigestCreate(BaseModel):
    title: Optional[str] = None
    period: TimePeriod = TimePeriod.WEEK
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    podcast_ids: Optional[list[int]] = None


class DigestBase(BaseModel):
    id: int
    title: str
    period_start: datetime
    period_end: datetime
    podcast_ids: Optional[list[int]] = None
    episode_count: int
    status: str
    processing_step: Optional[str] = None
    processing_detail: Optional[str] = None
    created_at: datetime


class DigestEpisodeInfo(BaseModel):
    """Episode info for digest listing."""
    id: int
    title: str
    podcast_id: Optional[int] = None
    podcast_title: str
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Digest(DigestBase):
    summary: Optional[str] = None
    common_themes: Optional[list[str]] = None
    trends: Optional[list[dict]] = None
    predictions: Optional[list[str]] = None
    recommendations: Optional[list[str]] = None
    key_advice: Optional[list[str]] = None
    action_items: Optional[list[str]] = None
    image_url: Optional[str] = None
    image_prompt: Optional[str] = None
    episodes: Optional[list[DigestEpisodeInfo]] = None

    class Config:
        from_attributes = True


class DigestSummary(DigestBase):
    """Compact digest for listing."""
    class Config:
        from_attributes = True


# Scheduler status
class SchedulerStatus(BaseModel):
    running: bool
    next_run: Optional[datetime] = None
    interval_hours: int = 4
