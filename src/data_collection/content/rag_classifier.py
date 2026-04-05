"""RAG content classifier - filters documentation to RAG-specific content."""

import re
from typing import List, Tuple, Set

from ..rag_taxonomy import RAG_TAXONOMY


class RAGContentClassifier:
    """Classifies documentation content as RAG-relevant using taxonomy keywords."""

    # Core RAG categories - strict filtering for documentation
    CORE_RAG_CATEGORIES = {
        "embedding_models",
        "reranking_models",
        "retrieval_models",
        "rag_frameworks",
        "vector_databases",
        "document_processing",
        "knowledge_management",
        "search_qa",
    }

    # Explicit RAG keywords that must appear in URL path or content
    EXPLICIT_RAG_KEYWORDS = {
        # Core RAG terms
        "rag", "retrieval", "embedding", "embeddings", "vector", "rerank",
        "reranking", "semantic-search", "similarity-search", "vector-database",
        "vector-search", "bm25", "hybrid-search", "colbert", "cross-encoder",
        "dense-retrieval", "document-retrieval", "query-understanding",
        "index", "indexing", "chunking", "semantic", "pgvector",
        # Document processing
        "chunk", "chunks", "splitting", "splitter", "document-processing",
        # Prompting techniques
        "prompt", "prompting", "cot", "chain-of-thought", "react", "few-shot",
        "zero-shot", "self-consistency",
        # LLM/AI terms
        "llm", "llms", "language-model", "language-models",
        # Evaluation & quality
        "evaluation", "eval", "metrics", "benchmark", "guardrails",
        "hallucination", "hallucinations",
        # Storage & databases
        "database", "storage", "query-expansion",
        # General AI (more permissive for curated sources)
        "ai-applications", "ml-applications"
    }

    def __init__(self, min_matches: int = 1, api_min_matches: int = 2):
        """Initialize classifier.

        Args:
            min_matches: Minimum keyword matches required for regular pages (default: 1)
            api_min_matches: Minimum keyword matches required for API reference pages (default: 2)
        """
        self.min_matches = min_matches
        self.api_min_matches = api_min_matches

        # Build keyword index from taxonomy
        self.category_keywords = self._build_keyword_index()
        self.core_keywords = self._build_core_keyword_index()
        self.all_keywords = self._get_all_keywords()

    def _build_keyword_index(self) -> dict:
        """Build mapping of category_id -> keywords for fast lookup."""
        keyword_index = {}

        for category_id, config in RAG_TAXONOMY.items():
            # Combine all keyword sources
            keywords = set()
            keywords.update(config.get("keywords", []))
            keywords.update(config.get("hf_tags", []))
            keywords.update(config.get("github_topics", []))

            # Normalize to lowercase
            keyword_index[category_id] = {kw.lower() for kw in keywords}

        return keyword_index

    def _build_core_keyword_index(self) -> dict:
        """Build keyword index using only core RAG categories."""
        core_index = {}
        for category_id in self.CORE_RAG_CATEGORIES:
            if category_id in RAG_TAXONOMY:
                config = RAG_TAXONOMY[category_id]
                keywords = set()
                keywords.update(config.get("keywords", []))
                keywords.update(config.get("hf_tags", []))
                keywords.update(config.get("github_topics", []))
                core_index[category_id] = {kw.lower() for kw in keywords}
        return core_index

    def _get_all_keywords(self) -> Set[str]:
        """Get set of all RAG keywords across all categories."""
        all_kw = set()
        for keywords in self.category_keywords.values():
            all_kw.update(keywords)
        return all_kw

    def _extract_path_keywords(self, url: str) -> List[str]:
        """Extract meaningful keywords from URL path (excluding domain)."""
        # Parse URL to get path only (skip domain)
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path.lower()

        # Split path into segments
        parts = path.split("/")

        # Extract keywords from path segments
        keywords = []
        for part in parts:
            # Skip common non-keywords
            if part in ["", "docs", "documentation", "guides", "tutorials",
                       "examples", "learn", "api", "reference", "v1", "v2", "latest",
                       "oss", "python", "typescript", "javascript"]:
                continue

            # Keep hyphens for matching (vector-search, etc.)
            keywords.append(part)
            # Also add space-separated version for multi-word matching
            cleaned = part.replace("-", " ").replace("_", " ")
            keywords.append(cleaned)

        return keywords

    def is_rag_url(self, url: str) -> Tuple[bool, List[str]]:
        """Check if URL likely contains RAG content.

        Uses strict filtering: requires explicit RAG keywords in URL path.

        Args:
            url: The URL to check

        Returns:
            (is_rag, matched_categories): Tuple of bool and list of category IDs
        """
        # Extract keywords from URL path (not domain)
        path_keywords = self._extract_path_keywords(url)
        url_text = " ".join(path_keywords).lower()

        # First check: Must contain explicit RAG keyword in path
        matched_explicit = [kw for kw in self.EXPLICIT_RAG_KEYWORDS if kw in url_text]
        if not matched_explicit:
            return False, []

        # Second check: Match against core RAG categories only
        matched_categories = set()
        for category_id, keywords in self.core_keywords.items():
            for keyword in keywords:
                if keyword in url_text:
                    matched_categories.add(category_id)
                    break

        # Require at least 1 core category match
        is_rag = len(matched_categories) >= 1
        return is_rag, list(matched_categories)

    def classify_content(
        self,
        title: str,
        content: str,
        url: str = ""
    ) -> dict:
        """Extract RAG categories from page content.

        Uses filtering based on RAG keywords and category matches.

        Args:
            title: Page title
            content: Page content (first 2000 characters analyzed)
            url: Optional URL for API reference detection

        Returns:
            {
                "is_rag": bool,
                "categories": List[str],
                "matched_keywords": List[str],
                "confidence": float,
                "is_api_ref": bool,
                "threshold_used": int
            }
        """
        # Combine title (high weight) and content (analyze more content for better matching)
        text = f"{title} {title} {content[:2000]}".lower()

        # First check: Must contain explicit RAG keyword
        has_explicit_keyword = any(kw in text for kw in self.EXPLICIT_RAG_KEYWORDS)
        if not has_explicit_keyword:
            return {
                "is_rag": False,
                "categories": [],
                "matched_keywords": [],
                "confidence": 0.0,
                "is_api_ref": False,
                "threshold_used": self.min_matches,
                "reason": "no_explicit_keywords"
            }

        # Track matches using all categories for content classification
        matched_categories = set()
        matched_keywords = []

        # Check each category
        for category_id, keywords in self.category_keywords.items():
            category_matches = []
            for keyword in keywords:
                if keyword in text:
                    category_matches.append(keyword)

            if category_matches:
                matched_categories.add(category_id)
                matched_keywords.extend(category_matches)

        # Determine if this is an API reference page
        is_api_ref = any(pattern in url.lower() for pattern in [
            "/api-reference/", "/api/reference/", "/reference/api/", "/api/"
        ])

        # Apply threshold based on page type
        min_required = self.api_min_matches if is_api_ref else self.min_matches
        is_rag = len(matched_categories) >= min_required

        # Calculate confidence (normalized by total categories)
        confidence = len(matched_categories) / len(RAG_TAXONOMY) if RAG_TAXONOMY else 0

        return {
            "is_rag": is_rag,
            "categories": list(matched_categories),
            "matched_keywords": list(set(matched_keywords)),
            "confidence": confidence,
            "is_api_ref": is_api_ref,
            "threshold_used": min_required,
            "reason": "passed" if is_rag else f"insufficient_categories_{len(matched_categories)}_of_{min_required}"
        }

    def is_educational_section(self, url: str, section_patterns: dict = None) -> bool:
        """Check if URL is in an educational section.

        Args:
            url: The URL to check
            section_patterns: Optional dict of section_name -> url_pattern

        Returns:
            True if URL is in a priority educational section
        """
        url_lower = url.lower()

        # High-priority educational patterns
        educational_patterns = [
            "/guides/",
            "/tutorials/",
            "/learn/",
            "/examples/",
            "/how-to/",
            "/concepts/",
            "/understanding/",
            "/getting-started/",
        ]

        # Check educational patterns
        for pattern in educational_patterns:
            if pattern in url_lower:
                return True

        # Check custom section patterns if provided
        if section_patterns:
            for section, pattern in section_patterns.items():
                if pattern and pattern in url_lower:
                    return True

        return False

    def should_exclude_url(self, url: str) -> Tuple[bool, str]:
        """Check if URL should be excluded (non-educational, non-RAG).

        Args:
            url: The URL to check

        Returns:
            (should_exclude, reason): Tuple of bool and exclusion reason
        """
        url_lower = url.lower()

        # Exclusion patterns (only exclude if NOT RAG-specific)
        exclusion_patterns = {
            "/changelog": "changelog",
            "/release-notes": "release notes",
            "/releases/": "releases",
            "/security/": "security docs",
            "/community/": "community pages",
            "/about/": "about pages",
            "/pricing/": "pricing",
            "/terms/": "legal",
            "/privacy/": "legal",
        }

        for pattern, reason in exclusion_patterns.items():
            if pattern in url_lower:
                return True, reason

        return False, ""

    def get_category_names(self, category_ids: List[str]) -> List[str]:
        """Convert category IDs to human-readable names.

        Args:
            category_ids: List of category IDs (e.g., ["embedding_models"])

        Returns:
            List of category names (e.g., ["Embedding Models"])
        """
        names = []
        for cat_id in category_ids:
            if cat_id in RAG_TAXONOMY:
                names.append(RAG_TAXONOMY[cat_id]["name"])
        return names
