"""
Documentation scraping pipeline - scrapes official RAG documentation sites.
"""

import logging
from supabase import create_client

from .doc_scraper import DocScraper
from .url_list_scraper import URLListScraper
from ..config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """Scrape documentation pages and store in database."""
    logger.info("=" * 60)
    logger.info("📚 DOCUMENTATION SCRAPING")
    logger.info("=" * 60)

    # Get credentials from centralized config
    try:
        supabase_url, supabase_key = config.get_supabase_credentials()
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        return

    supabase = create_client(supabase_url, supabase_key)

    # Get existing URLs to avoid duplicates
    logger.info("\n📥 Fetching existing documentation URLs...")
    try:
        response = supabase.table("knowledge_base").select("url").execute()
        existing_urls = {row["url"] for row in response.data} if response.data else set()
        logger.info(f"   Found {len(existing_urls)} existing pages")
    except Exception as e:
        logger.warning(f"   ⚠️  Failed to fetch existing URLs: {e}")
        existing_urls = set()

    # Initialize scrapers
    sitemap_scraper = DocScraper(existing_urls=existing_urls)
    url_list_scraper = URLListScraper(existing_urls=existing_urls)

    # Scrape both sitemaps and URL lists
    all_pages = []
    max_pages = 200  # Limit pages per source

    # Scrape sitemap-based sources
    sitemap_sources = sitemap_scraper.docs_config
    total_sitemap_sites = len([s for s in sitemap_sources.values() if s.get("enabled")])

    if total_sitemap_sites > 0:
        logger.info(f"\n📥 Scraping {total_sitemap_sites} sitemap-based documentation sites...")

        for site_id, site_config in sitemap_sources.items():
            if not site_config.get("enabled"):
                continue

            try:
                pages = sitemap_scraper.scrape_site(site_config, max_pages=max_pages)
                all_pages.extend(pages)
            except Exception as e:
                logger.error(f"   ❌ Failed to scrape {site_id}: {e}")
                continue

    # Scrape URL list sources
    url_list_sources = url_list_scraper.url_lists_config
    total_url_lists = len([l for l in url_list_sources.values() if l.get("enabled")])

    if total_url_lists > 0:
        logger.info(f"\n📥 Scraping {total_url_lists} curated URL lists...")

        for list_id, list_config in url_list_sources.items():
            if not list_config.get("enabled"):
                continue

            try:
                pages = url_list_scraper.scrape_url_list(list_config, max_pages=max_pages)
                all_pages.extend(pages)
            except Exception as e:
                logger.error(f"   ❌ Failed to scrape {list_id}: {e}")
                continue

    # Log combined filtering statistics
    logger.info("\n" + "=" * 60)
    logger.info("📊 COMBINED SCRAPING STATISTICS")
    logger.info("=" * 60)
    logger.info("Sitemap Sources:")
    sitemap_scraper.log_stats()
    logger.info("URL Lists:")
    url_list_scraper.log_stats()

    # Insert pages
    if all_pages:
        logger.info(f"\n💾 Inserting {len(all_pages)} new documentation pages...")
        try:
            rows = [page.to_db_row() for page in all_pages]
            supabase.table("knowledge_base").upsert(rows).execute()
            logger.info(f"   ✅ Inserted {len(rows)} pages")
        except Exception as e:
            logger.error(f"   ❌ Failed to insert pages: {e}")
            raise
    else:
        logger.info("\n   No new pages found")

    logger.info("\n" + "=" * 60)
    logger.info("✅ DOCUMENTATION SCRAPING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"   📊 New RAG-relevant pages: {len(all_pages)}")
    logger.info("=" * 60)
    logger.info("💡 Next: Run 'make embed' to create vector embeddings")
    logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    main()
