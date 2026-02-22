from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List
import random
import re

from ..database import get_db
from .. import models, schemas
from ..services.digest import DigestService

ARTISTS = ["Kandinsky", "Monet", "Picasso", "van Gogh", "Dali", "Klee"]

router = APIRouter(prefix="/api/digests", tags=["digests"])


def get_period_dates(period: schemas.TimePeriod, start_date=None, end_date=None):
    """Calculate date range based on period type."""
    now = datetime.utcnow()

    if period == schemas.TimePeriod.CUSTOM:
        return start_date or (now - timedelta(days=7)), end_date or now

    if period == schemas.TimePeriod.LATEST:
        # For digests, latest means last 24 hours
        return now - timedelta(days=1), now

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

    return now - timedelta(weeks=1), now


def _update_digest_progress(db, digest, step, detail):
    """Update digest progress in DB so frontend can poll it."""
    digest.processing_step = step
    digest.processing_detail = detail
    db.commit()


async def process_digest(digest_id: int, db_session_factory):
    """Background task to generate a digest."""
    db = db_session_factory()
    try:
        digest = db.query(models.Digest).filter(models.Digest.id == digest_id).first()
        if not digest:
            return

        digest.status = "processing"
        _update_digest_progress(db, digest, "collecting_episodes", "Finding analysed episodes...")

        try:
            # Get episodes with completed analysis in the period
            query = db.query(models.Episode).filter(
                models.Episode.status == "completed",
                models.Episode.published_at >= digest.period_start,
                models.Episode.published_at <= digest.period_end
            )

            if digest.podcast_ids:
                query = query.filter(models.Episode.podcast_id.in_(digest.podcast_ids))

            episodes = query.all()
            total = len(episodes)
            _update_digest_progress(db, digest, "collecting_episodes", f"Found {total} episodes, reading analyses...")

            # Prepare episode data with analysis
            episodes_with_analysis = []
            for i, ep in enumerate(episodes):
                if ep.analysis:
                    podcast = db.query(models.Podcast).filter(
                        models.Podcast.id == ep.podcast_id
                    ).first()

                    episodes_with_analysis.append({
                        "title": ep.title,
                        "podcast_title": podcast.title if podcast else "Unknown",
                        "published_at": ep.published_at.isoformat() if ep.published_at else None,
                        "analysis": {
                            "overview": ep.analysis.overview,
                            "key_points": ep.analysis.key_points or [],
                            "themes": ep.analysis.themes or [],
                            "predictions": ep.analysis.predictions or [],
                            "recommendations": ep.analysis.recommendations or [],
                            "advice": ep.analysis.advice or []
                        }
                    })

                    # Track episode in digest
                    digest_episode = models.DigestEpisode(
                        digest_id=digest_id,
                        episode_id=ep.id
                    )
                    db.add(digest_episode)

                    _update_digest_progress(
                        db, digest, "collecting_episodes",
                        f"Reading episode {i+1}/{total}: {ep.title[:40]}..."
                    )

            db.commit()

            if not episodes_with_analysis:
                digest.status = "completed"
                digest.processing_step = None
                digest.processing_detail = None
                digest.summary = "No analyzed episodes found in this time period."
                digest.episode_count = 0
                db.commit()
                return

            # Generate digest via Claude
            ep_count = len(episodes_with_analysis)
            _update_digest_progress(
                db, digest, "generating_content",
                f"Claude is synthesising insights from {ep_count} episodes..."
            )

            digest_service = DigestService()
            result = await digest_service.generate_digest(
                episodes_with_analysis,
                digest.period_start,
                digest.period_end,
                generate_image=True,
                progress_callback=lambda detail: _update_digest_progress(
                    db, digest, "generating_image", detail
                )
            )

            # Update digest with results
            digest.summary = result.summary
            digest.common_themes = result.common_themes
            digest.trends = result.trends
            digest.predictions = result.predictions
            digest.recommendations = result.recommendations
            digest.key_advice = result.key_advice
            digest.action_items = result.action_items
            digest.image_url = result.image_url
            digest.image_prompt = result.image_prompt
            digest.episode_count = ep_count
            digest.status = "completed"
            digest.processing_step = None
            digest.processing_detail = None
            db.commit()

        except Exception as e:
            digest.status = "failed"
            digest.processing_step = None
            digest.processing_detail = None
            digest.summary = f"Error: {str(e)}"
            db.commit()
            raise

    finally:
        db.close()


