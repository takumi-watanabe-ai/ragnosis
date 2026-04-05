"""
Monthly Google Trends pipeline - updates trend data once per month.
Since time_series contains 12 months of data, daily updates are unnecessary.
"""

import logging
from supabase import create_client

from .trends_fetcher import GoogleTrendsFetcher
from .config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """Fetch and upsert Google Trends data."""
    logger.info("=" * 60)
    logger.info("📈 GOOGLE TRENDS MONTHLY UPDATE")
    logger.info("=" * 60)

    # Get credentials from centralized config
    try:
        supabase_url, supabase_key = config.get_supabase_credentials()
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        return

    supabase = create_client(supabase_url, supabase_key)

    # Fetch Google Trends
    logger.info("\n📥 Fetching Google Trends...")
    trends = []
    try:
        trends_fetcher = GoogleTrendsFetcher()
        trends = trends_fetcher.fetch_trends()
        logger.info(f"   Found {len(trends)} trend keywords")

        if trends:
            rows = [
                {
                    "id": t.id,
                    "keyword": t.keyword,
                    "category": t.category,
                    "current_interest": t.current_interest,
                    "avg_interest": t.avg_interest,
                    "peak_interest": t.peak_interest,
                    "time_series": t.time_series,
                    "related_queries": t.related_queries,
                }
                for t in trends
            ]
            supabase.table("google_trends").upsert(rows).execute()
            logger.info(f"   ✅ Upserted {len(rows)} trends (overwrites existing)")
        else:
            logger.warning("   ⚠️  No trends data fetched")
    except Exception as e:
        logger.error(f"   ❌ Google Trends fetch failed: {e}")
        raise

    logger.info("\n" + "=" * 60)
    logger.info("✅ GOOGLE TRENDS UPDATE COMPLETE")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
