"""
Documentation scraping pipeline - scrapes official RAG documentation sites.
"""

import logging
import os
from dotenv import load_dotenv
from supabase import create_client

from doc_scraper import DocScraper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()


def main():
    """Scrape documentation pages and store in database."""
    logger.info("=" * 60)
    logger.info("📚 DOCUMENTATION SCRAPING")
    logger.info("=" * 60)

    # Get credentials
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")

    if not supabase_url or not supabase_key:
        logger.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
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

    # Initialize scraper
    scraper = DocScraper(existing_urls=existing_urls)

    # Scrape all enabled sites
    all_pages = []
    total_sites = len([s for s in scraper.docs_config.values() if s.get("enabled")])

    logger.info(f"\n📥 Scraping {total_sites} documentation sites...")

    for site_id, site_config in scraper.docs_config.items():
        if not site_config.get("enabled"):
            continue

        try:
            # Limit pages per site to avoid overwhelming the system
            pages = scraper.scrape_site(site_config, max_pages=200)
            all_pages.extend(pages)
        except Exception as e:
            logger.error(f"   ❌ Failed to scrape {site_id}: {e}")
            continue

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
    logger.info(f"   📊 New pages: {len(all_pages)}")
    logger.info("=" * 60)
    logger.info("💡 Next: Run 'make embed' to create vector embeddings")
    logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    main()
