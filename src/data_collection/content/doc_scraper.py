"""Documentation scraper - fetches content from official documentation sites."""

import hashlib
import logging
import re
import requests
import xml.etree.ElementTree as ET
import yaml
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


@dataclass
class DocPage:
    """Represents a documentation page."""

    url: str
    title: str
    content: str
    source: str  # e.g., "langchain-docs", "llamaindex-docs"
    scrape_method: str  # "sitemap"

    # Optional fields
    updated_at: Optional[datetime] = None
    excerpt: Optional[str] = None
    section: Optional[str] = None  # e.g., "guides", "api-reference"

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
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "content": self.content,
            "excerpt": self.excerpt,
            "source": self.source,
            "section": self.section,
            "scrape_method": self.scrape_method,
        }


class DocScraper:
    """Scrapes documentation pages from XML sitemaps."""

    def __init__(self, existing_urls=None):
        """Initialize scraper."""
        # Load configs from content directory
        content_dir = Path(__file__).parent

        with open(content_dir / "docs.yaml") as f:
            self.docs_config = yaml.safe_load(f)

        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "RAGnosis/1.0 (RAG Market Intelligence)"
        })
        self.existing_urls = existing_urls or set()

    def scrape_site(self, site_config: dict, max_pages: int = None) -> List[DocPage]:
        """Scrape documentation pages from sitemap."""
        source = site_config["source_id"]
        sitemap_url = site_config.get("sitemap_url")

        if not sitemap_url:
            logger.warning(f"⚠️  No sitemap_url for {source}")
            return []

        logger.info(f"📚 Fetching: {site_config['name']}")

        try:
            page_entries = self._fetch_urls_from_sitemap(sitemap_url, site_config)

            if not page_entries:
                logger.warning(f"   ⚠️  No URLs found")
                return []

            logger.info(f"   Found {len(page_entries)} URLs")

            if max_pages:
                page_entries = page_entries[:max_pages]

            pages = []
            for i, (url, sitemap_date) in enumerate(page_entries, 1):
                try:
                    if url in self.existing_urls:
                        continue

                    page = self._fetch_page(url, source, sitemap_date, site_config)
                    if page:
                        pages.append(page)
                        logger.info(f"   [{i}/{len(page_entries)}] ✅ {page.title[:60]}")
                except Exception as e:
                    logger.warning(f"   [{i}/{len(page_entries)}] ⚠️  Failed: {url}")
                    continue

            logger.info(f"   ✅ Scraped {len(pages)} pages")
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
                return filtered

            return all_entries

        except Exception as e:
            logger.error(f"   ❌ Sitemap fetch failed: {e}")
            return []

    def _fetch_page(self, url: str, source: str, sitemap_date: datetime = None,
                    site_config: dict = None) -> Optional[DocPage]:
        """Fetch and parse documentation page."""
        try:
            response = self.session.get(url, timeout=15)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")

            # Extract title
            title = self._extract_title(soup)
            if not title:
                return None

            # Extract content
            content = self._extract_content(soup, site_config)
            if not content or len(content.strip()) < 100:
                return None

            # Extract metadata
            updated_at = self._extract_date(soup) or sitemap_date
            excerpt = content[:300] if len(content) > 300 else content
            section = self._extract_section(url, site_config)

            return DocPage(
                url=url,
                title=self._clean_text(title),
                content=self._clean_text(content),
                source=source,
                scrape_method="sitemap",
                updated_at=updated_at,
                excerpt=self._clean_text(excerpt),
                section=section,
            )

        except Exception:
            return None

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text)
        text = text.replace("&nbsp;", " ").replace("&amp;", "&")
        return text.strip()

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract title."""
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
        """Extract documentation content."""
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
        """Extract updated date."""
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
