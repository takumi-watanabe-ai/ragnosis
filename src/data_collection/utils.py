"""Shared utility functions for data collection."""

import re
from typing import List

from .rag_taxonomy import NOISE_PATTERNS


def normalize_tags(tags: List[str]) -> List[str]:
    """
    Filter out noise tags using unified taxonomy noise patterns.

    Args:
        tags: List of tags to filter

    Returns:
        Filtered list of tags
    """
    if not tags:
        return []

    return [
        tag
        for tag in tags
        if not any(re.match(pattern, tag) for pattern in NOISE_PATTERNS)
    ]
