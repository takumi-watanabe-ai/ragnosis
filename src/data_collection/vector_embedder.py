"""
Unified vector embedding pipeline for RAGnosis.

Embeds HF models, GitHub repos, and blog articles into a single documents table.
"""

import json
import logging
import os
import time
import base64
import re
from datetime import date
from pathlib import Path
from typing import List, Dict, Set, Optional, Tuple
from dotenv import load_dotenv

import requests
from supabase import create_client, Client
from sentence_transformers import SentenceTransformer
from huggingface_hub import ModelCard

from rag_taxonomy import NOISE_PATTERNS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def normalize_tags(tags: List[str]) -> List[str]:
    """Filter out noise tags using unified taxonomy noise patterns."""
    if not tags:
        return []

    # Filter using unified NOISE_PATTERNS from taxonomy
    return [
        tag
        for tag in tags
        if not any(re.match(pattern, tag) for pattern in NOISE_PATTERNS)
    ]


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

        # Load chunking config
        self.chunking_threshold = CONFIG["chunking"]["threshold"]
        self.chunk_size = CONFIG["chunking"]["chunk_size"]
        self.chunk_overlap = CONFIG["chunking"]["overlap"]

    def _extract_description_from_text(self, text: str) -> str:
        """Extract short description from README/model card text (first ~200 chars)."""
        if not text:
            return ""

        # Get first meaningful paragraph (skip headers, yaml frontmatter, empty lines)
        lines = text.split("\n")
        description_lines = []

        for line in lines:
            line = line.strip()
            # Skip markdown headers, yaml frontmatter, empty lines
            if line and not line.startswith("#") and not line.startswith("---"):
                description_lines.append(line)
                # Get first ~200 chars of meaningful content
                if len(" ".join(description_lines)) > 200:
                    break

        if description_lines:
            return " ".join(description_lines)[:500]  # Limit to 500 chars max

        return ""

    def _fetch_hf_model_card(
        self, model_name: str, hf_token: str = None
    ) -> Optional[str]:
        """
        Fetch full model card (README) from HuggingFace.

        Args:
            model_name: HuggingFace model ID (e.g., 'Supabase/gte-small')
            hf_token: Optional HuggingFace token for higher rate limits

        Returns:
            Full model card text or None if fetch fails
        """
        try:
            logger.debug(f"Fetching model card for {model_name}")
            card = ModelCard.load(model_name, token=hf_token)

            if card.text:
                logger.debug(f"  ✓ Fetched {len(card.text)} chars")
                return card.text
            else:
                logger.debug(f"  ⚠️  No card text available")
                return None

        except Exception as e:
            logger.warning(f"  ✗ Failed to fetch model card for {model_name}: {e}")
            return None

    def _fetch_github_readme(
        self, repo_name: str, github_token: str = None
    ) -> Optional[str]:
        """
        Fetch README from GitHub repository.

        Args:
            repo_name: Full repo name (e.g., 'supabase/supabase')
            github_token: Optional GitHub token for higher rate limits

        Returns:
            README content or None if fetch fails
        """
        try:
            logger.debug(f"Fetching README for {repo_name}")

            # Prepare headers
            headers = {
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "RAGnosis/1.0 (search indexing)",
            }
            if github_token:
                headers["Authorization"] = f"token {github_token}"

            # Fetch README
            url = f"https://api.github.com/repos/{repo_name}/readme"
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                content = base64.b64decode(data["content"]).decode("utf-8")
                logger.debug(f"  ✓ Fetched {len(content)} chars")
                return content
            elif response.status_code == 404:
                logger.debug(f"  ⚠️  No README found")
                return None
            else:
                logger.warning(f"  ✗ GitHub API returned {response.status_code}")
                return None

        except Exception as e:
            logger.warning(f"  ✗ Failed to fetch README for {repo_name}: {e}")
            return None

    def _chunk_text(
        self, text: str, chunk_size: int = None, overlap: int = None
    ) -> List[str]:
        """
        Chunk text into overlapping segments.

        Args:
            text: Text to chunk
            chunk_size: Target chunk size in characters (defaults to config)
            overlap: Overlap between chunks (defaults to config)

        Returns:
            List of text chunks
        """
        # Use config defaults if not specified
        if chunk_size is None:
            chunk_size = self.chunk_size
        if overlap is None:
            overlap = self.chunk_overlap
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
                para_break = text.rfind("\n\n", search_start, end)

                if para_break != -1:
                    end = para_break + 2  # Include newlines
                else:
                    # Fall back to sentence boundary
                    sent_break = text.rfind(". ", search_start, end)
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

        logger.info(
            f"📂 Fetching models from hf_models (snapshot_date: {snapshot_date})..."
        )

        try:
            response = (
                self.client.table("hf_models")
                .select("*")
                .eq("snapshot_date", snapshot_date)
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

        logger.info(
            f"📂 Fetching repos from github_repos (snapshot_date: {snapshot_date})..."
        )

        try:
            response = (
                self.client.table("github_repos")
                .select("*")
                .eq("snapshot_date", snapshot_date)
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
        self,
        models: List[Dict],
        repos: List[Dict],
        articles: List[Dict],
        existing_ids: Set[str],
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Prepare documents for embedding and metadata updates.

        Returns:
            (new_documents, existing_documents) where:
            - new_documents: Need README/model card fetch + embedding
            - existing_documents: Only need metadata updates (no embedding)
        """
        logger.info("\n🔄 Preparing documents...")

        new_documents = []
        existing_documents = []
        readme_fetch_count = 0

        # Get API tokens for fetching content
        hf_token = os.getenv("HUGGINGFACE_API_KEY")

        # Process models
        logger.info(f"📝 Processing {len(models)} models...")
        for idx, model in enumerate(models):
            model_id = model["id"]
            model_name = model["model_name"]

            if model_id in existing_ids:
                # Existing model: only update metadata (no README fetch, no embedding)
                doc = {
                    "id": model_id,
                    # Frequently-changing metadata
                    "downloads": model.get("downloads"),
                    "likes": model.get("likes"),
                    "ranking_position": model.get("ranking_position"),
                    "snapshot_date": model.get("snapshot_date"),
                }
                existing_documents.append(doc)
            else:
                # New model: fetch model card and prepare for embedding
                model_card = self._fetch_hf_model_card(model_name, hf_token)
                if model_card:
                    readme_fetch_count += 1

                # Extract description from model card (first ~200 chars)
                description = (
                    self._extract_description_from_text(model_card)
                    if model_card
                    else ""
                )

                # Conditional chunking based on content length
                if model_card and len(model_card) > self.chunking_threshold:
                    # Long model card: chunk it
                    chunks = self._chunk_text(model_card)
                    logger.debug(
                        f"   Chunking model card '{model_name}' into {len(chunks)} chunks"
                    )

                    for i, chunk in enumerate(chunks):
                        doc = {
                            "id": f"{model_id}_chunk_{i}",
                            "parent_id": model_id,
                            "chunk_index": i,
                            "name": f"{model_name} (part {i + 1}/{len(chunks)})",
                            "description": description,
                            "readme_content": chunk,
                            "url": model["url"],
                            "doc_type": "hf_model",
                            "topics": normalize_tags(model.get("tags", [])),
                            # Metadata
                            "downloads": model.get("downloads"),
                            "likes": model.get("likes"),
                            "ranking_position": model.get("ranking_position"),
                            "author": model.get("author"),
                            "task": model.get("task"),
                            "snapshot_date": model.get("snapshot_date"),
                        }
                        new_documents.append(doc)
                else:
                    # Short model card: single document
                    doc = {
                        "id": model_id,
                        "parent_id": None,
                        "chunk_index": 0,
                        "name": model_name,
                        "description": description,
                        "readme_content": model_card,  # Full model card
                        "url": model["url"],
                        "doc_type": "hf_model",
                        "topics": normalize_tags(model.get("tags", [])),
                        # Metadata
                        "downloads": model.get("downloads"),
                        "likes": model.get("likes"),
                        "ranking_position": model.get("ranking_position"),
                        "author": model.get("author"),
                        "task": model.get("task"),
                        "snapshot_date": model.get("snapshot_date"),
                    }
                    new_documents.append(doc)

                # Rate limiting: small delay every 10 requests
                if (idx + 1) % 10 == 0:
                    time.sleep(0.5)

        logger.info(
            f"   ✓ Fetched {readme_fetch_count}/{len([m for m in models if m['id'] not in existing_ids])} model cards for new models"
        )

        # Process repos
        logger.info(f"📝 Processing {len(repos)} repos...")
        github_token = os.getenv("GITHUB_TOKEN")
        readme_fetch_count_repos = 0

        for idx, repo in enumerate(repos):
            repo_id = repo["id"]
            repo_name = repo["repo_name"]

            if repo_id in existing_ids:
                # Existing repo: only update metadata (no README fetch, no embedding)
                doc = {
                    "id": repo_id,
                    # Frequently-changing metadata
                    "stars": repo.get("stars"),
                    "forks": repo.get("forks"),
                    "ranking_position": repo.get("ranking_position"),
                    "snapshot_date": repo.get("snapshot_date"),
                }
                existing_documents.append(doc)
            else:
                # New repo: fetch README and prepare for embedding
                readme = self._fetch_github_readme(repo_name, github_token)
                if readme:
                    readme_fetch_count_repos += 1

                # Extract description from README (first ~200 chars)
                description = (
                    self._extract_description_from_text(readme) if readme else ""
                )

                # Conditional chunking based on content length
                if readme and len(readme) > self.chunking_threshold:
                    # Long README: chunk it
                    chunks = self._chunk_text(readme)
                    logger.debug(
                        f"   Chunking README '{repo_name}' into {len(chunks)} chunks"
                    )

                    for i, chunk in enumerate(chunks):
                        doc = {
                            "id": f"{repo_id}_chunk_{i}",
                            "parent_id": repo_id,
                            "chunk_index": i,
                            "name": f"{repo_name} (part {i + 1}/{len(chunks)})",
                            "description": description,
                            "readme_content": chunk,
                            "url": repo["url"],
                            "doc_type": "github_repo",
                            "topics": normalize_tags(repo.get("topics", [])),
                            # Metadata
                            "stars": repo.get("stars"),
                            "forks": repo.get("forks"),
                            "ranking_position": repo.get("ranking_position"),
                            "owner": repo.get("owner"),
                            "language": repo.get("language"),
                            "snapshot_date": repo.get("snapshot_date"),
                        }
                        new_documents.append(doc)
                else:
                    # Short README: single document
                    doc = {
                        "id": repo_id,
                        "parent_id": None,
                        "chunk_index": 0,
                        "name": repo_name,
                        "description": description,
                        "readme_content": readme,  # Full README
                        "url": repo["url"],
                        "doc_type": "github_repo",
                        "topics": normalize_tags(repo.get("topics", [])),
                        # Metadata
                        "stars": repo.get("stars"),
                        "forks": repo.get("forks"),
                        "ranking_position": repo.get("ranking_position"),
                        "owner": repo.get("owner"),
                        "language": repo.get("language"),
                        "snapshot_date": repo.get("snapshot_date"),
                    }
                    new_documents.append(doc)

                # Rate limiting: small delay every 10 requests
                if (idx + 1) % 10 == 0:
                    time.sleep(0.5)

        logger.info(
            f"   ✓ Fetched {readme_fetch_count_repos}/{len([r for r in repos if r['id'] not in existing_ids])} READMEs for new repos"
        )

        # Process blog articles with conditional chunking (always new, never update)
        for article in articles:
            article_id = article["id"]

            if article_id in existing_ids:
                logger.debug(f"   Skipping existing article: {article_id}")
                continue

            full_content = article.get("content", "")
            title = article["title"]

            # Conditional chunking based on content length
            if len(full_content) <= self.chunking_threshold:
                # Short article: single document
                doc = {
                    "id": article_id,
                    "parent_id": None,
                    "chunk_index": 0,
                    "name": title,
                    "description": full_content,
                    "url": article["url"],
                    "doc_type": "blog_article",
                    "topics": normalize_tags(article.get("rag_topics", [])),
                    # Content metadata
                    "published_at": article.get("published_at"),
                    "content_source": article.get("source"),
                    "scrape_method": article.get("scrape_method"),
                }
                new_documents.append(doc)
            else:
                # Long article: chunk it
                chunks = self._chunk_text(full_content)
                logger.debug(
                    f"   Chunking article '{title[:50]}' into {len(chunks)} chunks"
                )

                for i, chunk in enumerate(chunks):
                    doc = {
                        "id": f"{article_id}_chunk_{i}",
                        "parent_id": article_id,
                        "chunk_index": i,
                        "name": f"{title} (part {i + 1}/{len(chunks)})",
                        "description": chunk,
                        "url": article["url"],
                        "doc_type": "blog_article",
                        "topics": normalize_tags(article.get("rag_topics", [])),
                        # Content metadata
                        "published_at": article.get("published_at"),
                        "content_source": article.get("source"),
                        "scrape_method": article.get("scrape_method"),
                    }
                    new_documents.append(doc)

        logger.info(f"✅ Prepared documents:")
        logger.info(f"   - New (need embedding): {len(new_documents)}")
        logger.info(f"   - Existing (metadata update only): {len(existing_documents)}")

        return new_documents, existing_documents

    def _create_embedding_text(self, doc: Dict) -> str:
        """
        Create rich, semantic text for embedding based on document type.
        Uses natural language descriptions (no numbers, no labels).
        """
        doc_type = doc["doc_type"]

        if doc_type == "hf_model":
            parts = [doc["name"]]

            # Add name with slashes replaced for better tokenization
            # "Supabase/gte-small" → "Supabase gte-small" (keep technical identifiers intact)
            if "/" in doc["name"]:
                parts.append(doc["name"].replace("/", " "))

            # Add description (already semantic)
            if doc.get("description"):
                parts.append(doc["description"])

            # Add full model card README (main searchable content)
            if doc.get("readme_content"):
                parts.append(doc["readme_content"])

            return "\n".join(parts)

        elif doc_type == "github_repo":
            parts = [doc["name"]]

            # Add name with slashes replaced for better tokenization
            # "langflow-ai/langflow" → "langflow-ai langflow" (keep org names intact)
            if "/" in doc["name"]:
                parts.append(doc["name"].replace("/", " "))

            # Add semantic popularity signal
            if doc.get("stars"):
                stars = doc["stars"]
                if stars > 100_000:
                    parts.append("Extremely popular and widely adopted repository")
                    parts.append("Top open source project")
                elif stars > 50_000:
                    parts.append("Highly popular repository")
                    parts.append("Widely used in production")
                elif stars > 10_000:
                    parts.append("Popular repository with active community")
                elif stars > 1_000:
                    parts.append("Established repository with good adoption")

            # Add language context (if relevant)
            if doc.get("language"):
                lang = doc["language"]
                if lang in ["Python", "TypeScript", "JavaScript"]:
                    parts.append(f"{lang} implementation")

            # Add description (already semantic)
            if doc.get("description"):
                parts.append(doc["description"])

            # Add full README (main searchable content)
            if doc.get("readme_content"):
                parts.append(doc["readme_content"])

            return "\n".join(parts)

        else:
            # For blog articles and other types, use natural format
            parts = [doc["name"]]
            if doc.get("description"):
                parts.append(doc["description"])
            return "\n".join(parts)

    def generate_embeddings(self, documents: List[Dict]) -> List[Dict]:
        """Generate embeddings for all documents."""
        if not documents:
            logger.info("⏭️  No new documents to embed")
            return []

        logger.info(f"\n🧮 Generating embeddings for {len(documents)} documents...")

        # Create rich text for embedding based on doc type
        texts = []
        for doc in documents:
            text = self._create_embedding_text(doc)
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

        logger.info(
            f"\n⬆️  Upserting {len(documents)} documents to {self.documents_table}..."
        )

        rows = []
        for doc in documents:
            # Create rich text with metadata for search
            rich_text = self._create_embedding_text(doc)

            row = {
                "id": doc["id"],
                "name": doc["name"],
                "description": doc.get("description", ""),
                "url": doc["url"],
                "doc_type": doc["doc_type"],
                "topics": doc.get("topics", []),
                "text": rich_text,
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

    def update_metadata_only(self, documents: List[Dict]):
        """Update only frequently-changing metadata fields for existing documents.

        This avoids re-fetching READMEs and re-generating embeddings for documents
        that already exist. Only updates: downloads, stars, forks, likes,
        ranking_position, and snapshot_date.
        """
        if not documents:
            logger.info("⏭️  No metadata to update")
            return

        logger.info(
            f"\n📊 Updating metadata for {len(documents)} existing documents..."
        )

        # Batch update using upsert (Supabase will update matching IDs)
        batch_size = 100
        for i in range(0, len(documents), batch_size):
            batch = documents[i : i + batch_size]

            try:
                # Upsert only the metadata fields
                # Supabase upsert will update only the provided fields for existing rows
                self.client.table(self.documents_table).upsert(batch).execute()

                if (i // batch_size + 1) % 5 == 0:
                    logger.info(
                        f"  Updated {i + len(batch)}/{len(documents)} documents"
                    )

            except Exception as e:
                logger.error(
                    f"❌ Failed to update metadata batch {i // batch_size + 1}: {e}"
                )
                # Continue with next batch

        logger.info(f"✅ Successfully updated metadata for {len(documents)} documents")

    def run_pipeline(self, snapshot_date: str = None):
        """
        Run the complete unified embedding pipeline.

        Workflow:
        1. Fetch RAG-related models/repos from time-series tables (latest snapshot)
        2. Check existing IDs in documents table
        3. NEW entries: Fetch README/model card + generate embeddings + full upsert
        4. EXISTING entries: Only update metadata (downloads, stars, etc.) - no embedding
        5. Blog articles: Only process if new (never update)

        Args:
            snapshot_date: Date to fetch data for (default: today)
        """
        logger.info("\n" + "=" * 60)
        logger.info("🚀 STARTING UNIFIED VECTOR EMBEDDING PIPELINE")
        logger.info("=" * 60 + "\n")

        if snapshot_date is None:
            snapshot_date = date.today().isoformat()
            logger.info(f"📅 Using today's snapshot date: {snapshot_date}")

        try:
            # Step 1: Get existing IDs from documents table
            existing_ids = self.get_existing_ids()

            # Step 2: Fetch data from source tables
            logger.info(
                f"\n📂 STEP 1: Fetching data from source tables (date: {snapshot_date})..."
            )
            models = self.fetch_models_from_sql(snapshot_date)
            repos = self.fetch_repos_from_sql(snapshot_date)

            # Check if we need to fetch articles (only if none exist in documents table)
            articles_exist = any(
                doc_id.startswith("blog_") or "chunk" in doc_id
                for doc_id in existing_ids
            )

            if articles_exist:
                logger.info("⏭️  Skipping blog articles (already embedded)")
                articles = []
            else:
                logger.info("📰 Fetching blog articles (first time embedding)")
                articles = self.fetch_articles_from_sql()

            # Step 3: Prepare documents (separate new vs existing)
            logger.info("\n🔄 STEP 2: Preparing documents...")
            new_documents, existing_documents = self.prepare_documents(
                models, repos, articles, existing_ids
            )

            # Step 4: Generate embeddings for NEW documents only
            if new_documents:
                logger.info("\n🧮 STEP 3: Generating embeddings for new documents...")
                documents_with_embeddings = self.generate_embeddings(new_documents)

                logger.info("\n⬆️  STEP 4: Upserting new documents with embeddings...")
                self.upsert_documents(documents_with_embeddings)
            else:
                logger.info("\n✅ No new documents to embed")
                documents_with_embeddings = []

            # Step 5: Update metadata for EXISTING documents (no embedding)
            if existing_documents:
                logger.info("\n📊 STEP 5: Updating metadata for existing documents...")
                self.update_metadata_only(existing_documents)
            else:
                logger.info("\n✅ No existing documents to update")

            # Success summary
            logger.info("\n" + "=" * 60)
            logger.info("✅ UNIFIED VECTOR EMBEDDING PIPELINE COMPLETED")
            logger.info("=" * 60)
            logger.info(f"📊 Summary:")
            logger.info(
                f"   - Sources: {len(models)} models + {len(repos)} repos + {len(articles)} articles"
            )
            logger.info(
                f"   - New documents (with embeddings): {len(documents_with_embeddings)}"
            )
            logger.info(
                f"   - Existing documents (metadata only): {len(existing_documents)}"
            )
            logger.info(
                f"   - Total in documents table: {len(existing_ids) + len(documents_with_embeddings)}"
            )
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
