"""
GitHub repository fetcher for RAG/LLM framework adoption signals.

Fetches TOP repos overall to track RAG framework market share and ranking.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class GitHubRepo:
    """GitHub repository data model with ranking context."""

    id: str
    repo_name: str
    owner: str
    description: str
    stars: int
    forks: int
    watchers: int
    open_issues: int
    language: str
    topics: List[str]
    created_at: str
    updated_at: str
    url: str
    ranking_position: int  # Position in overall top repos
    is_rag_related: bool  # Whether this is RAG/LLM/AI related
    rag_category: Optional[
        str
    ]  # "rag_framework", "vector_db", "llm_tool", "agent_framework"
    source: str = "github"
    scraped_at: str = datetime.now().isoformat()


class GitHubFetcher:
    """Fetcher for GitHub repository market share and ranking."""

    API_URL = "https://api.github.com"

    # RAG-related categories (SPECIFIC to RAG/retrieval/embedding)
    RAG_CATEGORIES = {
        "rag_framework": [
            "langchain",
            "llamaindex",
            "haystack",
            "semantic-kernel",
            "gpt-index",
            "langflow",
            "flowise",
            "ragas",
        ],
        "vector_db": [
            "qdrant",
            "chroma",
            "chromadb",
            "weaviate",
            "milvus",
            "pinecone",
            "faiss",
            "pgvector",
            "vectordb",
        ],
        "embedding_tool": [
            "sentence-transformers",
            "instructor-embedding",
            "text-embeddings",
            "embedding",
        ],
        "agent_framework": [
            "autogpt",
            "auto-gpt",
            "babyagi",
            "crewai",
            "agentgpt",
            "superagi",
            "agent",
            "agentic",
        ],
        "document_processing": [  # Verified from Unstructured-IO, pypdf, docling
            "unstructured",
            "pypdf",
            "docling",
            "document-parser",
            "document-parsing",
            "pdf-parser",
            "pdf-parsing",
            "ocr",
            "information-retrieval",
            "preprocessing",
            "pdf-to-text",
            "pdf-to-json",
        ],
        "observability": [  # Verified from langfuse, ragas, phoenix
            "langfuse",
            "phoenix",
            "llm-observability",
            "observability",
            "monitoring",
            "evaluation",
            "evals",
            "llm-evaluation",
            "llmops",
            "tracing",
            "prompt-engineering",
        ],
    }

    # Keywords for RAG detection (SPECIFIC - no generic LLM terms)
    RAG_KEYWORDS = [
        # Core RAG concepts
        "rag",
        "retrieval augmented",
        "retrieval-augmented",
        "vector database",
        "vector store",
        "vector search",
        # Embedding/semantic search
        "embedding",
        "embeddings",
        "sentence-transformers",
        "semantic search",
        "similarity search",
        # RAG frameworks (specific names)
        "langchain",
        "llamaindex",
        "haystack",
        # Agent-specific (not general chatbot)
        "agent",
        "agentic",
        "multi-agent",
        # Retrieval-specific
        "retrieval",
        "document retrieval",
        "context retrieval",
        # Document processing (verified from research)
        "document parser",
        "document-parser",
        "pdf parser",
        "ocr",
        "information-retrieval",
        "preprocessing",
        # Observability/Evaluation (verified from research)
        "llm observability",
        "llm-observability",
        "observability",
        "evaluation",
        "evals",
        "llm evaluation",
        "llmops",
        "monitoring",
    ]

    def __init__(self, output_dir: str = "data", api_token: Optional[str] = None):
        """Initialize fetcher."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()

        if api_token:
            self.session.headers.update(
                {
                    "Authorization": f"token {api_token}",
                    "Accept": "application/vnd.github.v3+json",
                }
            )
        else:
            self.session.headers.update({"Accept": "application/vnd.github.v3+json"})

    def fetch_by_topics(
        self,
        max_per_topic: int = 30,
        min_stars: int = 100,
    ) -> List[GitHubRepo]:
        """
        Fetch repos using TARGETED topic-based search.
        
        This captures:
        - Quality repos regardless of absolute star ranking
        - Specialized tools (rerankers, embeddings) that may have fewer stars
        - Better coverage of RAG ecosystem niches
        
        Args:
            max_per_topic: Max repos per topic (recommended: 20-50)
            min_stars: Minimum stars threshold for quality
            
        Returns:
            Deduplicated list of RAG repos from targeted searches
        """
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from rag_taxonomy import RAG_TAXONOMY
        
        logger.info(f"📥 Fetching repos via targeted topic search...")
        logger.info(f"   Max per topic: {max_per_topic}, Min stars: {min_stars}")
        
        seen_ids = set()
        all_repos = []
        ranking_position = 1
        
        try:
            # Search by each category's topics
            for category_id, config in RAG_TAXONOMY.items():
                logger.info(f"\n🔍 Searching category: {config['name']}")
                
                for topic in config["github_topics"]:
                    logger.info(f"   Topic: {topic}")
                    
                    try:
                        # Build search query for this topic
                        query = f"topic:{topic} stars:>={min_stars}"
                        
                        params = {
                            "q": query,
                            "sort": "stars",
                            "order": "desc",
                            "per_page": min(max_per_topic, 100),
                            "page": 1,
                        }
                        
                        response = self.session.get(
                            f"{self.API_URL}/search/repositories",
                            params=params,
                            timeout=10
                        )
                        
                        if response.status_code == 403:
                            logger.warning("⚠️  Rate limit - skipping remaining topics")
                            break
                            
                        response.raise_for_status()
                        data = response.json()
                        
                        if "items" not in data:
                            continue
                            
                        for repo_data in data["items"][:max_per_topic]:
                            repo_name = repo_data.get("full_name", "")
                            
                            # Skip duplicates
                            if repo_name in seen_ids:
                                continue
                                
                            repo = self._parse_repo(
                                repo_data,
                                ranking_position=ranking_position
                            )
                            
                            if repo and repo.is_rag_related:
                                all_repos.append(repo)
                                seen_ids.add(repo_name)
                                ranking_position += 1
                                
                                logger.info(
                                    f"      ✓ {repo.repo_name} "
                                    f"({repo.stars:,}⭐)"
                                )
                                
                    except requests.RequestException as e:
                        logger.debug(f"   Error fetching topic '{topic}': {e}")
                        continue
                        
            # Sort by stars for final ranking
            all_repos.sort(key=lambda r: r.stars, reverse=True)
            
            # Update ranking positions after sort
            for idx, repo in enumerate(all_repos):
                repo.ranking_position = idx + 1
                
            logger.info(f"\n✅ Fetched {len(all_repos)} unique repos via topic search")
            logger.info(f"   Covered {len(RAG_TAXONOMY)} categories")
            
            return all_repos
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch repos by topics: {e}")
            return []

    def _parse_repo(self, data: Dict, ranking_position: int) -> Optional[GitHubRepo]:
        """Parse repo data and classify if RAG-related."""
        try:
            repo_name = data.get("full_name", "")
            if not repo_name:
                return None

            owner = data.get("owner", {}).get("login", "")
            # Skip description (will extract from README during embedding for consistency)
            description = ""
            stars = data.get("stargazers_count", 0)
            forks = data.get("forks_count", 0)
            watchers = data.get("watchers_count", 0)
            open_issues = data.get("open_issues_count", 0)
            language = data.get("language", "")
            topics = data.get("topics", [])
            created_at = data.get("created_at", "")
            updated_at = data.get("updated_at", "")
            url = data.get("html_url", "")

            # Classify if RAG-related
            is_rag_related = self._is_rag_related(repo_name, description, topics)
            rag_category = (
                self._get_rag_category(repo_name, description, topics)
                if is_rag_related
                else None
            )

            # Generate ID
            repo_id = f"gh_repo_{repo_name.replace('/', '_')}"

            return GitHubRepo(
                id=repo_id,
                repo_name=repo_name,
                owner=owner,
                description=description,
                stars=stars,
                forks=forks,
                watchers=watchers,
                open_issues=open_issues,
                language=language,
                topics=topics,
                created_at=created_at,
                updated_at=updated_at,
                url=url,
                ranking_position=ranking_position,
                is_rag_related=is_rag_related,
                rag_category=rag_category,
            )

        except Exception as e:
            logger.debug(f"Error parsing repo: {e}")
            return None

    def _is_rag_related(
        self, repo_name: str, description: str, topics: List[str]
    ) -> bool:
        """Determine if repo is RAG/retrieval/embedding related (SPECIFIC, not general LLM)."""
        text = f"{repo_name} {description} {' '.join(topics)}".lower()

        # Check against all category keywords
        for category_repos in self.RAG_CATEGORIES.values():
            for keyword in category_repos:
                if keyword.lower() in text:
                    return True

        # Check specific RAG keywords
        for keyword in self.RAG_KEYWORDS:
            if keyword.lower() in text:
                return True

        # EXPLICITLY EXCLUDE general LLM tools (not RAG-specific)
        exclude_keywords = [
            "llm inference",
            "model training",
            "fine-tuning",
            "finetune",
            "model server",
            "llm server",
        ]

        for exclude in exclude_keywords:
            if exclude in text and not any(
                rag_kw in text for rag_kw in ["rag", "retrieval", "vector", "embedding"]
            ):
                return False

        return False

    def _get_rag_category(
        self, repo_name: str, description: str, topics: List[str]
    ) -> str:
        """Classify RAG repo into category."""
        text = f"{repo_name} {description} {' '.join(topics)}".lower()

        for category, keywords in self.RAG_CATEGORIES.items():
            for keyword in keywords:
                if keyword.lower() in text:
                    return category

        return "other_rag"
