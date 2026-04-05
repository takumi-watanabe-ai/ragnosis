"""
Embedder for generating vector embeddings from documents.

Responsible for creating embeddings using sentence-transformers.
"""

import logging
from typing import List, Dict

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class Embedder:
    """Generates vector embeddings for documents."""

    def __init__(self, model_name: str):
        """
        Initialize embedder with a specific model.

        Args:
            model_name: Name of the sentence-transformers model
        """
        logger.info(f"📦 Loading embedding model: {model_name}")
        self.model = SentenceTransformer(model_name)
        self.embedding_dim = self.model.get_sentence_embedding_dimension()
        logger.info(f"   Embedding dimension: {self.embedding_dim}")

    def create_embedding_text(self, doc: Dict) -> str:
        """
        Create rich, semantic text for embedding based on document type.

        Uses natural language descriptions (no numbers, no labels).

        Args:
            doc: Document dictionary

        Returns:
            Formatted text for embedding
        """
        doc_type = doc["doc_type"]

        if doc_type == "hf_model":
            parts = [doc["name"]]

            # Add name with slashes replaced for better tokenization
            if "/" in doc["name"]:
                parts.append(doc["name"].replace("/", " "))

            # Add description
            if doc.get("description"):
                parts.append(doc["description"])

            # Add full model card README
            if doc.get("readme_content"):
                parts.append(doc["readme_content"])

            return "\n".join(parts)

        elif doc_type == "github_repo":
            parts = [doc["name"]]

            # Add name with slashes replaced
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

            # Add language context
            if doc.get("language"):
                lang = doc["language"]
                if lang in ["Python", "TypeScript", "JavaScript"]:
                    parts.append(f"{lang} implementation")

            # Add description
            if doc.get("description"):
                parts.append(doc["description"])

            # Add full README
            if doc.get("readme_content"):
                parts.append(doc["readme_content"])

            return "\n".join(parts)

        else:
            # For knowledge base articles
            parts = [doc["name"]]
            if doc.get("description"):
                parts.append(doc["description"])
            return "\n".join(parts)

    def generate_embeddings(self, documents: List[Dict], batch_size: int = 32) -> List[Dict]:
        """
        Generate embeddings for all documents.

        Args:
            documents: List of document dictionaries
            batch_size: Batch size for encoding

        Returns:
            Documents with embeddings attached
        """
        if not documents:
            logger.info("⏭️  No new documents to embed")
            return []

        logger.info(f"\n🧮 Generating embeddings for {len(documents)} documents...")

        # Create rich text for embedding
        texts = [self.create_embedding_text(doc) for doc in documents]

        # Generate embeddings in batches
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            embeddings = self.model.encode(
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
