"""
Database writer for upserting documents to Supabase.

Handles writing documents with embeddings to the database.
"""

import logging
from typing import List, Dict

from supabase import Client

logger = logging.getLogger(__name__)


class DatabaseWriter:
    """Writes documents to Supabase database."""

    def __init__(self, client: Client, documents_table: str):
        """
        Initialize database writer.

        Args:
            client: Supabase client
            documents_table: Name of documents table
        """
        self.client = client
        self.documents_table = documents_table

    def upsert_documents(self, documents: List[Dict]):
        """
        Upsert documents to unified table.

        Args:
            documents: List of documents with embeddings
        """
        if not documents:
            logger.info("⏭️  No documents to upsert")
            return

        logger.info(
            f"\n⬆️  Upserting {len(documents)} documents to {self.documents_table}..."
        )

        rows = []
        for doc in documents:
            row = {
                "id": doc["id"],
                "name": doc["name"],
                "description": doc.get("description", ""),
                "url": doc["url"],
                "doc_type": doc["doc_type"],
                "topics": doc.get("topics", []),
                "embedding": doc["embedding"],
                "snapshot_date": doc.get("snapshot_date"),
                # Metrics
                "downloads": doc.get("downloads"),
                "stars": doc.get("stars"),
                "likes": doc.get("likes"),
                "forks": doc.get("forks"),
                "ranking_position": doc.get("ranking_position"),
                # Creators
                "author": doc.get("author"),
                "owner": doc.get("owner"),
                # Technical
                "language": doc.get("language"),
                "task": doc.get("task"),
                # Content metadata
                "published_at": doc.get("published_at"),
                "content_source": doc.get("content_source"),
                "scrape_method": doc.get("scrape_method"),
                # Chunking
                "parent_id": doc.get("parent_id"),
                "chunk_index": doc.get("chunk_index", 0),
            }
            rows.append(row)

        # Upsert in batches of 500
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            self.client.table(self.documents_table).upsert(batch).execute()

            if len(rows) > batch_size:
                logger.info(
                    f"  Upserted batch {i // batch_size + 1}/{(len(rows) + batch_size - 1) // batch_size}"
                )

        logger.info(f"✅ Successfully upserted {len(rows)} documents")

    def update_metadata_only(self, documents: List[Dict]):
        """
        Update only metadata fields (no embedding regeneration).

        For documents that already exist - we just update frequently-changing metadata
        like stars, likes, downloads, ranking position.

        Args:
            documents: List of documents with metadata updates
        """
        if not documents:
            logger.info("⏭️  No metadata updates needed")
            return

        logger.info(
            f"\n🔄 Updating metadata for {len(documents)} existing documents..."
        )

        updates = []
        for doc in documents:
            # Only update metadata fields (no embedding)
            update = {
                "id": doc["id"],
                "snapshot_date": doc.get("snapshot_date"),
                # Metrics that change frequently
                "downloads": doc.get("downloads"),
                "stars": doc.get("stars"),
                "likes": doc.get("likes"),
                "forks": doc.get("forks"),
                "ranking_position": doc.get("ranking_position"),
            }
            updates.append(update)

        # Update in batches
        batch_size = 500
        for i in range(0, len(updates), batch_size):
            batch = updates[i : i + batch_size]
            self.client.table(self.documents_table).upsert(batch).execute()

            if len(updates) > batch_size:
                logger.info(
                    f"  Updated batch {i // batch_size + 1}/{(len(updates) + batch_size - 1) // batch_size}"
                )

        logger.info(f"✅ Successfully updated {len(updates)} documents")
