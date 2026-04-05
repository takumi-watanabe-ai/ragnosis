"""
Unified vector embedding pipeline orchestrator.

Coordinates all embedding operations following SOLID principles.
"""

import logging
from datetime import date
from supabase import create_client, Client

from .content_fetcher import ContentFetcher
from .text_chunker import TextChunker
from .document_fetcher import DocumentFetcher
from .document_processor import DocumentProcessor
from .embedder import Embedder
from .database_writer import DatabaseWriter
from ..config import config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class UnifiedVectorEmbedder:
    """
    Orchestrates the unified vector embedding pipeline.

    Follows Dependency Inversion Principle - depends on abstractions (injected components).
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        documents_table: str = "documents",
        embedding_model: str = None,
    ):
        """
        Initialize unified vector embedder.

        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase service key
            documents_table: Name of documents table
            embedding_model: Optional embedding model name
        """
        logger.info("🚀 Initializing Unified Vector Embedder...")

        # Use config value if not provided
        if embedding_model is None:
            embedding_model = config.embedding_model_python

        # Initialize Supabase client
        self.client: Client = create_client(supabase_url, supabase_key)
        self.documents_table = documents_table

        # Initialize components (Dependency Injection)
        self.content_fetcher = ContentFetcher()
        self.text_chunker = TextChunker(
            chunk_size=config.chunking_chunk_size,
            overlap=config.chunking_overlap,
        )
        self.document_fetcher = DocumentFetcher(self.client, documents_table)
        self.document_processor = DocumentProcessor(
            content_fetcher=self.content_fetcher,
            text_chunker=self.text_chunker,
            chunking_threshold=config.chunking_threshold,
        )
        self.embedder = Embedder(embedding_model)
        self.database_writer = DatabaseWriter(self.client, documents_table)

        # Verify embedding dimension
        expected_dim = config.embedding_dimensions
        if self.embedder.embedding_dim != expected_dim:
            raise ValueError(
                f"Embedding dimension mismatch: got {self.embedder.embedding_dim}, "
                f"expected {expected_dim}"
            )

        logger.info(f"✅ Unified vector embedder initialized")

    def run_pipeline(self, snapshot_date: str = None):
        """
        Run the complete unified embedding pipeline.

        Steps:
        1. Get existing URLs (avoid duplicates)
        2. Fetch models, repos, articles from database
        3. Prepare documents (fetch content, chunk if needed)
        4. Generate embeddings for new documents
        5. Upsert new documents with embeddings
        6. Update metadata for existing documents

        Args:
            snapshot_date: Optional snapshot date (ISO format). Defaults to today.
        """
        if snapshot_date is None:
            snapshot_date = date.today().isoformat()

        logger.info("=" * 60)
        logger.info("🚀 UNIFIED VECTOR EMBEDDING PIPELINE")
        logger.info(f"📅 Snapshot date: {snapshot_date}")
        logger.info("=" * 60)

        # Step 1: Fetch source data from database
        models = self.document_fetcher.fetch_models_from_sql(snapshot_date)
        repos = self.document_fetcher.fetch_repos_from_sql(snapshot_date)
        articles = self.document_fetcher.fetch_articles_from_sql()

        # Step 2: Collect all URLs and filter for new ones (server-side)
        all_urls = []
        all_urls.extend([m.get('url') for m in models if m.get('url')])
        all_urls.extend([r.get('url') for r in repos if r.get('url')])
        all_urls.extend([a.get('url') for a in articles if a.get('url')])

        new_urls = self.document_fetcher.filter_new_urls(all_urls)

        # Step 3: Prepare documents (fetch content for new URLs, update metadata for existing)
        new_documents, existing_documents = self.document_processor.prepare_documents(
            models=models,
            repos=repos,
            articles=articles,
            new_urls=new_urls,
            hf_token=config.huggingface_api_key,
            github_token=config.github_token,
        )

        # Step 4: Generate embeddings for new documents
        new_documents_with_embeddings = self.embedder.generate_embeddings(
            new_documents, batch_size=config.embedding_batch_size
        )

        # Step 5: Upsert new documents with embeddings
        self.database_writer.upsert_documents(new_documents_with_embeddings)

        # Step 6: Update metadata for existing documents
        self.database_writer.update_metadata_only(existing_documents)

        logger.info("=" * 60)
        logger.info("✅ PIPELINE COMPLETE")
        logger.info("=" * 60)


def main():
    """Main entry point for unified vector embedding pipeline."""
    # Get credentials from centralized config
    try:
        supabase_url, supabase_key = config.get_supabase_credentials()
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        return

    # Initialize and run pipeline
    embedder = UnifiedVectorEmbedder(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        documents_table=config.supabase_table,
    )

    # Run pipeline with today's snapshot date
    embedder.run_pipeline()


if __name__ == "__main__":
    main()
