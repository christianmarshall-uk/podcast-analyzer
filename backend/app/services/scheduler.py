import logging
from datetime import datetime
from typing import Optional, Callable
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .feed_parser import FeedParser


logger = logging.getLogger(__name__)


class SchedulerService:
    """Service for scheduling periodic tasks like RSS feed updates."""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._refresh_callback: Optional[Callable] = None
        self._interval_hours = 4

    def set_refresh_callback(self, callback: Callable):
        """Set the callback function to run when refreshing feeds."""
        self._refresh_callback = callback

    def start(self):
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            logger.info("Scheduler started")

    def stop(self):
        """Stop the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Scheduler stopped")

    def schedule_feed_refresh(self, interval_hours: int = 4):
        """Schedule periodic feed refresh."""
        self._interval_hours = interval_hours

        # Remove existing job if any
        if self.scheduler.get_job("feed_refresh"):
            self.scheduler.remove_job("feed_refresh")

        # Add new job
        self.scheduler.add_job(
            self._run_feed_refresh,
            trigger=IntervalTrigger(hours=interval_hours),
            id="feed_refresh",
            name="Refresh RSS feeds",
            replace_existing=True
        )
        logger.info(f"Scheduled feed refresh every {interval_hours} hours")

    async def _run_feed_refresh(self):
        """Internal method to run the feed refresh."""
        logger.info("Running scheduled feed refresh")
        if self._refresh_callback:
            try:
                await self._refresh_callback()
            except Exception as e:
                logger.error(f"Feed refresh failed: {e}")

    def get_next_run_time(self) -> Optional[datetime]:
        """Get the next scheduled run time."""
        job = self.scheduler.get_job("feed_refresh")
        if job:
            return job.next_run_time
        return None

    @property
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self.scheduler.running

    @property
    def interval_hours(self) -> int:
        """Get the current interval in hours."""
        return self._interval_hours


# Global scheduler instance
_scheduler: Optional[SchedulerService] = None


def get_scheduler() -> SchedulerService:
    """Get or create the global scheduler instance."""
    global _scheduler
    if _scheduler is None:
        _scheduler = SchedulerService()
    return _scheduler
