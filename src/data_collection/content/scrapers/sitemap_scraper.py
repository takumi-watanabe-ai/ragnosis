"""Sitemap scraper for historical blog article backfilling."""

import logging
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Set
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper, Article

logger = logging.getLogger(__name__)


class SitemapScraper(BaseScraper):
    """Scrapes blog articles from XML sitemaps (for historical backfilling)."""

    def __init__(self, config_dir=None, existing_urls=None):
        """Initialize sitemap scraper.

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

    def scrape_site(self, site_config: dict, max_articles: int = None) -> List[Article]:
        """
        Scrape articles from sitemap.

        Args:
            site_config: Site configuration from sites.yaml
            max_articles: Maximum articles to scrape (None = all)

        Returns:
            List of Article objects
        """
        source = site_config["source_id"]
        sitemap_url = site_config.get("sitemap_url")

        if not sitemap_url:
            logger.warning(f"⚠️  No sitemap_url configured for {source}")
            return []

        logger.info(f"🗺️  Fetching sitemap: {site_config['name']}")
        logger.info(f"   URL: {sitemap_url}")

        try:
            # Get all article URLs with dates from sitemap
            article_entries = self._fetch_urls_from_sitemap(sitemap_url, site_config)

            if not article_entries:
                logger.warning(f"   ⚠️  No URLs found in sitemap")
                return []

            logger.info(f"   Found {len(article_entries)} URLs in sitemap")

            # Limit if specified
            if max_articles:
                article_entries = article_entries[:max_articles]
                logger.info(f"   Limited to {max_articles} URLs")

            # Fetch and parse articles
            articles = []
            for i, (url, sitemap_date) in enumerate(article_entries, 1):
                try:
                    # Skip if already in database
                    if url in self.existing_urls:
                        logger.debug(f"   [{i}/{len(article_entries)}] ⏭️  Skipping existing: {url}")
                        continue

                    article = self._fetch_article(url, source, sitemap_date)

                    if article:
                        articles.append(article)
                        logger.info(f"   [{i}/{len(article_entries)}] ✅ {article.title[:60]}")
                    else:
                        logger.debug(f"   [{i}/{len(article_entries)}] ⏭️  Filtered: {url}")

                except Exception as e:
                    logger.warning(f"   [{i}/{len(article_entries)}] ⚠️  Failed: {url} - {e}")
                    continue

            logger.info(f"   ✅ Scraped {len(articles)} articles from sitemap")
            return articles

        except Exception as e:
            logger.error(f"   ❌ Failed to process sitemap: {e}")
            return []

    def _fetch_urls_from_sitemap(self, sitemap_url: str, site_config: dict) -> List[tuple]:
        """Fetch and parse URLs with dates from sitemap XML.
        
        Returns:
            List of (url, lastmod_date) tuples
        """
        try:
            response = self.session.get(sitemap_url, timeout=30)
            response.raise_for_status()

            # Parse XML
            root = ET.fromstring(response.content)

            # Check if this is a sitemap index (points to other sitemaps)
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

            # Check for sitemapindex (e.g., LangChain, HuggingFace)
            sitemap_nodes = root.findall('.//ns:sitemap/ns:loc', namespace)

            if sitemap_nodes:
                # This is a sitemap index - fetch the sub-sitemap
                sub_sitemap_url = site_config.get("sitemap_posts_url")

                if sub_sitemap_url:
                    logger.info(f"   📑 Found sitemap index, fetching posts sitemap: {sub_sitemap_url}")
                    return self._fetch_urls_from_sitemap(sub_sitemap_url, site_config)
                else:
                    logger.warning(f"   ⚠️  Sitemap index found but no sitemap_posts_url configured")
                    return []

            # Extract URLs with lastmod dates
            url_entries = root.findall('.//ns:url', namespace)
            all_entries = []
            
            for entry in url_entries:
                loc = entry.find('ns:loc', namespace)
                lastmod = entry.find('ns:lastmod', namespace)
                
                if loc is not None and loc.text:
                    url = loc.text
                    # Parse lastmod date (ISO format)
                    date = None
                    if lastmod is not None and lastmod.text:
                        try:
                            date = datetime.fromisoformat(lastmod.text.replace('Z', '+00:00'))
                        except:
                            pass
                    
                    all_entries.append((url, date))

            # Filter URLs based on site-specific pattern
            url_pattern = site_config.get("url_pattern", "")

            if url_pattern:
                # Filter URLs that match the pattern
                filtered_entries = [
                    (url, date) for url, date in all_entries
                    if url_pattern in url and not self._is_excluded_url(url, site_config)
                ]
                logger.info(f"   Filtered {len(filtered_entries)}/{len(all_entries)} URLs matching pattern '{url_pattern}'")
                return filtered_entries
            else:
                # No pattern - return all URLs
                return all_entries

        except Exception as e:
            logger.error(f"   ❌ Failed to fetch sitemap: {e}")
            return []

    def _is_excluded_url(self, url: str, site_config: dict) -> bool:
        """Check if URL should be excluded (tags, authors, index pages)."""
        exclude_patterns = site_config.get("exclude_patterns", [])

        for pattern in exclude_patterns:
            if pattern in url:
                return True

        return False

    def _fetch_article(self, url: str, source: str, sitemap_date: datetime = None) -> Article:
        """Fetch and parse article from URL.
        
        Args:
            url: Article URL
            source: Source ID (langchain, llamaindex, etc.)
            sitemap_date: Date from sitemap <lastmod> (fallback if HTML has no date)
        """
        try:
            response = self.session.get(url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")

            # Extract title
            title = self._extract_title(soup)
            if not title:
                logger.debug(f"      No title found for {url}")
                return None

            # Early filter on title
            title_lower = title.lower()
            if any(skip in title_lower for skip in self.skip_keywords):
                logger.debug(f"      Skipping (skip keyword in title): {title[:50]}")
                return None

            # Extract content
            content = self._extract_content(soup)
            if not content or len(content.strip()) < 100:
                logger.debug(f"      Insufficient content for {url}")
                return None

            # Check RAG relevance (includes skip keywords check)
            if not self.is_rag_related(title, content):
                return None

            # Extract metadata
            author = self._extract_author(soup)
            published_at = self._extract_date(soup)
            
            # Fallback to sitemap date if no date in HTML
            if not published_at and sitemap_date:
                published_at = sitemap_date

            # Create excerpt
            excerpt = content[:300] if len(content) > 300 else content

            # Extract RAG topics
            rag_topics = self.extract_rag_topics(title, content)

            return Article(
                url=url,
                title=self.clean_text(title),
                content=self.clean_text(content),
                source=source,
                scrape_method="sitemap",
                author=author,
                published_at=published_at,
                excerpt=self.clean_text(excerpt),
                tags=[],
                rag_topics=rag_topics,
            )

        except Exception as e:
            logger.debug(f"      Failed to fetch article: {e}")
            return None

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract article title from HTML."""
        # Try multiple selectors
        title = None

        # Try <title> tag
        title_tag = soup.find("title")
        if title_tag:
            title = title_tag.get_text()

        # Try og:title meta tag
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"]

        # Try h1
        h1 = soup.find("h1")
        if h1:
            title = h1.get_text()

        return title.strip() if title else ""

    def _extract_content(self, soup: BeautifulSoup) -> str:
        """Extract article content from HTML."""
        # Remove unwanted elements
        for unwanted in soup(["script", "style", "nav", "footer", "header", "aside"]):
            unwanted.decompose()

        # Try to find main content area
        article = (
            soup.find("article")
            or soup.find("main")
            or soup.find(class_=lambda x: x and "content" in str(x).lower())
        )

        if article:
            content = article.get_text(separator="\n", strip=True)
        else:
            # Fallback to body
            content = soup.get_text(separator="\n", strip=True)

        # Clean up
        lines = (line.strip() for line in content.splitlines())
        content = "\n".join(line for line in lines if line)

        return content

    def _extract_author(self, soup: BeautifulSoup) -> str:
        """Extract author from HTML."""
        # Try meta tag
        author_meta = soup.find("meta", {"name": "author"}) or soup.find("meta", property="article:author")
        if author_meta and author_meta.get("content"):
            return author_meta["content"]

        # Try common author selectors
        author_elem = (
            soup.find(class_=lambda x: x and "author" in str(x).lower())
            or soup.find(rel="author")
        )

        if author_elem:
            return author_elem.get_text(strip=True)

        return None

    def _extract_date(self, soup: BeautifulSoup) -> datetime:
        """Extract published date from HTML."""
        # Try meta tags
        date_meta = (
            soup.find("meta", property="article:published_time")
            or soup.find("meta", {"name": "publish-date"})
            or soup.find("time")
        )

        if date_meta:
            date_str = date_meta.get("content") or date_meta.get("datetime")
            if date_str:
                try:
                    # Try ISO format
                    return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                except:
                    pass

        return None
