from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from typing import List
from datetime import datetime
import httpx
import logging

from ..database import get_db
from .. import models, schemas
from ..services.feed_parser import FeedParser
import re
import random
from ..services.digest import DigestService, ARTISTS, TOPICS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/podcasts", tags=["podcasts"])


async def _resolve_feed_url(url: str) -> str:
    """If given an Apple Podcasts/iTunes URL, resolve it to the actual RSS feed URL."""
    import re
    if 'podcasts.apple.com' not in url and 'itunes.apple.com' not in url:
        return url
    match = re.search(r'/id(\d+)', url)
    if not match:
        return url
    itunes_id = match.group(1)
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                'https://itunes.apple.com/lookup',
                params={'id': itunes_id, 'entity': 'podcast'}
            )
            if resp.status_code == 200:
                results = resp.json().get('results', [])
                if results and results[0].get('feedUrl'):
                    logger.info(f"Resolved Apple Podcasts URL {url} -> {results[0]['feedUrl']}")
                    return results[0]['feedUrl']
        except Exception as e:
            logger.warning(f"Failed to resolve Apple Podcasts URL: {e}")
    return url


@router.post("/feed", response_model=schemas.Podcast, status_code=status.HTTP_201_CREATED)
async def add_podcast_from_feed(feed_request: schemas.PodcastCreate, db: Session = Depends(get_db)):
    """Add a new podcast by parsing its RSS feed URL."""
    resolved_url = await _resolve_feed_url(feed_request.feed_url)

    # Check if podcast already exists
    existing = db.query(models.Podcast).filter(
        models.Podcast.feed_url == resolved_url
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Podcast with this feed URL already exists"
        )

    # Parse the feed
    parser = FeedParser()
    try:
        parsed = parser.parse(resolved_url)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse feed: {str(e)}"
        )

    # Create podcast
    podcast = models.Podcast(
        title=parsed.title,
        feed_url=resolved_url,
        description=parsed.description,
        image_url=parsed.image_url,
        auto_analyze=feed_request.auto_analyze,
        last_checked_at=datetime.utcnow()
    )
    db.add(podcast)
    db.commit()
    db.refresh(podcast)

    # Create episodes
    for ep in parsed.episodes:
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

    db.commit()
    db.refresh(podcast)

    return podcast


@router.get("", response_model=List[schemas.PodcastSummary])
async def list_podcasts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all podcasts."""
    podcasts = db.query(models.Podcast).offset(skip).limit(limit).all()

    result = []
    for podcast in podcasts:
        episode_count = db.query(models.Episode).filter(
            models.Episode.podcast_id == podcast.id
        ).count()

        analyzed_count = db.query(models.Episode).filter(
            models.Episode.podcast_id == podcast.id,
            models.Episode.status == "completed"
        ).count()

        result.append(schemas.PodcastSummary(
            id=podcast.id,
            title=podcast.title,
            feed_url=podcast.feed_url,
            description=podcast.description,
            image_url=podcast.image_url,
            auto_analyze=podcast.auto_analyze,
            created_at=podcast.created_at,
            last_checked_at=podcast.last_checked_at,
            episode_count=episode_count,
            analyzed_count=analyzed_count
        ))

    return result


@router.get("/discover/similar")
async def discover_similar_podcasts(db: Session = Depends(get_db)):
    """Discover podcasts similar to the user's subscriptions via iTunes Search API."""
    podcasts = db.query(models.Podcast).all()
    if not podcasts:
        return []

    existing_feeds = {p.feed_url for p in podcasts}
    seen_ids = set()
    results = []

    async with httpx.AsyncClient(timeout=15.0) as client:
        for podcast in podcasts:
            if len(results) >= 30:
                break

            search_term = podcast.title
            try:
                response = await client.get(
                    "https://itunes.apple.com/search",
                    params={
                        "term": search_term,
                        "media": "podcast",
                        "limit": 15,
                    }
                )
                if response.status_code != 200:
                    continue

                data = response.json()
                for item in data.get("results", []):
                    itunes_id = item.get("collectionId")
                    feed_url = item.get("feedUrl", "")

                    if not feed_url or feed_url in existing_feeds:
                        continue
                    if itunes_id in seen_ids:
                        continue

                    seen_ids.add(itunes_id)
                    results.append({
                        "itunes_id": itunes_id,
                        "title": item.get("collectionName", ""),
                        "artist": item.get("artistName", ""),
                        "image_url": item.get("artworkUrl100", "").replace("100x100", "200x200"),
                        "feed_url": feed_url,
                        "genre": item.get("primaryGenreName", ""),
                        "episode_count": item.get("trackCount", 0),
                        "description": (item.get("collectionName", "") + " by " + item.get("artistName", "")),
                    })

                    if len(results) >= 30:
                        break

            except Exception as e:
                logger.warning(f"iTunes search failed for '{search_term}': {e}")
                continue

    return results


