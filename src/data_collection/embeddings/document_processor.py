"""
Document processor for preparing documents for embedding.

Handles fetching content, chunking, and creating document dictionaries.
"""

import logging
import time
from typing import List, Dict, Set, Tuple

from .content_fetcher import ContentFetcher
from .text_chunker import TextChunker
from ..utils import normalize_tags

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Processes raw database documents into embedding-ready documents."""

    def __init__(
        self,
        content_fetcher: ContentFetcher,
        text_chunker: TextChunker,
        chunking_threshold: int = 2000,
    ):
        """
        Initialize document processor.

        Args:
            content_fetcher: Content fetcher instance
            text_chunker: Text chunker instance
            chunking_threshold: Character threshold for chunking documents
        """
        self.content_fetcher = content_fetcher
        self.text_chunker = text_chunker
        self.chunking_threshold = chunking_threshold

    def prepare_documents(
        self,
        models: List[Dict],
        repos: List[Dict],
        articles: List[Dict],
        new_urls: Set[str],
        hf_token: str = None,
        github_token: str = None,
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Prepare all documents for embedding.

        New documents (in new_urls) get full content fetched and are prepared for embedding.
        Existing documents (not in new_urls) are marked for metadata-only updates.

        Args:
            models: List of model records from database
            repos: List of repo records from database
            articles: List of article records from database
            new_urls: Set of URLs that are NEW (not in documents table yet)
            hf_token: Optional HuggingFace API token
            github_token: Optional GitHub token

        Returns:
            Tuple of (new_documents, existing_documents)
            - new_documents: Documents that need embedding
            - existing_documents: Documents that only need metadata updates
        """
        logger.info("📦 Preparing documents...")

        new_documents = []
        existing_documents = []

        # Process models
        new_docs, existing_docs = self._process_models(
            models, new_urls, hf_token
        )
        new_documents.extend(new_docs)
        existing_documents.extend(existing_docs)

        # Process repos
        new_docs, existing_docs = self._process_repos(
            repos, new_urls, github_token
        )
        new_documents.extend(new_docs)
        existing_documents.extend(existing_docs)

        # Process articles
        new_docs = self._process_articles(articles, new_urls)
        new_documents.extend(new_docs)

        logger.info(f"✅ Prepared documents:")
        logger.info(f"   - New (need embedding): {len(new_documents)}")
        logger.info(f"   - Existing (metadata update only): {len(existing_documents)}")

        return new_documents, existing_documents

    def _process_models(
        self, models: List[Dict], new_urls: Set[str], hf_token: str = None
    ) -> Tuple[List[Dict], List[Dict]]:
        """Process HuggingFace models."""
        new_documents = []
        existing_documents = []

        if not models:
            return new_documents, existing_documents

        logger.info(f"📝 Processing {len(models)} models...")

        readme_fetch_count = 0
        skipped_count = 0
        new_count = 0

        for idx, model in enumerate(models):
            model_id = model["id"]
            model_name = model["model_name"]
            model_url = model.get("url")

            # Check if this is a new URL (needs content fetching)
            if model_url and model_url in new_urls:
                # New model: fetch model card
                new_count += 1
                if new_count == 1:
                    logger.info(f"   🔄 Fetching model cards for new models...")
                if new_count % 10 == 0:
                    logger.info(f"   Fetched: {new_count} model cards...")

                model_card = self.content_fetcher.fetch_hf_model_card(
                    model_name, hf_token
                )

                if not model_card:
                    skipped_count += 1
                    continue

                readme_fetch_count += 1
                description = self.content_fetcher.extract_description_from_text(
                    model_card
                )

                # Chunk if needed
                if len(model_card) > self.chunking_threshold:
                    chunks = self.text_chunker.chunk_text(model_card)
                    for i, chunk in enumerate(chunks):
                        doc = self._create_model_document(
                            model, model_id, model_name, description, chunk, i, len(chunks)
                        )
                        new_documents.append(doc)
                else:
                    doc = self._create_model_document(
                        model, model_id, model_name, description, model_card, 0, 1
                    )
                    new_documents.append(doc)

                # Rate limiting
                if (idx + 1) % 10 == 0:
                    time.sleep(0.5)
            else:
                # Existing model: only update metadata (no content fetching)
                doc = {
                    "id": model_id,
                    "name": model_name,
                    "url": model_url,
                    "downloads": model.get("downloads"),
                    "likes": model.get("likes"),
                    "ranking_position": model.get("ranking_position"),
                    "snapshot_date": model.get("snapshot_date"),
                }
                existing_documents.append(doc)

        logger.info(f"   ✓ Fetched {readme_fetch_count} model cards for new models")
        if skipped_count > 0:
            logger.info(f"   ℹ️  Skipped {skipped_count} models without README content")

        return new_documents, existing_documents

    def _process_repos(
        self, repos: List[Dict], new_urls: Set[str], github_token: str = None
    ) -> Tuple[List[Dict], List[Dict]]:
        """Process GitHub repos."""
        new_documents = []
        existing_documents = []

        if not repos:
            return new_documents, existing_documents

        logger.info(f"📝 Processing {len(repos)} repos...")

        readme_fetch_count = 0
        skipped_count = 0

        for idx, repo in enumerate(repos):
            repo_id = repo["id"]
            repo_name = repo["repo_name"]
            repo_url = repo["url"]

            # Check if this is a new URL (needs content fetching)
            if repo_url in new_urls:
                # New repo: fetch README
                readme = self.content_fetcher.fetch_github_readme(
                    repo_name, github_token
                )

                if not readme:
                    skipped_count += 1
                    continue

                readme_fetch_count += 1
                description = self.content_fetcher.extract_description_from_text(readme)

                # Chunk if needed
                if len(readme) > self.chunking_threshold:
                    chunks = self.text_chunker.chunk_text(readme)
                    for i, chunk in enumerate(chunks):
                        doc = self._create_repo_document(
                            repo, repo_id, repo_name, description, chunk, i, len(chunks)
                        )
                        new_documents.append(doc)
                else:
                    doc = self._create_repo_document(
                        repo, repo_id, repo_name, description, readme, 0, 1
                    )
                    new_documents.append(doc)

                # Rate limiting
                if (idx + 1) % 10 == 0:
                    time.sleep(0.5)
            else:
                # Existing repo: only update metadata (no content fetching)
                doc = {
                    "id": repo_id,
                    "name": repo_name,
                    "url": repo_url,
                    "stars": repo.get("stars"),
                    "forks": repo.get("forks"),
                    "ranking_position": repo.get("ranking_position"),
                    "snapshot_date": repo.get("snapshot_date"),
                }
                existing_documents.append(doc)

        logger.info(f"   ✓ Fetched {readme_fetch_count} READMEs for new repos")
        if skipped_count > 0:
            logger.info(f"   ℹ️  Skipped {skipped_count} repos without README content")

        return new_documents, existing_documents

    def _process_articles(
        self, articles: List[Dict], new_urls: Set[str]
    ) -> List[Dict]:
        """Process knowledge base articles."""
        new_documents = []

        for article in articles:
            article_id = article["id"]
            article_url = article["url"]

            # Skip if already exists (not in new_urls)
            if article_url not in new_urls:
                continue

            full_content = article.get("content", "")
            title = article["title"]

            # Chunk if needed
            if len(full_content) > self.chunking_threshold:
                chunks = self.text_chunker.chunk_text(full_content)
                for i, chunk in enumerate(chunks):
                    doc = self._create_article_document(
                        article, article_id, title, chunk, i, len(chunks)
                    )
                    new_documents.append(doc)
            else:
                doc = self._create_article_document(
                    article, article_id, title, full_content, 0, 1
                )
                new_documents.append(doc)

        return new_documents

    def _create_model_document(
        self,
        model: Dict,
        model_id: str,
        model_name: str,
        description: str,
        content: str,
        chunk_index: int,
        total_chunks: int,
    ) -> Dict:
        """Create a model document dictionary."""
        if total_chunks > 1:
            doc_id = f"{model_id}_chunk_{chunk_index}"
            doc_name = f"{model_name} (part {chunk_index + 1}/{total_chunks})"
            parent_id = model_id
        else:
            doc_id = model_id
            doc_name = model_name
            parent_id = None

        return {
            "id": doc_id,
            "parent_id": parent_id,
            "chunk_index": chunk_index,
            "name": doc_name,
            "description": description,
            "readme_content": content,
            "url": model["url"],
            "doc_type": "hf_model",
            "topics": normalize_tags(model.get("tags", [])),
            "downloads": model.get("downloads"),
            "likes": model.get("likes"),
            "ranking_position": model.get("ranking_position"),
            "author": model.get("author"),
            "task": model.get("task"),
            "snapshot_date": model.get("snapshot_date"),
        }

    def _create_repo_document(
        self,
        repo: Dict,
        repo_id: str,
        repo_name: str,
        description: str,
        content: str,
        chunk_index: int,
        total_chunks: int,
    ) -> Dict:
        """Create a repo document dictionary."""
        if total_chunks > 1:
            doc_id = f"{repo_id}_chunk_{chunk_index}"
            doc_name = f"{repo_name} (part {chunk_index + 1}/{total_chunks})"
            parent_id = repo_id
        else:
            doc_id = repo_id
            doc_name = repo_name
            parent_id = None

        return {
            "id": doc_id,
            "parent_id": parent_id,
            "chunk_index": chunk_index,
            "name": doc_name,
            "description": description,
            "readme_content": content,
            "url": repo["url"],
            "doc_type": "github_repo",
            "topics": normalize_tags(repo.get("topics", [])),
            "stars": repo.get("stars"),
            "forks": repo.get("forks"),
            "ranking_position": repo.get("ranking_position"),
            "owner": repo.get("owner"),
            "language": repo.get("language"),
            "snapshot_date": repo.get("snapshot_date"),
        }

    def _create_article_document(
        self,
        article: Dict,
        article_id: str,
        title: str,
        content: str,
        chunk_index: int,
        total_chunks: int,
    ) -> Dict:
        """Create an article document dictionary."""
        if total_chunks > 1:
            doc_id = f"{article_id}_chunk_{chunk_index}"
            doc_name = f"{title} (part {chunk_index + 1}/{total_chunks})"
            parent_id = article_id
        else:
            doc_id = article_id
            doc_name = title
            parent_id = None

        return {
            "id": doc_id,
            "parent_id": parent_id,
            "chunk_index": chunk_index,
            "name": doc_name,
            "description": content,
            "url": article["url"],
            "doc_type": "knowledge_base",
            "topics": [article.get("section")] if article.get("section") else [],
            "published_at": article.get("updated_at"),
            "content_source": article.get("source"),
            "scrape_method": article.get("scrape_method"),
        }
