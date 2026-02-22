import feedparser
import httpx
from datetime import datetime
from typing import Optional
from dataclasses import dataclass


@dataclass
class ParsedEpisode:
    title: str
    audio_url: str
    guid: Optional[str] = None
    description: Optional[str] = None
    published_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


@dataclass
class ParsedFeed:
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    episodes: list[ParsedEpisode] = None

    def __post_init__(self):
        if self.episodes is None:
            self.episodes = []


class FeedParser:
    @staticmethod
    def parse_duration(duration_str: str) -> Optional[int]:
        """Parse duration string (HH:MM:SS or seconds) to total seconds."""
        if not duration_str:
            return None

        try:
            # Try parsing as integer (seconds)
            return int(duration_str)
        except ValueError:
            pass

        # Try parsing as HH:MM:SS or MM:SS
        parts = duration_str.split(":")
        try:
            if len(parts) == 3:
                hours, minutes, seconds = map(int, parts)
                return hours * 3600 + minutes * 60 + seconds
            elif len(parts) == 2:
                minutes, seconds = map(int, parts)
                return minutes * 60 + seconds
        except ValueError:
            pass

        return None

    @staticmethod
    def parse_published_date(entry) -> Optional[datetime]:
        """Extract published date from feed entry."""
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            return datetime(*entry.published_parsed[:6])
        if hasattr(entry, "updated_parsed") and entry.updated_parsed:
            return datetime(*entry.updated_parsed[:6])
        return None

    @staticmethod
    def extract_audio_url(entry) -> Optional[str]:
        """Extract audio URL from feed entry enclosures or links."""
        # Check enclosures first
        if hasattr(entry, "enclosures"):
            for enclosure in entry.enclosures:
                if enclosure.get("type", "").startswith("audio/"):
                    return enclosure.get("href") or enclosure.get("url")

        # Check links
        if hasattr(entry, "links"):
            for link in entry.links:
                if link.get("type", "").startswith("audio/"):
                    return link.get("href")
                # Also check for common audio extensions
                href = link.get("href", "")
                if any(href.lower().endswith(ext) for ext in [".mp3", ".m4a", ".wav", ".ogg"]):
                    return href

        return None

    def _fetch_feed_content(self, feed_url: str) -> str:
        """Fetch feed content using httpx (handles SSL properly)."""
        with httpx.Client(follow_redirects=True, timeout=30.0) as client:
            response = client.get(feed_url)
            response.raise_for_status()
            return response.text

    def parse(self, feed_url: str) -> ParsedFeed:
        """Parse an RSS feed URL and return structured data."""
        # Fetch content with httpx to avoid SSL issues
        try:
            content = self._fetch_feed_content(feed_url)
            feed = feedparser.parse(content)
        except httpx.HTTPError as e:
            raise ValueError(f"Failed to fetch feed: {str(e)}")

        if feed.bozo and not feed.entries:
            raise ValueError(f"Failed to parse feed: {feed.bozo_exception}")

        # Extract feed metadata
        feed_info = feed.feed
        title = getattr(feed_info, "title", "Unknown Podcast")
        description = getattr(feed_info, "description", None) or getattr(feed_info, "subtitle", None)

        # Extract image URL
        image_url = None
        if hasattr(feed_info, "image") and feed_info.image:
            image_url = getattr(feed_info.image, "href", None)
        if not image_url and hasattr(feed_info, "itunes_image"):
            image_url = feed_info.itunes_image.get("href")

        # Parse episodes
        episodes = []
        for entry in feed.entries:
            audio_url = self.extract_audio_url(entry)
            if not audio_url:
                continue  # Skip entries without audio

            # Get duration from iTunes namespace or other sources
            duration_str = None
            if hasattr(entry, "itunes_duration"):
                duration_str = entry.itunes_duration

            # Get GUID - use id, guid, or fallback to audio_url
            guid = getattr(entry, "id", None) or getattr(entry, "guid", None) or audio_url

            episode = ParsedEpisode(
                title=getattr(entry, "title", "Untitled Episode"),
                audio_url=audio_url,
                guid=guid,
                description=getattr(entry, "description", None) or getattr(entry, "summary", None),
                published_at=self.parse_published_date(entry),
                duration_seconds=self.parse_duration(duration_str)
            )
            episodes.append(episode)

        return ParsedFeed(
            title=title,
            description=description,
            image_url=image_url,
            episodes=episodes
        )
