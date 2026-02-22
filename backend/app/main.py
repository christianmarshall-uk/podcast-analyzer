import logging
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import engine, Base, get_db, SessionLocal
from .routers import podcasts_router, analysis_router, digests_router
from .services.scheduler import get_scheduler
from .services.feed_parser import FeedParser
from . import models, schemas

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create database tables
Base.metadata.create_all(bind=engine)


async def refresh_all_feeds():
    """Refresh all podcast feeds to check for new episodes."""
    logger.info("Starting scheduled feed refresh")
    db = SessionLocal()
    try:
        podcasts = db.query(models.Podcast).all()
        parser = FeedParser()

        for podcast in podcasts:
            try:
                parsed = parser.parse(podcast.feed_url)

                # Get existing episode GUIDs
                existing_guids = set(
                    ep.guid for ep in db.query(models.Episode).filter(
                        models.Episode.podcast_id == podcast.id
                    ).all() if ep.guid
                )

                # Add new episodes
                new_count = 0
                for ep in parsed.episodes:
                    if ep.guid and ep.guid in existing_guids:
                        continue

                    episode = models.Episode(
                        podcast_id=podcast.id,
                        title=ep.title,
                        audio_url=ep.audio_url,
                        guid=ep.guid,
                        description=ep.description,
                        published_at=ep.published_at,
                        duration_seconds=ep.duration_seconds
                    )
                    db.add(episode)
                    new_count += 1

                podcast.last_checked_at = datetime.utcnow()
                db.commit()

                if new_count > 0:
                    logger.info(f"Added {new_count} new episodes for {podcast.title}")

            except Exception as e:
                logger.error(f"Failed to refresh {podcast.title}: {e}")
                continue

        logger.info("Feed refresh completed")

    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management."""
    # Startup
    scheduler = get_scheduler()
    scheduler.set_refresh_callback(refresh_all_feeds)
    scheduler.start()
    scheduler.schedule_feed_refresh(interval_hours=4)
    logger.info("Application started, scheduler running")

    yield

    # Shutdown
    scheduler.stop()
    logger.info("Application shutdown complete")


app = FastAPI(
    title="Podcast Analyzer API",
    description="API for analyzing podcasts - transcription, summarization, and cross-episode insights",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(podcasts_router)
app.include_router(analysis_router)
app.include_router(digests_router)


@app.get("/")
async def root():
    return {"message": "Podcast Analyzer API", "version": "2.0.0", "docs": "/docs"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/api/scheduler/status", response_model=schemas.SchedulerStatus)
async def get_scheduler_status():
    """Get the current scheduler status."""
    scheduler = get_scheduler()
    return schemas.SchedulerStatus(
        running=scheduler.is_running,
        next_run=scheduler.get_next_run_time(),
        interval_hours=scheduler.interval_hours
    )


@app.post("/api/scheduler/refresh")
async def trigger_refresh():
    """Manually trigger a feed refresh."""
    await refresh_all_feeds()
    return {"message": "Feed refresh completed"}
