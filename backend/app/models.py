from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base


class Podcast(Base):
    __tablename__ = "podcasts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    feed_url = Column(String, unique=True, nullable=False)
    description = Column(Text)
    image_url = Column(String)
    auto_analyze = Column(Boolean, default=False)  # Auto-analyze new episodes
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_checked_at = Column(DateTime(timezone=True))

    episodes = relationship("Episode", back_populates="podcast", cascade="all, delete-orphan")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(Integer, primary_key=True, index=True)
    podcast_id = Column(Integer, ForeignKey("podcasts.id"), nullable=False)
    guid = Column(String, index=True)  # Unique episode identifier from RSS
    title = Column(String, nullable=False)
    audio_url = Column(String, nullable=False)
    description = Column(Text)
    published_at = Column(DateTime(timezone=True), index=True)
    duration_seconds = Column(Integer)
    status = Column(String, default="pending")  # pending, processing, completed, failed
    processing_step = Column(String)  # Current step: downloading, transcribing, analyzing
    transcript = Column(Text)
    summary = Column(Text)  # Legacy plain text summary
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    podcast = relationship("Podcast", back_populates="episodes")
    analysis = relationship("EpisodeAnalysis", back_populates="episode", uselist=False, cascade="all, delete-orphan")


class EpisodeAnalysis(Base):
    """Structured analysis results for an episode."""
    __tablename__ = "episode_analyses"

    id = Column(Integer, primary_key=True, index=True)
    episode_id = Column(Integer, ForeignKey("episodes.id"), unique=True, nullable=False)

    # Structured content
    overview = Column(Text)  # Brief summary
    key_points = Column(JSON)  # List of main points
    topics = Column(JSON)  # List of topics covered
    themes = Column(JSON)  # Key themes identified
    predictions = Column(JSON)  # Future predictions mentioned
    recommendations = Column(JSON)  # Actionable recommendations
    advice = Column(JSON)  # Key pieces of advice
    notable_quotes = Column(JSON)  # Important quotes

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    episode = relationship("Episode", back_populates="analysis")


class Digest(Base):
    """Cross-episode analysis report for a time period."""
    __tablename__ = "digests"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    period_start = Column(DateTime(timezone=True), nullable=False)
    period_end = Column(DateTime(timezone=True), nullable=False)
    podcast_ids = Column(JSON)  # List of podcast IDs included (null = all)
    episode_count = Column(Integer, default=0)

    # Aggregated analysis
    summary = Column(Text)  # Overall summary of the period
    common_themes = Column(JSON)  # Themes appearing across episodes
    trends = Column(JSON)  # Identified trends
    predictions = Column(JSON)  # Aggregated predictions
    recommendations = Column(JSON)  # Aggregated recommendations
    key_advice = Column(JSON)  # Most important advice
    action_items = Column(JSON)  # What to do with this information

    # Generated image
    image_url = Column(String)  # URL to generated Monet-style image
    image_prompt = Column(Text)  # Prompt used to generate the image

    status = Column(String, default="pending")  # pending, processing, completed, failed
    processing_step = Column(String)  # collecting_episodes, generating_content, generating_image
    processing_detail = Column(String)  # Human-readable detail of current step
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Track which episodes were included
    digest_episodes = relationship("DigestEpisode", back_populates="digest", cascade="all, delete-orphan")


class DigestEpisode(Base):
    """Junction table linking digests to episodes."""
    __tablename__ = "digest_episodes"

    id = Column(Integer, primary_key=True, index=True)
    digest_id = Column(Integer, ForeignKey("digests.id"), nullable=False)
    episode_id = Column(Integer, ForeignKey("episodes.id"), nullable=False)

    digest = relationship("Digest", back_populates="digest_episodes")
    episode = relationship("Episode")
