"""RSS feed scraper for daily article monitoring."""

import logging
import feedparser
import requests
from datetime import datetime
from typing import List
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, Article

logger = logging.getLogger(__name__)


class FeedScraper(BaseScraper):
    """Scrapes blog articles from RSS feeds (supports both historical and daily modes)."""

    def __init__(self, config_dir=None, existing_urls=None):
        """Initialize feed scraper.

        Args:
            config_dir: Config directory path
            existing_urls: Set of URLs already in database (for deduplication)
        """
        super().__init__(config_dir)
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "RAGnosis/1.0 (RAG Market Intelligence; +https://github.com/yourusername/ragnosis)"
        })
        self.existing_urls = existing_urls or set()

    def scrape_site(self, site_config: dict, max_articles: int = None, scrape_method: str = "rss") -> List[Article]:
        """
        Scrape articles from RSS feed.

        Args:
            site_config: Site configuration from sites.yaml
            max_articles: Maximum articles to scrape (None = all, for historical)
            scrape_method: "rss" or "historical" (for tracking purposes)

        Returns:
            List of Article objects from the RSS feed
        """
        source = site_config["source_id"]
        rss_url = site_config["rss_url"]

        mode = "historical" if max_articles is None else "daily"
        logger.info(f"📡 Fetching RSS feed ({mode}): {site_config['name']}")
        logger.info(f"   URL: {rss_url}")
        if max_articles:
            logger.info(f"   Limit: {max_articles} articles")

        try:
            # Parse RSS feed
            feed = feedparser.parse(rss_url)

            if feed.bozo:
                logger.warning(f"   ⚠️  RSS feed parsing warning: {feed.bozo_exception}")

            total_entries = len(feed.entries)
            logger.info(f"   Found {total_entries} entries in feed")

            # Limit entries if max_articles specified
            entries_to_process = feed.entries if max_articles is None else feed.entries[:max_articles]

            articles = []
            for entry in entries_to_process:
                try:
                    article = self._parse_feed_entry(entry, source, scrape_method)
                    if article:
                        articles.append(article)
                except Exception as e:
                    logger.warning(f"   ⚠️  Failed to parse entry: {e}")
                    continue

            logger.info(f"   ✅ Scraped {len(articles)} articles from RSS")
            return articles

        except Exception as e:
            logger.error(f"   ❌ Failed to fetch RSS feed: {e}")
            return []

    def _parse_feed_entry(self, entry, source: str, scrape_method: str = "rss") -> Article:
        """Parse a single RSS feed entry with smart content fetching."""
        # Extract basic fields
        url = entry.get("link", "")
        title = entry.get("title", "")

        if not url or not title:
            return None

        # OPTIMIZATION 1: Skip if already in database
        if url in self.existing_urls:
            logger.debug(f"   ⏭️  Skipping existing URL: {title[:50]}")
            return None

        # OPTIMIZATION 2: Early filter on title (cheap check)
        title_lower = title.lower()
        if any(skip in title_lower for skip in self.skip_keywords):
            logger.debug(f"   ⏭️  Skipping (skip keyword in title): {title[:50]}")
            return None

        # Check if title suggests RAG relevance (if not, require content check)
        title_suggests_rag = any(keyword in title_lower for keyword in self.rag_keywords)

        # Get content from RSS (try multiple fields)
        rss_content = ""
        if hasattr(entry, "content") and entry.content:
            rss_content = entry.content[0].value
        elif hasattr(entry, "summary") and entry.summary:
            rss_content = entry.summary
        elif hasattr(entry, "description") and entry.description:
            rss_content = entry.description

        # Clean HTML from RSS content
        rss_content = self._extract_text_from_html(rss_content)
        content_length = len(rss_content.strip()) if rss_content else 0

        # Decide if we need to fetch from URL
        needs_url_fetch = content_length < 500  # Less than 500 chars = insufficient

        if needs_url_fetch:
            # OPTIMIZATION 3: Only fetch URL if title suggests RAG relevance
            if not title_suggests_rag:
                logger.debug(f"   ⏭️  Skipping URL fetch (title not RAG-related): {title[:50]}")
                return None

            logger.info(f"   🌐 Fetching content from URL (RSS: {content_length} chars): {title[:60]}")
            full_content = self._fetch_content_from_url(url)

            if not full_content or len(full_content.strip()) < 50:
                logger.warning(f"   ⚠️  Failed to fetch meaningful content: {title[:50]}")
                return None

            content = full_content
        else:
            content = rss_content

        # Final RAG relevance check with full content (includes skip keywords check)
        if not self.is_rag_related(title, content):
            return None

        # Extract metadata
        author = entry.get("author", None)

        # Parse published date
        published_at = None
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published_at = datetime(*entry.published_parsed[:6])
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            published_at = datetime(*entry.updated_parsed[:6])

        # Extract tags
        tags = []
        if hasattr(entry, "tags"):
            tags = [tag.term for tag in entry.tags]

        # Create excerpt
        excerpt = content[:300] if len(content) > 300 else content

        # Extract RAG topics
        rag_topics = self.extract_rag_topics(title, content)

        return Article(
            url=url,
            title=self.clean_text(title),
            content=self.clean_text(content),
            source=source,
            scrape_method=scrape_method,
            author=author,
            published_at=published_at,
            excerpt=self.clean_text(excerpt),
            tags=tags,
            rag_topics=rag_topics,
        )

    def _extract_text_from_html(self, html: str) -> str:
        """Extract plain text from HTML."""
        if not html:
            return ""

        soup = BeautifulSoup(html, "html.parser")

        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()

        # Get text
        text = soup.get_text()

        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = " ".join(chunk for chunk in chunks if chunk)

        return text

    def _fetch_content_from_url(self, url: str) -> str:
        """Fetch full article content from URL (fallback when RSS content is insufficient)."""
        try:
            response = self.session.get(url, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")

            # Remove unwanted elements
            for unwanted in soup(["script", "style", "nav", "footer", "header", "aside"]):
                unwanted.decompose()

            # Try to find main content area
            article = soup.find("article") or soup.find("main") or soup.find(class_=lambda x: x and "content" in str(x).lower())

            if article:
                content = article.get_text(separator="\n", strip=True)
            else:
                # Fallback to body
                content = soup.get_text(separator="\n", strip=True)

            # Clean up
            lines = (line.strip() for line in content.splitlines())
            content = "\n".join(line for line in lines if line)

            return content

        except Exception as e:
            logger.warning(f"   ⚠️  Failed to fetch URL {url}: {e}")
            return ""
