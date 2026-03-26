"""Base scraper class for blog articles."""

import hashlib
import logging
import re
import yaml
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Set, Optional

logger = logging.getLogger(__name__)


@dataclass
class Article:
    """Represents a blog article."""

    url: str
    title: str
    content: str
    source: str  # e.g., "langchain", "llamaindex"
    scrape_method: str  # "historical" or "rss"

    # Optional fields
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    excerpt: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    rag_topics: List[str] = field(default_factory=list)  # Auto-extracted from content

    @property
    def id(self) -> str:
        """Generate unique ID from URL hash."""
        return hashlib.sha256(self.url.encode()).hexdigest()[:16]

    def to_db_row(self) -> dict:
        """Convert to database row format."""
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "author": self.author,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "content": self.content,
            "excerpt": self.excerpt,
            "source": self.source,
            "tags": self.tags,
            "rag_topics": self.rag_topics,
            "scrape_method": self.scrape_method,
        }


class BaseScraper(ABC):
    """Base class for blog scrapers."""

    def __init__(self, config_dir: Path = None):
        """Initialize scraper with config."""
        if config_dir is None:
            config_dir = Path(__file__).parent.parent / "config"

        # Load configs
        with open(config_dir / "sites.yaml") as f:
            self.sites_config = yaml.safe_load(f)

        with open(config_dir / "filters.yaml") as f:
            self.filters_config = yaml.safe_load(f)

        self.rag_keywords = self.filters_config["rag_keywords"]
        self.skip_keywords = self.filters_config["skip_keywords"]
        self.rag_topics_map = self.filters_config["rag_topics"]

    def is_rag_related(self, title: str, content: str) -> bool:
        """
        Check if article is RAG-related (used for filtering before DB insert).
        Note: is_rag_related is NOT stored in database - we filter at ingestion time.
        """
        text = f"{title} {content}".lower()

        # Skip if contains skip keywords (hiring, jobs, webinars)
        if any(skip in text for skip in self.skip_keywords):
            logger.debug(f"Skipping article (skip keyword): {title[:50]}")
            return False

        # Must contain at least one RAG keyword
        if any(keyword in text for keyword in self.rag_keywords):
            return True

        logger.debug(f"Article not RAG-related: {title[:50]}")
        return False

    def extract_rag_topics(self, title: str, content: str) -> List[str]:
        """Extract RAG topics from article content."""
        text = f"{title} {content}".lower()
        topics = []

        for topic, keywords in self.rag_topics_map.items():
            if any(keyword in text for keyword in keywords):
                topics.append(topic)

        return topics

    def clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        if not text:
            return ""

        # Remove excessive whitespace
        text = re.sub(r"\s+", " ", text)
        # Remove HTML entities
        text = text.replace("&nbsp;", " ").replace("&amp;", "&")
        return text.strip()

    @abstractmethod
    def scrape_site(self, site_config: dict) -> List[Article]:
        """
        Scrape articles from a site.

        Args:
            site_config: Site configuration from sites.yaml

        Returns:
            List of Article objects
        """
        pass
