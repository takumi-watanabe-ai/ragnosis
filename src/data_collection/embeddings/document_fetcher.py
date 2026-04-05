"""
Document fetcher for reading documents from Supabase database.

Responsible for querying models, repos, and articles from the database.
"""

import logging
from typing import List, Dict, Set
from supabase import Client

logger = logging.getLogger(__name__)


class DocumentFetcher:
    """Fetches documents from Supabase database."""

    def __init__(self, client: Client, documents_table: str):
        """
        Initialize document fetcher.

        Args:
            client: Supabase client
            documents_table: Name of documents table
        """
        self.client = client
        self.documents_table = documents_table

    def filter_new_urls(self, urls_to_check: List[str]) -> Set[str]:
        """
        Filter URLs to find which ones are NOT in documents table.

        Performs filtering server-side for efficiency - only transfers URLs being checked
        rather than all existing URLs.

        Args:
            urls_to_check: List of URLs to check (from models, repos, articles)

        Returns:
            Set of URLs that are NEW (not in documents table)
        """
        if not urls_to_check:
            return set()

        logger.info(f"📥 Checking {len(urls_to_check)} URLs against {self.documents_table}...")

        try:
            # Call SQL function to filter server-side
            response = self.client.rpc("filter_new_urls", {"urls_to_check": urls_to_check}).execute()

            # Response.data is array of new URLs (or None if all exist)
            new_urls_array = response.data

            if not new_urls_array:
                logger.info("   All URLs already exist (no new documents to process)")
                return set()

            # Convert to set for fast lookup
            new_urls = {url for url in new_urls_array if url}
            logger.info(f"   Found {len(new_urls)} new URLs ({len(urls_to_check) - len(new_urls)} already exist)")
            return new_urls

        except Exception as e:
            logger.warning(f"   ⚠️ Failed to filter URLs: {e}")
            logger.warning("   Treating all URLs as new...")
            return set(urls_to_check)

    def fetch_models_from_sql(self, snapshot_date: str = None) -> List[Dict]:
        """
        Fetch HF models from SQL table.

        Args:
            snapshot_date: Optional snapshot date filter (ISO format)

        Returns:
            List of model dictionaries
        """
        logger.info("📥 Fetching models from hf_models table...")

        query = self.client.table("hf_models").select("*")
        if snapshot_date:
            query = query.eq("snapshot_date", snapshot_date)

        response = query.execute()
        models = response.data or []

        logger.info(f"   Found {len(models)} models")
        return models

    def fetch_repos_from_sql(self, snapshot_date: str = None) -> List[Dict]:
        """
        Fetch GitHub repos from SQL table.

        Args:
            snapshot_date: Optional snapshot date filter (ISO format)

        Returns:
            List of repo dictionaries
        """
        logger.info("📥 Fetching repos from github_repos table...")

        query = self.client.table("github_repos").select("*")
        if snapshot_date:
            query = query.eq("snapshot_date", snapshot_date)

        response = query.execute()
        repos = response.data or []

        logger.info(f"   Found {len(repos)} repos")
        return repos

    def fetch_articles_from_sql(self) -> List[Dict]:
        """
        Fetch knowledge base articles from SQL table.

        Returns:
            List of article dictionaries
        """
        logger.info("📥 Fetching articles from knowledge_base table...")

        response = self.client.table("knowledge_base").select("*").execute()
        articles = response.data or []

        logger.info(f"   Found {len(articles)} articles")
        return articles
