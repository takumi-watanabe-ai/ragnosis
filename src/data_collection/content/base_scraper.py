"""Base scraper with common HTML extraction and RAG classification logic."""

import hashlib
import logging
import re
import requests
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from bs4 import BeautifulSoup

from .rag_classifier import RAGContentClassifier

logger = logging.getLogger(__name__)


@dataclass
class DocPage:
    """Represents a documentation page."""

    url: str
    title: str
    content: str
    source: str  # e.g., "langchain-docs", "awesome-rag"
    scrape_method: str  # "sitemap", "url_list"

    # Optional fields
    updated_at: Optional[datetime] = None
    excerpt: Optional[str] = None
    section: Optional[str] = None  # e.g., "guides", "api-reference"
    rag_categories: Optional[List[str]] = None  # RAG taxonomy categories

    @property
    def id(self) -> str:
        """Generate unique ID from URL hash."""
        return hashlib.sha256(self.url.encode()).hexdigest()[:16]

    def to_db_row(self) -> dict:
        """Convert to database row format for knowledge_base table."""
        return {
            "id": self.id,
            "url": self.url,
            "title": self.title,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "content": self.content,
            "excerpt": self.excerpt,
            "source": self.source,
            "section": self.section,
            "scrape_method": self.scrape_method,
        }


class BaseScraper:
    """Base scraper with common HTML extraction and classification logic."""

    def __init__(self, existing_urls=None, rag_classifier=None):
        """Initialize base scraper.

        Args:
            existing_urls: Set of URLs already in database
            rag_classifier: Optional RAGContentClassifier instance (creates new if None)
        """
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "RAGnosis/1.0 (RAG Market Intelligence)"
        })
        self.existing_urls = existing_urls or set()

        # Initialize RAG content classifier with lower thresholds
        self.rag_classifier = rag_classifier or RAGContentClassifier(
            min_matches=1,      # Accept pages matching 1+ RAG categories
            api_min_matches=2   # API pages need 2+ categories
        )

        # Stats tracking
        self.stats = {
            "urls_found": 0,
            "urls_filtered_out": 0,
            "pages_fetched": 0,
            "pages_accepted": 0,
        }

    def log_stats(self):
        """Log filtering statistics."""
        logger.info("\n" + "=" * 60)
        logger.info("📊 RAG FILTERING STATISTICS")
        logger.info("=" * 60)
        logger.info(f"   URLs found: {self.stats['urls_found']}")
        logger.info(f"   URLs filtered out (non-RAG): {self.stats['urls_filtered_out']}")
        logger.info(f"   Pages fetched: {self.stats['pages_fetched']}")
        logger.info(f"   Pages accepted (RAG-relevant): {self.stats['pages_accepted']}")

        if self.stats['urls_found'] > 0:
            url_filter_rate = (self.stats['urls_filtered_out'] / self.stats['urls_found']) * 100
            logger.info(f"   URL filter rate: {url_filter_rate:.1f}%")

        logger.info("=" * 60 + "\n")

    def _fetch_page(self, url: str, source: str, sitemap_date: datetime = None,
                    site_config: dict = None) -> Optional[DocPage]:
        """Fetch and parse documentation page.

        Args:
            url: URL to fetch
            source: Source identifier (e.g., "langchain-docs")
            sitemap_date: Optional date from sitemap
            site_config: Optional site configuration

        Returns:
            DocPage if successful and RAG-relevant, None otherwise
        """
        try:
            self.stats["pages_fetched"] += 1

            response = self.session.get(url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")

            # Extract title
            title = self._extract_title(soup)
            if not title:
                logger.info(f"   ⏭️  No title found: {url}")
                return None

            # Extract content
            content = self._extract_content(soup, site_config)
            if not content or len(content.strip()) < 100:
                logger.info(f"   ⏭️  Insufficient content ({len(content.strip()) if content else 0} chars): {title[:50]}")
                return None

            # Classify content for RAG relevance
            classification = self.rag_classifier.classify_content(
                title=title,
                content=content,
                url=url
            )

            # Filter out non-RAG content
            if not classification["is_rag"]:
                logger.info(f"   ⏭️  Content filtered: {title[:50]} - {classification['reason']} (matched {len(classification['categories'])} categories, need {classification['threshold_used']})")
                return None

            # Extract metadata
            updated_at = self._extract_date(soup) or sitemap_date
            excerpt = content[:300] if len(content) > 300 else content
            section = self._extract_section(url, site_config)

            self.stats["pages_accepted"] += 1

            # Determine scrape method from site_config or default
            scrape_method = site_config.get("scrape_method", "unknown") if site_config else "unknown"

            return DocPage(
                url=url,
                title=self._clean_text(title),
                content=self._clean_text(content),
                source=source,
                scrape_method=scrape_method,
                updated_at=updated_at,
                excerpt=self._clean_text(excerpt),
                section=section,
                rag_categories=classification["categories"],
            )

        except Exception as e:
            logger.warning(f"   ⚠️  Failed to fetch {url}: {e}")
            return None

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text)
        text = text.replace("&nbsp;", " ").replace("&amp;", "&")
        return text.strip()

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract title from HTML."""
        # Try og:title meta tag
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            return og_title["content"]

        # Try h1
        h1 = soup.find("h1")
        if h1:
            return h1.get_text()

        # Try title tag
        title_tag = soup.find("title")
        if title_tag:
            return title_tag.get_text()

        return ""

    def _extract_content(self, soup: BeautifulSoup, site_config: dict = None) -> str:
        """Extract documentation content from HTML."""
        # Remove unwanted elements
        for unwanted in soup(["script", "style", "nav", "footer", "header", "aside"]):
            unwanted.decompose()

        # Try to find main content area (documentation-specific selectors)
        content_selectors = [
            "article",
            "main",
            "[role='main']",
            ".markdown",
            ".documentation",
            ".doc-content",
            ".content",
        ]

        content_elem = None
        for selector in content_selectors:
            if selector.startswith("."):
                content_elem = soup.find(class_=lambda x: x and selector[1:] in str(x).lower())
            elif selector.startswith("["):
                # Simple attribute selector
                content_elem = soup.find(attrs={"role": "main"})
            else:
                content_elem = soup.find(selector)

            if content_elem:
                break

        if content_elem:
            content = content_elem.get_text(separator="\n", strip=True)
        else:
            content = soup.get_text(separator="\n", strip=True)

        lines = (line.strip() for line in content.splitlines())
        return "\n".join(line for line in lines if line)

    def _extract_date(self, soup: BeautifulSoup) -> Optional[datetime]:
        """Extract updated date from HTML."""
        date_meta = (
            soup.find("meta", property="article:modified_time")
            or soup.find("meta", property="article:published_time")
            or soup.find("meta", {"name": "last-modified"})
            or soup.find("time")
        )

        if date_meta:
            date_str = date_meta.get("content") or date_meta.get("datetime")
            if date_str:
                try:
                    return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except ValueError:
                    pass

        return None

    def _extract_section(self, url: str, site_config: dict = None) -> Optional[str]:
        """Extract documentation section from URL."""
        if not site_config:
            return None

        # Try to extract section from URL path
        # e.g., "/docs/guides/..." -> "guides"
        section_patterns = site_config.get("section_patterns", {})
        for section, pattern in section_patterns.items():
            if pattern in url:
                return section

        # Fallback: extract first path segment after docs
        parts = url.split("/")
        if "docs" in parts:
            idx = parts.index("docs")
            if idx + 1 < len(parts):
                return parts[idx + 1]

        return None