@router.post("", response_model=schemas.DigestSummary, status_code=status.HTTP_201_CREATED)
async def create_digest(
    request: schemas.DigestCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Create a new digest for a time period."""
    start_date, end_date = get_period_dates(
        request.period, request.start_date, request.end_date
    )

    # Generate title if not provided
    title = request.title
    if not title:
        period_names = {
            schemas.TimePeriod.LATEST: "Latest",
            schemas.TimePeriod.DAY: "Daily",
            schemas.TimePeriod.WEEK: "Weekly",
            schemas.TimePeriod.TWO_WEEKS: "Fortnightly",
            schemas.TimePeriod.THREE_WEEKS: "3-Week",
            schemas.TimePeriod.MONTH: "Monthly",
            schemas.TimePeriod.CUSTOM: "Custom"
        }
        title = f"{period_names.get(request.period, 'Weekly')} Digest - {start_date.strftime('%b %d')} to {end_date.strftime('%b %d, %Y')}"

    # Create digest
    digest = models.Digest(
        title=title,
        period_start=start_date,
        period_end=end_date,
        podcast_ids=request.podcast_ids,
        status="pending"
    )
    db.add(digest)
    db.commit()
    db.refresh(digest)

    # Start background processing
    from ..database import SessionLocal
    background_tasks.add_task(process_digest, digest.id, SessionLocal)

    digest.status = "processing"
    db.commit()
    db.refresh(digest)

    return schemas.DigestSummary(
        id=digest.id,
        title=digest.title,
        period_start=digest.period_start,
        period_end=digest.period_end,
        podcast_ids=digest.podcast_ids,
        episode_count=digest.episode_count,
        status=digest.status,
        processing_step=digest.processing_step,
        processing_detail=digest.processing_detail,
        created_at=digest.created_at
    )


@router.get("", response_model=List[schemas.DigestSummary])
async def list_digests(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    """List all digests."""
    digests = db.query(models.Digest).order_by(
        models.Digest.created_at.desc()
    ).offset(skip).limit(limit).all()

    return [
        schemas.DigestSummary(
            id=d.id,
            title=d.title,
            period_start=d.period_start,
            period_end=d.period_end,
            podcast_ids=d.podcast_ids,
            episode_count=d.episode_count,
            status=d.status,
            processing_step=d.processing_step,
            processing_detail=d.processing_detail,
            created_at=d.created_at
        )
        for d in digests
    ]


@router.get("/{digest_id}", response_model=schemas.Digest)
async def get_digest(digest_id: int, db: Session = Depends(get_db)):
    """Get a digest with full analysis."""
    digest = db.query(models.Digest).filter(models.Digest.id == digest_id).first()

    if not digest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Digest not found"
        )

    # Get episodes included in this digest
    episodes_info = []
    for de in digest.digest_episodes:
        ep = de.episode
        if ep:
            podcast = db.query(models.Podcast).filter(
                models.Podcast.id == ep.podcast_id
            ).first()
            episodes_info.append(schemas.DigestEpisodeInfo(
                id=ep.id,
                title=ep.title,
                podcast_id=ep.podcast_id,
                podcast_title=podcast.title if podcast else "Unknown",
                published_at=ep.published_at
            ))

    # Return digest with episodes
    return schemas.Digest(
        id=digest.id,
        title=digest.title,
        period_start=digest.period_start,
        period_end=digest.period_end,
        podcast_ids=digest.podcast_ids,
        episode_count=digest.episode_count,
        status=digest.status,
        created_at=digest.created_at,
        summary=digest.summary,
        common_themes=digest.common_themes,
        trends=digest.trends,
        predictions=digest.predictions,
        recommendations=digest.recommendations,
        key_advice=digest.key_advice,
        action_items=digest.action_items,
        image_url=digest.image_url,
        image_prompt=digest.image_prompt,
        episodes=episodes_info
    )


@router.post("/{digest_id}/regenerate-image")
async def regenerate_image(digest_id: int, db: Session = Depends(get_db)):
    """Regenerate the digest artwork with a new random artist style."""
    digest = db.query(models.Digest).filter(models.Digest.id == digest_id).first()
    if not digest:
        raise HTTPException(status_code=404, detail="Digest not found")
    if not digest.image_prompt:
        raise HTTPException(status_code=400, detail="No image prompt available")

    new_artist = random.choice(ARTISTS)
    new_prompt = re.sub(r'style of [\w\s]+?[.,]', f'style of {new_artist}.', digest.image_prompt)

    service = DigestService()
    new_url = await service.generate_image_for_prompt(new_prompt)
    if not new_url:
        raise HTTPException(status_code=500, detail="Image generation failed")

    digest.image_url = new_url
    digest.image_prompt = new_prompt
    db.commit()
    return {"image_url": new_url, "image_prompt": new_prompt}


@router.delete("/{digest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_digest(digest_id: int, db: Session = Depends(get_db)):
    """Delete a digest."""
    digest = db.query(models.Digest).filter(models.Digest.id == digest_id).first()

    if not digest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Digest not found"
        )

    db.delete(digest)
    db.commit()
    return None
