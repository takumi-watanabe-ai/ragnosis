"""Documentation scraper - fetches content from official documentation sites."""

import logging
import xml.etree.ElementTree as ET
import yaml
from datetime import datetime
from pathlib import Path
from typing import List

from .base_scraper import BaseScraper, DocPage

logger = logging.getLogger(__name__)


class DocScraper(BaseScraper):
    """Scrapes documentation pages from XML sitemaps."""

    def __init__(self, existing_urls=None):
        """Initialize sitemap-based scraper."""
        super().__init__(existing_urls=existing_urls)

        # Load sitemap configs from content directory
        content_dir = Path(__file__).parent
        with open(content_dir / "docs.yaml") as f:
            self.docs_config = yaml.safe_load(f)

    def scrape_site(self, site_config: dict, max_pages: int = None) -> List[DocPage]:
        """Scrape documentation pages from sitemap."""
        source = site_config["source_id"]
        sitemap_url = site_config.get("sitemap_url")

        if not sitemap_url:
            logger.warning(f"⚠️  No sitemap_url for {source}")
            return []

        logger.info(f"📚 Fetching: {site_config['name']}")

        # Add scrape_method to config for _fetch_page
        site_config = {**site_config, "scrape_method": "sitemap"}

        try:
            page_entries = self._fetch_urls_from_sitemap(sitemap_url, site_config)

            if not page_entries:
                logger.warning(f"   ⚠️  No URLs found")
                return []

            logger.info(f"   Found {len(page_entries)} URLs")

            if max_pages:
                page_entries = page_entries[:max_pages]

            # Track stats for this site
            existing_count = 0
            failed_count = 0
            filtered_count = 0
            
            pages = []
            for i, (url, sitemap_date) in enumerate(page_entries, 1):
                try:
                    if url in self.existing_urls:
                        existing_count += 1
                        logger.debug(f"   [{i}/{len(page_entries)}] ⏭️  Already exists: {url}")
                        continue

                    page = self._fetch_page(url, source, sitemap_date, site_config)
                    if page:
                        pages.append(page)
                        logger.info(f"   [{i}/{len(page_entries)}] ✅ {page.title[:60]}")
                    else:
                        filtered_count += 1
                        # Filtering reason already logged in _fetch_page
                except Exception as e:
                    failed_count += 1
                    logger.warning(f"   [{i}/{len(page_entries)}] ⚠️  Failed: {url} - {e}")
                    continue

            # Summary
            logger.info(f"   ✅ Scraped {len(pages)} new pages")
            if existing_count > 0:
                logger.info(f"   ⏭️  Skipped {existing_count} existing pages")
            if filtered_count > 0:
                logger.info(f"   🔍 Filtered {filtered_count} pages (see details above)")
            if failed_count > 0:
                logger.warning(f"   ⚠️  Failed to fetch {failed_count} pages")
                
            return pages

        except Exception as e:
            logger.error(f"   ❌ Sitemap error: {e}")
            return []


    def _fetch_urls_from_sitemap(self, sitemap_url: str, site_config: dict) -> List[tuple]:
        """Fetch URLs with dates from sitemap XML."""
        try:
            response = self.session.get(sitemap_url, timeout=30)
            response.raise_for_status()

            root = ET.fromstring(response.content)
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

            # Check for sitemap index
            sitemap_nodes = root.findall('.//ns:sitemap/ns:loc', namespace)
            if sitemap_nodes:
                # If there's a specific docs sitemap URL, use it
                docs_sitemap_url = site_config.get("sitemap_docs_url")
                if docs_sitemap_url:
                    return self._fetch_urls_from_sitemap(docs_sitemap_url, site_config)

                # Otherwise, fetch from all sub-sitemaps
                all_entries = []
                for sitemap_node in sitemap_nodes[:5]:  # Limit to first 5 sitemaps
                    sub_url = sitemap_node.text
                    if sub_url:
                        all_entries.extend(self._fetch_urls_from_sitemap(sub_url, site_config))
                return all_entries

            # Extract URLs
            url_entries = root.findall('.//ns:url', namespace)
            all_entries = []

            for entry in url_entries:
                loc = entry.find('ns:loc', namespace)
                lastmod = entry.find('ns:lastmod', namespace)

                if loc is not None and loc.text:
                    url = loc.text
                    date = None
                    if lastmod is not None and lastmod.text:
                        try:
                            date = datetime.fromisoformat(lastmod.text.replace('Z', '+00:00'))
                        except ValueError:
                            pass
                    all_entries.append((url, date))

            # Filter by pattern
            url_pattern = site_config.get("url_pattern")
            if url_pattern:
                exclude = site_config.get("exclude_patterns", [])
                filtered = [
                    (url, date) for url, date in all_entries
                    if url_pattern in url and not any(ex in url for ex in exclude)
                ]
            else:
                filtered = all_entries

            self.stats["urls_found"] += len(filtered)

            # Filter by RAG relevance
            rag_filtered = []
            for url, date in filtered:
                # Check exclusion patterns first
                should_exclude, reason = self.rag_classifier.should_exclude_url(url)
                if should_exclude:
                    self.stats["urls_filtered_out"] += 1
                    continue

                # Check RAG relevance
                is_rag, categories = self.rag_classifier.is_rag_url(url)
                if is_rag:
                    rag_filtered.append((url, date))
                else:
                    self.stats["urls_filtered_out"] += 1

            logger.info(f"   Filtered to {len(rag_filtered)}/{len(filtered)} RAG-relevant URLs")
            return rag_filtered

        except Exception as e:
            logger.error(f"   ❌ Sitemap fetch failed: {e}")
            return []

