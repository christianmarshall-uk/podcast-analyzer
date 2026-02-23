from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List

from ..database import get_db
from .. import models, schemas
from ..services.audio import AudioService
from ..services.transcription import TranscriptionService
from ..services.summarizer import SummarizerService

router = APIRouter(prefix="/api", tags=["analysis"])

# Shared Whisper model instance — loaded once to avoid expensive re-initialisation per episode
_transcription_service = None


def get_transcription_service() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service


async def process_episode(episode_id: int, db_session_factory):
    """Background task to process an episode with structured analysis."""
    db = db_session_factory()
    try:
        episode = db.query(models.Episode).filter(models.Episode.id == episode_id).first()
        if not episode:
            return

        episode.status = "processing"
        episode.processing_step = "starting"
        db.commit()

        audio_service = AudioService()
        transcription_service = get_transcription_service()
        summarizer_service = SummarizerService()

        audio_path = None
        try:
            # Download audio
            episode.processing_step = "downloading"
            db.commit()
            audio_path = await audio_service.download_audio(episode.audio_url)

            # Transcribe
            episode.processing_step = "transcribing"
            db.commit()
            transcript = await transcription_service.transcribe(audio_path)
            episode.transcript = transcript
            db.commit()

            # Analyze with structured output
            episode.processing_step = "analyzing"
            db.commit()
            analysis_result = await summarizer_service.analyze(transcript)

            # Store plain text summary for backward compatibility
            episode.summary = analysis_result.raw_summary

            # Store structured analysis
            existing_analysis = db.query(models.EpisodeAnalysis).filter(
                models.EpisodeAnalysis.episode_id == episode_id
            ).first()

            if existing_analysis:
                existing_analysis.overview = analysis_result.overview
                existing_analysis.key_points = analysis_result.key_points
                existing_analysis.topics = analysis_result.topics
                existing_analysis.themes = analysis_result.themes
                existing_analysis.predictions = analysis_result.predictions
                existing_analysis.recommendations = analysis_result.recommendations
                existing_analysis.advice = analysis_result.advice
                existing_analysis.notable_quotes = analysis_result.notable_quotes
            else:
                analysis = models.EpisodeAnalysis(
                    episode_id=episode_id,
                    overview=analysis_result.overview,
                    key_points=analysis_result.key_points,
                    topics=analysis_result.topics,
                    themes=analysis_result.themes,
                    predictions=analysis_result.predictions,
                    recommendations=analysis_result.recommendations,
                    advice=analysis_result.advice,
                    notable_quotes=analysis_result.notable_quotes
                )
                db.add(analysis)

            episode.status = "completed"
            episode.processing_step = None
            db.commit()

        except Exception as e:
            episode.status = "failed"
            episode.processing_step = None
            episode.summary = f"Error: {str(e)}"
            db.commit()
            raise

        finally:
            if audio_path:
                audio_service.cleanup(audio_path)

    finally:
        db.close()


@router.post("/podcasts/{podcast_id}/episodes/{episode_id}/analyze", response_model=schemas.AnalysisStatus)
async def analyze_episode(
    podcast_id: int,
    episode_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start analysis of an episode (transcription + summarization)."""
    episode = db.query(models.Episode).filter(
        models.Episode.id == episode_id,
        models.Episode.podcast_id == podcast_id
    ).first()

    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found"
        )

    if episode.status == "processing":
        return schemas.AnalysisStatus(
            episode_id=episode_id,
            status="processing",
            message="Analysis already in progress"
        )

    if episode.status == "completed" and episode.summary:
        return schemas.AnalysisStatus(
            episode_id=episode_id,
            status="completed",
            message="Analysis already completed"
        )

    # Start background processing
    from ..database import SessionLocal
    background_tasks.add_task(process_episode, episode_id, SessionLocal)

    episode.status = "processing"
    db.commit()

    return schemas.AnalysisStatus(
        episode_id=episode_id,
        status="processing",
        message="Analysis started"
    )


def get_period_dates(period: schemas.TimePeriod, start_date=None, end_date=None):
    """Calculate date range based on period type."""
    now = datetime.utcnow()

    if period == schemas.TimePeriod.LATEST:
        return None, None  # Special handling for latest

    if period == schemas.TimePeriod.CUSTOM:
        return start_date, end_date or now

    if period == schemas.TimePeriod.DAY:
        return now - timedelta(days=1), now

    if period == schemas.TimePeriod.WEEK:
        return now - timedelta(weeks=1), now

    if period == schemas.TimePeriod.TWO_WEEKS:
        return now - timedelta(weeks=2), now

    if period == schemas.TimePeriod.THREE_WEEKS:
        return now - timedelta(weeks=3), now

    if period == schemas.TimePeriod.MONTH:
        return now - timedelta(days=30), now

    return None, None


@router.post("/analysis/batch", response_model=schemas.BatchAnalysisStatus)
async def batch_analyze(
    request: schemas.BatchAnalysisRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start batch analysis of episodes for a time period."""
    start_date, end_date = get_period_dates(
        request.period, request.start_date, request.end_date
    )

    # Build query
    query = db.query(models.Episode)

    if request.podcast_ids:
        query = query.filter(models.Episode.podcast_id.in_(request.podcast_ids))

    if request.period == schemas.TimePeriod.LATEST:
        # Get latest episode per podcast
        from sqlalchemy import func as sql_func
        subquery = db.query(
            models.Episode.podcast_id,
            sql_func.max(models.Episode.published_at).label('max_date')
        ).group_by(models.Episode.podcast_id).subquery()

        query = query.join(
            subquery,
            (models.Episode.podcast_id == subquery.c.podcast_id) &
            (models.Episode.published_at == subquery.c.max_date)
        )
    elif start_date:
        query = query.filter(models.Episode.published_at >= start_date)
        if end_date:
            query = query.filter(models.Episode.published_at <= end_date)

    episodes = query.all()

    # Count by status
    pending = sum(1 for e in episodes if e.status == "pending")
    processing = sum(1 for e in episodes if e.status == "processing")
    completed = sum(1 for e in episodes if e.status == "completed")
    failed = sum(1 for e in episodes if e.status == "failed")

    # Start analysis for pending episodes
    from ..database import SessionLocal
    for episode in episodes:
        if episode.status == "pending":
            episode.status = "processing"
            background_tasks.add_task(process_episode, episode.id, SessionLocal)

    db.commit()

    return schemas.BatchAnalysisStatus(
        total_episodes=len(episodes),
        pending=pending,
        processing=processing + pending,  # Pending are now processing
        completed=completed,
        failed=failed,
        episode_ids=[e.id for e in episodes]
    )


@router.post("/analysis/reset-stuck")
async def reset_stuck_episodes(db: Session = Depends(get_db)):
    """Reset stuck processing and failed episodes back to pending."""
    stuck = db.query(models.Episode).filter(
        models.Episode.status.in_(["processing", "failed"])
    ).all()
    for ep in stuck:
        ep.status = "pending"
        ep.processing_step = None
    db.commit()
    return {"reset": len(stuck)}


@router.get("/episodes/{episode_id}/summary", response_model=schemas.Episode)
async def get_episode_summary(episode_id: int, db: Session = Depends(get_db)):
    """Get the summary for an episode."""
    episode = db.query(models.Episode).filter(models.Episode.id == episode_id).first()

    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found"
        )

    return episode