@router.get("/search")
async def search_podcasts(q: str, db: Session = Depends(get_db)):
    """Search podcasts by keyword via iTunes Search API."""
    existing_feeds = {p.feed_url for p in db.query(models.Podcast).all()}
    results = []
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(
                "https://itunes.apple.com/search",
                params={"term": q, "media": "podcast", "limit": 20}
            )
            if resp.status_code == 200:
                for item in resp.json().get("results", []):
                    feed_url = item.get("feedUrl", "")
                    if not feed_url or feed_url in existing_feeds:
                        continue
                    results.append({
                        "itunes_id": item.get("collectionId"),
                        "title": item.get("collectionName", ""),
                        "artist": item.get("artistName", ""),
                        "image_url": item.get("artworkUrl100", "").replace("100x100", "200x200"),
                        "feed_url": feed_url,
                        "genre": item.get("primaryGenreName", ""),
                        "episode_count": item.get("trackCount", 0),
                        "description": "",
                    })
        except Exception as e:
            logger.warning(f"iTunes search failed for '{q}': {e}")
    return results


@router.get("/{podcast_id}", response_model=schemas.Podcast)
async def get_podcast(podcast_id: int, db: Session = Depends(get_db)):
    """Get a podcast with all its episodes."""
    podcast = db.query(models.Podcast).filter(models.Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found"
        )
    return podcast


@router.patch("/{podcast_id}", response_model=schemas.Podcast)
async def update_podcast(podcast_id: int, update: schemas.PodcastUpdate, db: Session = Depends(get_db)):
    """Update podcast settings."""
    podcast = db.query(models.Podcast).filter(models.Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found"
        )

    if update.auto_analyze is not None:
        podcast.auto_analyze = update.auto_analyze

    db.commit()
    db.refresh(podcast)
    return podcast


@router.delete("/{podcast_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_podcast(podcast_id: int, db: Session = Depends(get_db)):
    """Delete a podcast and all its episodes."""
    podcast = db.query(models.Podcast).filter(models.Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found"
        )
    db.delete(podcast)
    db.commit()
    return None


@router.post("/{podcast_id}/generate-artwork")
async def generate_podcast_artwork(podcast_id: int, db: Session = Depends(get_db)):
    """Generate AI artwork for the podcast using a random artist and topic, different from the last."""
    podcast = db.query(models.Podcast).filter(models.Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    # Avoid repeating the last artist
    last_artist = None
    if podcast.ai_image_prompt:
        m = re.search(r'in the style of ([^.]+)\.', podcast.ai_image_prompt)
        if m:
            last_artist = m.group(1).strip()

    available_artists = [a for a in ARTISTS if a[0] != last_artist]
    artist_name, artist_style = random.choice(available_artists)

    # Avoid repeating the last topic
    last_topic = None
    if podcast.ai_image_prompt:
        m = re.search(r'Scene: (.+?)\. No text', podcast.ai_image_prompt, re.DOTALL)
        if m:
            last_topic = m.group(1).strip()

    available_topics = [t for t in TOPICS if t != last_topic]
    topic = random.choice(available_topics)

    prompt = f"Painting in the style of {artist_name}. {artist_style}. Scene: {topic}. No text, no words, no letters."
    logger.info(f"Generating artwork: artist={artist_name}, topic={topic[:60]}...")

    service = DigestService()
    image_url = await service.generate_image_for_prompt(prompt)
    if not image_url:
        raise HTTPException(status_code=500, detail="Image generation failed")

    podcast.ai_image_url = image_url
    podcast.ai_image_prompt = prompt
    db.commit()
    return {"ai_image_url": image_url, "ai_image_prompt": prompt}


@router.post("/{podcast_id}/refresh", response_model=schemas.Podcast)
async def refresh_podcast(podcast_id: int, db: Session = Depends(get_db)):
    """Refresh a podcast feed to check for new episodes."""
    podcast = db.query(models.Podcast).filter(models.Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found"
        )

    # Parse the feed
    parser = FeedParser()
    try:
        parsed = parser.parse(podcast.feed_url)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse feed: {str(e)}"
        )

    # Get existing episode GUIDs
    existing_guids = set(
        ep.guid for ep in db.query(models.Episode).filter(
            models.Episode.podcast_id == podcast_id
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
    db.refresh(podcast)

    return podcast


@router.get("/{podcast_id}/episodes/{episode_id}", response_model=schemas.Episode)
async def get_episode(podcast_id: int, episode_id: int, db: Session = Depends(get_db)):
    """Get a specific episode."""
    episode = db.query(models.Episode).filter(
        models.Episode.id == episode_id,
        models.Episode.podcast_id == podcast_id
    ).first()
    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found"
        )
    return episode
