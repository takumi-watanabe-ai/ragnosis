"""
Unified vector embedding pipeline for RAGnosis.

Embeds HF models, GitHub repos, and blog articles into a single documents table.
"""

import json
import logging
import os
from datetime import date
from pathlib import Path
from typing import List, Dict, Set
from dotenv import load_dotenv

from supabase import create_client, Client
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Load config for embedding model
CONFIG_PATH = (
    Path(__file__).parent.parent.parent
    / "supabase"
    / "functions"
    / "_shared"
    / "config.json"
)
with open(CONFIG_PATH) as f:
    CONFIG = json.load(f)


class UnifiedVectorEmbedder:
    """Creates and manages vector embeddings for all document types in unified table."""

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        documents_table: str = "documents",
        embedding_model: str = None,
    ):
        """Initialize unified vector embedder."""
        logger.info("🚀 Initializing Unified Vector Embedder...")

        # Use config value if not provided
        if embedding_model is None:
            embedding_model = CONFIG["embedding"]["model_python"]

        # Initialize Supabase client
        self.client: Client = create_client(supabase_url, supabase_key)
        self.documents_table = documents_table

        # Initialize embedding model
        logger.info(f"📦 Loading embedding model: {embedding_model}")
        self.embedder = SentenceTransformer(embedding_model)
        self.embedding_dim = self.embedder.get_sentence_embedding_dimension()
        logger.info(f"   Embedding dimension: {self.embedding_dim}")

        # Verify dimension matches config
        expected_dim = CONFIG["embedding"]["dimensions"]
        if self.embedding_dim != expected_dim:
            raise ValueError(
                f"Embedding dimension mismatch: got {self.embedding_dim}, expected {expected_dim}"
            )

        logger.info(f"✅ Unified vector embedder initialized")

    def _chunk_text(self, text: str, chunk_size: int = 1800, overlap: int = 300) -> List[str]:
        """
        Chunk text into overlapping segments.

        Args:
            text: Text to chunk
            chunk_size: Target chunk size in characters (~450 tokens, leaves room for prefix)
            overlap: Overlap between chunks (16.7% for semantic continuity)

        Returns:
            List of text chunks
        """
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size

            # Try to break at paragraph boundary
            if end < len(text):
                # Look for paragraph break within last 20% of chunk
                search_start = end - int(chunk_size * 0.2)
                para_break = text.rfind('\n\n', search_start, end)

                if para_break != -1:
                    end = para_break + 2  # Include newlines
                else:
                    # Fall back to sentence boundary
                    sent_break = text.rfind('. ', search_start, end)
                    if sent_break != -1:
                        end = sent_break + 2

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            # Move to next chunk with overlap
            start = end - overlap if end < len(text) else end

        return chunks

    def get_existing_ids(self) -> Set[str]:
        """Get all existing IDs from documents table to avoid duplicates."""
        logger.info(f"🔍 Checking existing entries in {self.documents_table}...")

        try:
            response = self.client.table(self.documents_table).select("id").execute()
            existing_ids = {row["id"] for row in response.data}
            logger.info(f"   Found {len(existing_ids)} existing documents")
            return existing_ids

        except Exception as e:
            logger.warning(f"⚠️  Could not fetch IDs: {e}")
            return set()

    def fetch_models_from_sql(self, snapshot_date: str = None) -> List[Dict]:
        """Fetch RAG-related models from time-series table."""
        if snapshot_date is None:
            snapshot_date = date.today().isoformat()

        logger.info(f"📂 Fetching models from hf_models (snapshot_date: {snapshot_date})...")

        try:
            response = (
                self.client.table("hf_models")
                .select("*")
                .eq("snapshot_date", snapshot_date)
                .eq("is_rag_related", True)
                .execute()
            )

            models = response.data
            logger.info(f"   Found {len(models)} RAG-related models")
            return models

        except Exception as e:
            logger.error(f"❌ Failed to fetch models: {e}")
            return []

    def fetch_repos_from_sql(self, snapshot_date: str = None) -> List[Dict]:
        """Fetch RAG-related repos from time-series table."""
        if snapshot_date is None:
            snapshot_date = date.today().isoformat()

        logger.info(f"📂 Fetching repos from github_repos (snapshot_date: {snapshot_date})...")

        try:
            response = (
                self.client.table("github_repos")
                .select("*")
                .eq("snapshot_date", snapshot_date)
                .eq("is_rag_related", True)
                .execute()
            )

            repos = response.data
            logger.info(f"   Found {len(repos)} RAG-related repos")
            return repos

        except Exception as e:
            logger.error(f"❌ Failed to fetch repos: {e}")
            return []

    def fetch_articles_from_sql(self) -> List[Dict]:
        """Fetch blog articles from source table."""
        logger.info(f"📂 Fetching articles from blog_articles...")

        try:
            response = self.client.table("blog_articles").select("*").execute()
            articles = response.data
            logger.info(f"   Found {len(articles)} articles")
            return articles

        except Exception as e:
            logger.error(f"❌ Failed to fetch articles: {e}")
            return []

    def prepare_documents(
        self, models: List[Dict], repos: List[Dict], articles: List[Dict], existing_ids: Set[str]
    ) -> List[Dict]:
        """
        Prepare all documents for embedding, filtering out existing entries.

        Returns list of documents with unified schema.
        """
        logger.info("\n🔄 Preparing documents for embedding...")

        documents = []

        # Process models
        for model in models:
            model_id = model["id"]

            if model_id in existing_ids:
                logger.debug(f"   Skipping existing model: {model_id}")
                continue

            doc = {
                "id": model_id,
                "name": model["model_name"],
                "description": model.get("description", ""),
                "url": model["url"],
                "doc_type": "hf_model",
                "rag_category": model.get("rag_category"),
                "topics": model.get("tags", []),  # HF tags → topics
                # Metadata
                "downloads": model.get("downloads"),
                "likes": model.get("likes"),
                "ranking_position": model.get("ranking_position"),
                "author": model.get("author"),
                "task": model.get("task"),  # NEW: task field
                "snapshot_date": model.get("snapshot_date"),
            }
            documents.append(doc)

        # Process repos
        for repo in repos:
            repo_id = repo["id"]

            if repo_id in existing_ids:
                logger.debug(f"   Skipping existing repo: {repo_id}")
                continue

            doc = {
                "id": repo_id,
                "name": repo["repo_name"],
                "description": repo.get("description", ""),
                "url": repo["url"],
                "doc_type": "github_repo",
                "rag_category": repo.get("rag_category"),
                "topics": repo.get("topics", []),  # GitHub topics
                # Metadata
                "stars": repo.get("stars"),
                "forks": repo.get("forks"),
                "ranking_position": repo.get("ranking_position"),
                "owner": repo.get("owner"),
                "language": repo.get("language"),
                "snapshot_date": repo.get("snapshot_date"),
            }
            documents.append(doc)

        # Process blog articles with conditional chunking
        CHUNK_THRESHOLD = 2000  # Only chunk if exceeds single chunk size

        for article in articles:
            article_id = article["id"]

            if article_id in existing_ids:
                logger.debug(f"   Skipping existing article: {article_id}")
                continue

            full_content = article.get("content", "")
            title = article["title"]

            # Conditional chunking based on content length
            if len(full_content) <= CHUNK_THRESHOLD:
                # Short article: single document
                doc = {
                    "id": article_id,
                    "parent_id": None,
                    "chunk_index": 0,
                    "name": title,
                    "description": full_content,
                    "url": article["url"],
                    "doc_type": "blog_article",
                    "rag_category": None,  # Blogs don't have rag_category
                    "topics": article.get("rag_topics", []),  # rag_topics → topics
                    # Content metadata
                    "published_at": article.get("published_at"),
                    "content_source": article.get("source"),  # source → content_source
                    "scrape_method": article.get("scrape_method"),
                }
                documents.append(doc)
            else:
                # Long article: chunk it
                chunks = self._chunk_text(full_content, chunk_size=1800, overlap=300)
                logger.debug(f"   Chunking article '{title[:50]}' into {len(chunks)} chunks")

                for i, chunk in enumerate(chunks):
                    doc = {
                        "id": f"{article_id}_chunk_{i}",
                        "parent_id": article_id,
                        "chunk_index": i,
                        "name": f"{title} (part {i+1}/{len(chunks)})",
                        "description": chunk,
                        "url": article["url"],
                        "doc_type": "blog_article",
                        "rag_category": None,
                        "topics": article.get("rag_topics", []),
                        # Content metadata
                        "published_at": article.get("published_at"),
                        "content_source": article.get("source"),
                        "scrape_method": article.get("scrape_method"),
                    }
                    documents.append(doc)

        logger.info(f"✅ Prepared {len(documents)} NEW documents for embedding")
        logger.info(
            f"   (Skipped {len(models) + len(repos) + len(articles) - len(documents)} existing entries)"
        )

        return documents

    def generate_embeddings(self, documents: List[Dict]) -> List[Dict]:
        """Generate embeddings for all documents."""
        if not documents:
            logger.info("⏭️  No new documents to embed")
            return []

        logger.info(f"\n🧮 Generating embeddings for {len(documents)} documents...")

        # Combine name + description for embedding
        texts = []
        for doc in documents:
            text = f"Name: {doc['name']}\nDescription: {doc['description']}"
            texts.append(text)

        # Generate embeddings in batches
        batch_size = 32
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = self.embedder.encode(
                batch, show_progress_bar=False, convert_to_numpy=True
            )
            all_embeddings.extend(embeddings)

            if (i // batch_size + 1) % 10 == 0:
                logger.info(f"  Processed {i + len(batch)}/{len(texts)} documents")

        # Attach embeddings to documents
        for doc, embedding in zip(documents, all_embeddings):
            doc["embedding"] = embedding.tolist()

        logger.info(f"✅ Generated {len(all_embeddings)} embeddings")
        return documents

    def upsert_documents(self, documents: List[Dict]):
        """Upsert documents to unified table."""
        if not documents:
            logger.info("⏭️  No documents to upsert")
            return

        logger.info(f"\n⬆️  Upserting {len(documents)} documents to {self.documents_table}...")

        rows = []
        for doc in documents:
            # Create preview text
            description_preview = doc["description"][:300] if doc["description"] else ""
            preview_text = f"{doc['name']}: {description_preview}" if description_preview else doc["name"]

            row = {
                "id": doc["id"],
                "name": doc["name"],
                "description": doc.get("description", ""),
                "url": doc["url"],
                "doc_type": doc["doc_type"],
                "rag_category": doc.get("rag_category"),
                "topics": doc.get("topics", []),
                "text": preview_text,
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

        # Upload in batches
        batch_size = 100
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]

            try:
                self.client.table(self.documents_table).upsert(batch).execute()

                if (i // batch_size + 1) % 5 == 0:
                    logger.info(f"  Uploaded {i + len(batch)}/{len(rows)} documents")

            except Exception as e:
                logger.error(f"❌ Failed to upload batch {i // batch_size + 1}: {e}")
                # Continue with next batch

        logger.info(f"✅ Successfully upserted {len(rows)} documents")

    def run_pipeline(self, snapshot_date: str = None):
        """
        Run the complete unified embedding pipeline.

        Workflow:
        1. Fetch RAG-related models/repos from time-series tables
        2. Fetch blog articles from source table
        3. Check existing IDs in documents table
        4. Filter out duplicates
        5. Generate embeddings for NEW documents only
        6. Upsert to unified documents table
        """
        logger.info("\n" + "=" * 60)
        logger.info("🚀 STARTING UNIFIED VECTOR EMBEDDING PIPELINE")
        logger.info("=" * 60 + "\n")

        if snapshot_date is None:
            snapshot_date = date.today().isoformat()

        try:
            # Step 1: Get existing IDs from documents table
            existing_ids = self.get_existing_ids()

            # Step 2: Fetch data from source tables
            logger.info(f"\n📂 STEP 1: Fetching data from source tables (date: {snapshot_date})...")
            models = self.fetch_models_from_sql(snapshot_date)
            repos = self.fetch_repos_from_sql(snapshot_date)
            articles = self.fetch_articles_from_sql()

            # Step 3: Prepare documents (filter out existing)
            logger.info("\n🔄 STEP 2: Preparing documents...")
            documents = self.prepare_documents(models, repos, articles, existing_ids)

            if not documents:
                logger.info("\n✅ No new documents to embed (all entries already exist)")
                logger.info("=" * 60 + "\n")
                return

            # Step 4: Generate embeddings
            logger.info("\n🧮 STEP 3: Generating embeddings...")
            documents_with_embeddings = self.generate_embeddings(documents)

            # Step 5: Upsert to documents table
            logger.info("\n⬆️  STEP 4: Upserting to documents table...")
            self.upsert_documents(documents_with_embeddings)

            # Success summary
            logger.info("\n" + "=" * 60)
            logger.info("✅ UNIFIED VECTOR EMBEDDING PIPELINE COMPLETED")
            logger.info("=" * 60)
            logger.info(f"📊 Summary:")
            logger.info(
                f"   - Processed {len(models)} models + {len(repos)} repos + {len(articles)} articles"
            )
            logger.info(f"   - Created {len(documents_with_embeddings)} new embeddings")
            logger.info(
                f"   - Skipped {len(models) + len(repos) + len(articles) - len(documents_with_embeddings)} existing entries"
            )
            logger.info(f"   - Total in documents table: {len(existing_ids) + len(documents_with_embeddings)}")
            logger.info("=" * 60 + "\n")

        except Exception as e:
            logger.error(f"\n❌ Pipeline failed: {e}")
            raise


def main():
    """Main entry point for unified vector embedding pipeline."""
    # Load environment variables
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    documents_table = os.getenv("SUPABASE_TABLE", "documents")

    if not supabase_url or not supabase_key:
        logger.error("❌ Missing Supabase credentials in .env file")
        logger.error("   Please set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return

    # Initialize and run pipeline
    embedder = UnifiedVectorEmbedder(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        documents_table=documents_table,
    )

    # Run for today's snapshot (or specify a date)
    embedder.run_pipeline()


if __name__ == "__main__":
    main()
