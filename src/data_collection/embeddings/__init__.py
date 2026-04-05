"""
Embeddings module for vector embedding generation.

This module is organized following SOLID principles:
- Single Responsibility: Each class has one clear purpose
- Open/Closed: Extensible without modification
- Dependency Inversion: High-level modules depend on abstractions

Components:
- ContentFetcher: Fetches content from external APIs (HuggingFace, GitHub)
- TextChunker: Splits large documents into chunks
- DocumentFetcher: Reads documents from database
- DocumentProcessor: Prepares documents for embedding
- Embedder: Generates vector embeddings
- DatabaseWriter: Writes documents to database
- UnifiedVectorEmbedder: Orchestrates the pipeline
"""

from .content_fetcher import ContentFetcher
from .text_chunker import TextChunker
from .document_fetcher import DocumentFetcher
from .document_processor import DocumentProcessor
from .embedder import Embedder
from .database_writer import DatabaseWriter
from .pipeline import UnifiedVectorEmbedder

__all__ = [
    "ContentFetcher",
    "TextChunker",
    "DocumentFetcher",
    "DocumentProcessor",
    "Embedder",
    "DatabaseWriter",
    "UnifiedVectorEmbedder",
]
