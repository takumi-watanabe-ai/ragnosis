"""
Unified vector embedding pipeline for RAGnosis.

DEPRECATED: This module has been refactored into the embeddings package.
Use: from src.data_collection.embeddings import UnifiedVectorEmbedder

This wrapper is maintained for backward compatibility.
"""

import warnings
import logging

# Import from new location
from .embeddings import UnifiedVectorEmbedder
from .utils import normalize_tags

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    """
    Main entry point for unified vector embedding pipeline.

    DEPRECATED: Use `python -m src.data_collection.embeddings.pipeline` instead.
    """
    warnings.warn(
        "vector_embedder.py is deprecated. "
        "Use 'python -m src.data_collection.embeddings.pipeline' instead. "
        "This wrapper will be removed in a future version.",
        DeprecationWarning,
        stacklevel=2,
    )

    # Import and run the new pipeline
    from .embeddings.pipeline import main as new_main
    new_main()


if __name__ == "__main__":
    main()
