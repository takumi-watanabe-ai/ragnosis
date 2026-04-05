"""
Centralized configuration management for data collection pipelines.

Loads configuration from:
1. Environment variables (.env file)
2. Shared config.json (embedding/chunking settings)
"""

import json
import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv


class Config:
    """Singleton configuration manager for data collection."""

    _instance: Optional["Config"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize configuration from environment and config files."""
        if self._initialized:
            return

        # Load environment variables
        load_dotenv()

        # Load shared config.json for embedding settings
        config_path = (
            Path(__file__).parent.parent.parent
            / "supabase"
            / "functions"
            / "_shared"
            / "config.json"
        )

        if config_path.exists():
            with open(config_path) as f:
                self._config_data = json.load(f)
        else:
            # Fallback defaults if config.json doesn't exist
            self._config_data = {
                "embedding": {
                    "model": "gte-small",
                    "model_python": "Supabase/gte-small",
                    "model_js": "gte-small",
                    "dimensions": 384,
                    "batch_size": 32
                },
                "chunking": {
                    "threshold": 2000,
                    "chunk_size": 2000,
                    "overlap": 400,
                    "max_tokens_context": 512
                }
            }

        self._initialized = True

    # Supabase credentials
    @property
    def supabase_url(self) -> Optional[str]:
        """Supabase project URL."""
        return os.getenv("SUPABASE_URL")

    @property
    def supabase_service_key(self) -> Optional[str]:
        """Supabase service role key (admin access)."""
        return os.getenv("SUPABASE_SERVICE_KEY")

    @property
    def supabase_table(self) -> str:
        """Default Supabase table for documents."""
        return os.getenv("SUPABASE_TABLE", "documents")

    # API tokens
    @property
    def huggingface_api_key(self) -> Optional[str]:
        """Hugging Face API token."""
        return os.getenv("HUGGINGFACE_API_KEY")

    @property
    def github_token(self) -> Optional[str]:
        """GitHub personal access token."""
        return os.getenv("GITHUB_TOKEN")

    # Embedding configuration
    @property
    def embedding_model(self) -> str:
        """Generic embedding model identifier."""
        return self._config_data["embedding"]["model"]

    @property
    def embedding_model_python(self) -> str:
        """Python-specific embedding model name (for sentence-transformers)."""
        return self._config_data["embedding"]["model_python"]

    @property
    def embedding_model_js(self) -> str:
        """JavaScript-specific embedding model name."""
        return self._config_data["embedding"]["model_js"]

    @property
    def embedding_dimensions(self) -> int:
        """Vector embedding dimensions."""
        return self._config_data["embedding"]["dimensions"]

    @property
    def embedding_batch_size(self) -> int:
        """Batch size for embedding generation."""
        return self._config_data["embedding"]["batch_size"]

    # Chunking configuration
    @property
    def chunking_threshold(self) -> int:
        """Character threshold for chunking documents."""
        return self._config_data["chunking"]["threshold"]

    @property
    def chunking_chunk_size(self) -> int:
        """Target size for text chunks."""
        return self._config_data["chunking"]["chunk_size"]

    @property
    def chunking_overlap(self) -> int:
        """Overlap between consecutive chunks."""
        return self._config_data["chunking"]["overlap"]

    @property
    def chunking_max_tokens_context(self) -> int:
        """Maximum tokens for context window."""
        return self._config_data["chunking"]["max_tokens_context"]

    def validate(self) -> bool:
        """
        Validate that all required configuration is present.

        Returns:
            True if configuration is valid, False otherwise.

        Raises:
            ValueError: If required configuration is missing.
        """
        missing = []

        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_service_key:
            missing.append("SUPABASE_SERVICE_KEY")

        if missing:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing)}\n"
                "Please check your .env file."
            )

        return True

    def get_supabase_credentials(self) -> tuple[str, str]:
        """
        Get Supabase credentials as a tuple.

        Returns:
            Tuple of (url, service_key)

        Raises:
            ValueError: If credentials are missing.
        """
        self.validate()
        return (self.supabase_url, self.supabase_service_key)


# Singleton instance
config = Config()


__all__ = ["config", "Config"]