@router.get("/episodes/{episode_id}/analysis", response_model=schemas.EpisodeAnalysis)
async def get_episode_analysis(episode_id: int, db: Session = Depends(get_db)):
    """Get the structured analysis for an episode."""
    analysis = db.query(models.EpisodeAnalysis).filter(
        models.EpisodeAnalysis.episode_id == episode_id
    ).first()

    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found for this episode"
        )

    return analysis


@router.get("/episodes/{episode_id}/status", response_model=schemas.AnalysisStatus)
async def get_analysis_status(episode_id: int, db: Session = Depends(get_db)):
    """Get the current analysis status for an episode."""
    episode = db.query(models.Episode).filter(models.Episode.id == episode_id).first()

    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found"
        )

    message = None
    if episode.status == "completed":
        message = "Analysis complete"
    elif episode.status == "processing":
        message = "Analysis in progress"
    elif episode.status == "failed":
        message = episode.summary if episode.summary and episode.summary.startswith("Error:") else "Analysis failed"

    return schemas.AnalysisStatus(
        episode_id=episode_id,
        status=episode.status,
        message=message
    )


@router.get("/episodes", response_model=List[schemas.EpisodeCompact])
async def list_episodes(
    period: schemas.TimePeriod = schemas.TimePeriod.WEEK,
    start_date: datetime = None,
    end_date: datetime = None,
    podcast_ids: str = None,  # Comma-separated
    status_filter: str = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List episodes with optional filtering."""
    start, end = get_period_dates(period, start_date, end_date)

    query = db.query(models.Episode)

    if podcast_ids:
        ids = [int(id.strip()) for id in podcast_ids.split(",")]
        query = query.filter(models.Episode.podcast_id.in_(ids))

    if period != schemas.TimePeriod.LATEST and start:
        query = query.filter(models.Episode.published_at >= start)
        if end:
            query = query.filter(models.Episode.published_at <= end)

    if status_filter:
        query = query.filter(models.Episode.status == status_filter)

    episodes = query.order_by(models.Episode.published_at.desc()).offset(skip).limit(limit).all()

    return [
        schemas.EpisodeCompact(
            id=e.id,
            podcast_id=e.podcast_id,
            title=e.title,
            status=e.status,
            published_at=e.published_at,
            has_analysis=e.analysis is not None
        )
        for e in episodes
    ]


@router.get("/analysis/progress")
async def get_analysis_progress(
    episode_ids: str = None,  # Comma-separated episode IDs
    db: Session = Depends(get_db)
):
    """Get progress of episode analysis for real-time updates."""
    query = db.query(models.Episode)

    if episode_ids:
        ids = [int(id.strip()) for id in episode_ids.split(",")]
        query = query.filter(models.Episode.id.in_(ids))
    else:
        # Get all non-pending episodes (processing, completed, failed)
        query = query.filter(models.Episode.status != "pending")

    episodes = query.order_by(models.Episode.id.desc()).limit(50).all()

    # Build progress info
    progress = []
    for ep in episodes:
        progress.append({
            "id": ep.id,
            "podcast_id": ep.podcast_id,
            "title": ep.title[:60] + "..." if len(ep.title) > 60 else ep.title,
            "status": ep.status,
            "step": ep.processing_step,
            "error": ep.summary if ep.status == "failed" and ep.summary and ep.summary.startswith("Error:") else None
        })

    # Count by status
    counts = {
        "pending": sum(1 for p in progress if p["status"] == "pending"),
        "processing": sum(1 for p in progress if p["status"] == "processing"),
        "completed": sum(1 for p in progress if p["status"] == "completed"),
        "failed": sum(1 for p in progress if p["status"] == "failed")
    }

    return {
        "episodes": progress,
        "counts": counts
    }
