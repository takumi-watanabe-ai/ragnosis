"""
Text chunker for splitting large documents into smaller chunks.

Implements semantic chunking with sentence-level splitting.
"""

import re
from typing import List


class TextChunker:
    """Chunks text into smaller pieces with overlap."""

    def __init__(self, chunk_size: int = 2000, overlap: int = 400):
        """
        Initialize text chunker.

        Args:
            chunk_size: Target size for each chunk in characters
            overlap: Number of characters to overlap between chunks
        """
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split_into_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences for semantic chunking.

        Args:
            text: Text to split

        Returns:
            List of sentences
        """
        # Simple sentence splitter (handles common cases)
        # Split on period followed by space and capital, question mark, exclamation
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk_text(self, text: str) -> List[str]:
        """
        Split long text into overlapping chunks at sentence boundaries.

        Args:
            text: Full text content to chunk

        Returns:
            List of text chunks
        """
        if len(text) <= self.chunk_size:
            return [text]

        # Split into sentences for semantic chunking
        sentences = self.split_into_sentences(text)
        if not sentences:
            # Fallback to character-based splitting if no sentences detected
            return self._chunk_by_chars(text)

        chunks = []
        current_chunk = []
        current_length = 0

        for sentence in sentences:
            sentence_length = len(sentence)

            # If adding this sentence exceeds chunk size, start new chunk
            if current_length + sentence_length > self.chunk_size and current_chunk:
                chunks.append(" ".join(current_chunk))

                # Start new chunk with overlap (last few sentences)
                overlap_chunk = []
                overlap_length = 0
                for s in reversed(current_chunk):
                    if overlap_length + len(s) <= self.overlap:
                        overlap_chunk.insert(0, s)
                        overlap_length += len(s)
                    else:
                        break

                current_chunk = overlap_chunk
                current_length = overlap_length

            # Add sentence to current chunk
            current_chunk.append(sentence)
            current_length += sentence_length

        # Add final chunk
        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    def _chunk_by_chars(self, text: str) -> List[str]:
        """
        Fallback: split text by characters with overlap.

        Args:
            text: Text to split

        Returns:
            List of character-based chunks
        """
        chunks = []
        start = 0

        while start < len(text):
            end = start + self.chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - self.overlap  # Overlap for next chunk

        return chunks
