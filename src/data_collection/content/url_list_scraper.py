"""URL list scraper - fetches content from curated lists of URLs."""

import logging
import yaml
from pathlib import Path
from typing import List

from .base_scraper import BaseScraper, DocPage

logger = logging.getLogger(__name__)


class URLListScraper(BaseScraper):
    """Scrapes documentation pages from curated URL lists."""

    def __init__(self, existing_urls=None):
        """Initialize URL list scraper."""
        super().__init__(existing_urls=existing_urls)

        # Load URL list configs from content directory
        content_dir = Path(__file__).parent
        with open(content_dir / "url_lists.yaml") as f:
            self.url_lists_config = yaml.safe_load(f)

    def scrape_url_list(self, list_config: dict, max_pages: int = None) -> List[DocPage]:
        """Scrape pages from a URL list.

        Args:
            list_config: Configuration dict with 'source_id', 'name', 'urls', etc.
            max_pages: Optional limit on pages to scrape

        Returns:
            List of successfully scraped DocPage objects
        """
        source = list_config["source_id"]
        urls = list_config.get("urls", [])

        if not urls:
            logger.warning(f"⚠️  No URLs found for {source}")
            return []

        logger.info(f"📚 Fetching: {list_config['name']}")

        # Add scrape_method to config for _fetch_page
        list_config = {**list_config, "scrape_method": "url_list"}

        # For curated URL lists, skip URL-level filtering (trust the curation)
        # Only apply exclusion patterns for obvious non-content pages
        filtered_urls = []
        for url in urls:
            self.stats["urls_found"] += 1

            # Check exclusion patterns only (changelog, pricing, etc.)
            should_exclude, reason = self.rag_classifier.should_exclude_url(url)
            if should_exclude:
                self.stats["urls_filtered_out"] += 1
                logger.debug(f"   Excluded: {url} ({reason})")
                continue

            filtered_urls.append(url)

        logger.info(f"   Processing {len(filtered_urls)}/{len(urls)} URLs (excluded {len(urls) - len(filtered_urls)} non-content pages)")

        if not filtered_urls:
            return []

        # Limit if requested
        if max_pages:
            filtered_urls = filtered_urls[:max_pages]

        # Fetch pages (content-level filtering happens in _fetch_page)
        pages = []
        for i, url in enumerate(filtered_urls, 1):
            try:
                if url in self.existing_urls:
                    logger.debug(f"   [{i}/{len(filtered_urls)}] ⏭️  Exists: {url}")
                    continue

                page = self._fetch_page(url, source, sitemap_date=None, site_config=list_config)
                if page:
                    pages.append(page)
                    logger.info(f"   [{i}/{len(filtered_urls)}] ✅ {page.title[:60]}")
                else:
                    logger.debug(f"   [{i}/{len(filtered_urls)}] ⏭️  Skipped: {url}")
            except Exception as e:
                logger.warning(f"   [{i}/{len(filtered_urls)}] ⚠️  Failed: {url} - {e}")
                continue

        logger.info(f"   ✅ Scraped {len(pages)} RAG-relevant pages")
        return pages
