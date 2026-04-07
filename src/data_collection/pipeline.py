"""
Daily RAG data pipeline - fetches HuggingFace models and GitHub repos.
Note: Google Trends updates monthly via separate workflow.
Run 'make embed' separately to create vector embeddings.
"""

import logging
from datetime import date
from supabase import create_client

from .hf_fetcher import HFModelFetcher
from .github_fetcher import GitHubFetcher
from .config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """Run the complete data pipeline."""
    logger.info("=" * 60)
    logger.info("🚀 STARTING RAG DATA PIPELINE (Tag-Driven)")
    logger.info("=" * 60)

    # Get credentials from centralized config
    try:
        supabase_url, supabase_key = config.get_supabase_credentials()
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        return

    hf_token = config.huggingface_api_key
    gh_token = config.github_token

    supabase = create_client(supabase_url, supabase_key)
    snapshot_date = date.today().isoformat()

    # ========================================
    # STEP 1: Fetch HuggingFace Models (Tag-Driven)
    # ========================================
    logger.info("\n📥 STEP 1: Fetching HuggingFace models (tag-driven)...")
    hf_fetcher = HFModelFetcher(api_token=hf_token, supabase_client=supabase)
    
    # Use targeted tag-based search
    models = hf_fetcher.fetch_by_tags(
        max_per_tag=50,
        min_downloads=100  # Quality threshold
    )
    
    # All models from tag search are RAG-related (filtered during fetch)
    logger.info(f"   Found {len(models)} RAG models via targeted search")

    if models:
        # Note: fetch_by_tags() already checked _has_data_for_today()
        # We only reach here if today's snapshot doesn't exist yet
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
                "tags": m.tags,
                "rag_categories": m.rag_categories,
                "url": m.url,
                "last_updated": m.last_updated,
            }
            for m in models
        ]

        # Strategy: For existing entities, delete old snapshots and insert fresh one
        # For new entities, just insert. This ensures one row per entity.
        model_ids = [m.id for m in models]

        # Delete ANY existing snapshots for these entities (in batches to avoid URI too long)
        batch_size = 50
        total_deleted = 0
        for i in range(0, len(model_ids), batch_size):
            batch = model_ids[i:i + batch_size]
            deleted = supabase.table("hf_models").delete().in_("id", batch).execute()
            total_deleted += len(deleted.data) if deleted.data else 0
        logger.info(f"   🗑️  Deleted {total_deleted} old snapshots")

        # Insert fresh snapshots with today's date
        # No conflict possible since we just deleted all existing rows for these IDs
        supabase.table("hf_models").insert(rows).execute()
        logger.info(f"   ✅ Inserted {len(rows)} models for {snapshot_date}")

    # ========================================
    # STEP 2: Fetch GitHub Repos (Topic-Driven)
    # ========================================
    logger.info("\n📥 STEP 2: Fetching GitHub repos (topic-driven)...")
    gh_fetcher = GitHubFetcher(api_token=gh_token, supabase_client=supabase)
    
    # Use targeted topic-based search with quality filters
    repos = gh_fetcher.fetch_by_topics(
        max_per_topic=10,
        min_stars=500,  # Quality threshold
        min_months_since_update=12  # Only repos updated in last 12 months
    )
    
    # All repos from topic search are RAG-related (filtered during fetch)
    logger.info(f"   Found {len(repos)} RAG repos via targeted search")

    if repos:
        rows = [
            {
                "id": r.id,
                "snapshot_date": snapshot_date,
                "repo_name": r.repo_name,
                "owner": r.owner,
                "stars": r.stars,
                "forks": r.forks,
                "watchers": r.watchers,
                "language": r.language,
                "topics": r.topics,
                "rag_categories": r.rag_categories,
                "ranking_position": r.ranking_position,
                "url": r.url,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
            }
            for r in repos
        ]

        # Strategy: For existing entities, delete old snapshots and insert fresh one
        # For new entities, just insert. This ensures one row per entity.
        repo_ids = [r.id for r in repos]

        # Delete ANY existing snapshots for these entities (in batches to avoid URI too long)
        batch_size = 50
        total_deleted = 0
        for i in range(0, len(repo_ids), batch_size):
            batch = repo_ids[i:i + batch_size]
            deleted = supabase.table("github_repos").delete().in_("id", batch).execute()
            total_deleted += len(deleted.data) if deleted.data else 0
        logger.info(f"   🗑️  Deleted {total_deleted} old snapshots")

        # Insert fresh snapshots with today's date
        # No conflict possible since we just deleted all existing rows for these IDs
        supabase.table("github_repos").insert(rows).execute()
        logger.info(f"   ✅ Inserted {len(rows)} repos for {snapshot_date}")

    # ========================================
    # Summary
    # ========================================
    logger.info("\n" + "=" * 60)
    logger.info("✅ TAG-DRIVEN DATA COLLECTION COMPLETE")
    logger.info("=" * 60)
    logger.info(f"   📊 HF Models: {len(models)}")
    logger.info(f"   📊 GitHub Repos: {len(repos)}")
    logger.info("=" * 60)
    logger.info("💡 Benefits of tag-driven approach:")
    logger.info("   • Captures high-quality low-download models")
    logger.info("   • Better coverage of specialized tools (rerankers)")
    logger.info("   • More consistent category distribution")
    logger.info("=" * 60)
    logger.info("💡 Next steps:")
    logger.info("   1. Run 'make embed' to create vector embeddings")
    logger.info("   2. Google Trends updates monthly via GitHub Actions")
    logger.info("=" * 60 + "\n")


if __name__ == "__main__":
    main()
