"""
Blog scraping orchestrator - manages sitemap scraping workflows.
"""

import logging
import os
import yaml
from pathlib import Path
from typing import List, Set
from dotenv import load_dotenv
from supabase import create_client, Client

from .scrapers import SitemapScraper, Article

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv()


class BlogOrchestrator:
    """Orchestrates blog article scraping and storage."""

    def __init__(self, supabase_url: str, supabase_key: str):
        """Initialize orchestrator."""
        self.client: Client = create_client(supabase_url, supabase_key)

        # Load site configs
        config_dir = Path(__file__).parent / "config"
        with open(config_dir / "sites.yaml") as f:
            self.sites_config = yaml.safe_load(f)

        # Get existing URLs for deduplication
        existing_urls = self.get_existing_urls()

        # Initialize scraper
        self.sitemap_scraper = SitemapScraper(existing_urls=existing_urls)

    def get_existing_urls(self) -> Set[str]:
        """Get all existing article URLs from database."""
        logger.info("🔍 Checking existing articles in database...")

        try:
            response = self.client.table("blog_articles").select("url").execute()
            existing_urls = {row["url"] for row in response.data}

            logger.info(f"   Found {len(existing_urls)} existing articles")
            return existing_urls

        except Exception as e:
            logger.warning(f"⚠️  Could not fetch existing URLs: {e}")
            logger.warning("   Proceeding without deduplication check")
            return set()

    def insert_articles(self, articles: List[Article]):
        """Insert articles into database (skip duplicates)."""
        if not articles:
            logger.info("⏭️  No articles to insert")
            return

        logger.info(f"⬆️  Inserting {len(articles)} articles to database...")

        # Get existing URLs for deduplication
        existing_urls = self.get_existing_urls()

        # Filter out duplicates
        new_articles = [a for a in articles if a.url not in existing_urls]

        if not new_articles:
            logger.info("✅ All articles already exist in database (0 new)")
            return

        logger.info(f"   Inserting {len(new_articles)} new articles (skipped {len(articles) - len(new_articles)} duplicates)")

        # Convert to DB rows
        rows = [article.to_db_row() for article in new_articles]

        # Insert in batches
        batch_size = 50
        inserted_count = 0

        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]

            try:
                self.client.table("blog_articles").insert(batch).execute()
                inserted_count += len(batch)

                if (i // batch_size + 1) % 5 == 0:
                    logger.info(f"   Inserted {inserted_count}/{len(rows)} articles")

            except Exception as e:
                logger.error(f"❌ Failed to insert batch {i // batch_size + 1}: {e}")
                logger.error(f"   Error type: {type(e).__name__}")
                if batch:
                    logger.error(f"   Sample row keys: {list(batch[0].keys())}")
                # Continue with next batch

        logger.info(f"✅ Successfully inserted {inserted_count} articles")

    def scrape_sitemaps(self, site_filter: str = None, max_articles: int = None):
        """
        Run sitemap scraping (fetch ALL historical articles).

        Args:
            site_filter: Optional site ID to scrape only that site
            max_articles: Optional limit per site (None = all, for testing use ~50)
        """
        logger.info("\n" + "=" * 60)
        logger.info("🗺️  SITEMAP SCRAPING (COMPREHENSIVE)")
        logger.info("=" * 60 + "\n")

        total_articles = 0

        # Filter and sort sites by priority
        sites = [
            (name, config)
            for name, config in self.sites_config.items()
            if config.get("enabled", True)
            and config.get("sitemap_url")  # Only sites with sitemap configured
            and (site_filter is None or name == site_filter)
        ]
        sites.sort(key=lambda x: x[1].get("priority", 999))

        for site_name, site_config in sites:
            logger.info(f"\n{'='*60}")
            logger.info(f"🗺️  Sitemap: {site_config['name']}")
            logger.info(f"{'='*60}")

            try:
                # Scrape from sitemap
                articles = self.sitemap_scraper.scrape_site(
                    site_config,
                    max_articles=max_articles
                )

                logger.info(f"✅ Scraped {len(articles)} articles from {site_name} sitemap")

                # Insert immediately (per-site storage)
                if articles:
                    logger.info(f"💾 Storing {len(articles)} articles for {site_name}...")
                    self.insert_articles(articles)
                    total_articles += len(articles)
                else:
                    logger.info(f"⏭️  No new articles to store for {site_name}")

            except Exception as e:
                logger.error(f"❌ Failed to scrape {site_name} sitemap: {e}")
                logger.info(f"   Continuing with next site...")
                continue

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("✅ SITEMAP SCRAPING COMPLETE")
        logger.info("=" * 60)
        logger.info(f"📊 Total articles scraped: {total_articles}")
        logger.info("=" * 60 + "\n")


def main():
    """Entry point for sitemap scraping."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url or not supabase_key:
        logger.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
        return

    orchestrator = BlogOrchestrator(supabase_url, supabase_key)

    # Get optional site filter from env
    site_filter = os.getenv("SITE_FILTER")  # e.g., SITE_FILTER=langchain

    # Get optional limit for testing
    max_articles = os.getenv("MAX_ARTICLES")  # e.g., MAX_ARTICLES=50
    max_articles = int(max_articles) if max_articles else None

    orchestrator.scrape_sitemaps(site_filter=site_filter, max_articles=max_articles)


if __name__ == "__main__":
    main()
