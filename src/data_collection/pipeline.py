"""
Simple RAG data pipeline - fetches HF/GitHub/Trends and inserts to SQL.
Note: Run 'make embed' separately to create vector embeddings.
"""

import logging
import os
from datetime import date
from dotenv import load_dotenv
from supabase import create_client

from hf_fetcher import HFModelFetcher
from github_fetcher import GitHubFetcher
from trends_fetcher import GoogleTrendsFetcher

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()


def main():
    """Run the complete data pipeline."""
    logger.info("=" * 60)
    logger.info("🚀 STARTING RAG DATA PIPELINE")
    logger.info("=" * 60)

    # Get credentials
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    hf_token = os.getenv("HUGGINGFACE_API_KEY")
    gh_token = os.getenv("GITHUB_TOKEN")

    if not supabase_url or not supabase_key:
        logger.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        return

    supabase = create_client(supabase_url, supabase_key)
    snapshot_date = date.today().isoformat()

    # ========================================
    # STEP 1: Fetch HuggingFace Models
    # ========================================
    logger.info("\n📥 STEP 1: Fetching HuggingFace models...")
    hf_fetcher = HFModelFetcher(api_token=hf_token)
    models = hf_fetcher.fetch_top_models(max_models=200, sort_by="downloads")
    rag_models = [m for m in models if m.is_rag_related]

    logger.info(f"   Found {len(rag_models)} RAG models (out of {len(models)} total)")

    if rag_models:
        rows = [
            {
                "id": m.id,
                "snapshot_date": snapshot_date,
                "model_name": m.model_name,
                "author": m.author,
                "task": m.task,
                "downloads": m.downloads,
                "likes": m.likes,
                "ranking_position": m.ranking_position,
                "is_rag_related": m.is_rag_related,
                "rag_category": m.rag_category,
                "tags": m.tags,
                "description": m.description,
                "url": m.url,
                "last_updated": m.last_updated,
            }
            for m in rag_models
        ]
        supabase.table("hf_models").upsert(rows).execute()
        logger.info(f"   ✅ Inserted {len(rows)} models")

    # ========================================
    # STEP 2: Fetch GitHub Repos
    # ========================================
    logger.info("\n📥 STEP 2: Fetching GitHub repos...")
    gh_fetcher = GitHubFetcher(api_token=gh_token)
    repos = gh_fetcher.fetch_top_repos(max_repos=200)
    rag_repos = [r for r in repos if r.is_rag_related]

    logger.info(f"   Found {len(rag_repos)} RAG repos (out of {len(repos)} total)")

    if rag_repos:
        rows = [
            {
                "id": r.id,
                "snapshot_date": snapshot_date,
                "repo_name": r.repo_name,
                "owner": r.owner,
                "description": r.description,
                "stars": r.stars,
                "forks": r.forks,
                "watchers": r.watchers,
                "language": r.language,
                "topics": r.topics,
                "ranking_position": r.ranking_position,
                "is_rag_related": r.is_rag_related,
                "rag_category": r.rag_category,
                "url": r.url,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in rag_repos
        ]
        supabase.table("github_repos").upsert(rows).execute()
        logger.info(f"   ✅ Inserted {len(rows)} repos")

    # ========================================
    # STEP 3: Fetch Google Trends
    # ========================================
    logger.info("\n📥 STEP 3: Fetching Google Trends...")
    trends = []
    try:
        trends_fetcher = GoogleTrendsFetcher()
        trends = trends_fetcher.fetch_trends()
        logger.info(f"   Found {len(trends)} trend keywords")

        if trends:
            rows = [
                {
                    "id": t.id,
                    "snapshot_date": snapshot_date,
                    "keyword": t.keyword,
                    "category": t.category,
                    "geo": t.geo,
                    "timeframe": t.timeframe,
                    "current_interest": t.current_interest,
                    "avg_interest": t.avg_interest,
                    "peak_interest": t.peak_interest,
                    "trend_direction": t.trend_direction,
                    "time_series": t.time_series,
                    "related_queries": t.related_queries,
                }
                for t in trends
            ]
            supabase.table("google_trends").upsert(rows).execute()
            logger.info(f"   ✅ Inserted {len(rows)} trends")
    except Exception as e:
        logger.warning(f"   ⚠️  Google Trends fetch failed: {e}")
        logger.warning("   Continuing without trends data...")

    # ========================================
    # Summary
    # ========================================
    logger.info("\n" + "=" * 60)
    logger.info("✅ DATA COLLECTION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"   📊 HF Models: {len(rag_models)}")
    logger.info(f"   📊 GitHub Repos: {len(rag_repos)}")
    logger.info(f"   📊 Google Trends: {len(trends)}")
    logger.info("=" * 60)
    logger.info("💡 Next: Run 'make embed' to create vector embeddings")
    logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    main()
