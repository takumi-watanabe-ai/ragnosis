"""
Unified RAG taxonomy for data collection and query planning.
Shared between:
- HuggingFace model fetcher
- GitHub repo fetcher
- Query planner (edge function)
"""

from typing import Dict, List, TypedDict


class CategoryConfig(TypedDict):
    """Configuration for each RAG category."""
    name: str
    hf_tags: List[str]  # HuggingFace tags to search
    github_topics: List[str]  # GitHub topics to search
    keywords: List[str]  # General keywords for classification


# Unified RAG taxonomy with search terms for both platforms
RAG_TAXONOMY: Dict[str, CategoryConfig] = {
    "embedding": {
        "name": "Embedding Models",
        "hf_tags": [
            "feature-extraction",
            "sentence-similarity",
            "sentence-transformers",
            "embeddings",
        ],
        "github_topics": [
            "sentence-transformers",
            "embeddings",
            "text-embeddings",
            "instructor-embedding",
        ],
        "keywords": [
            "embedding",
            "embeddings",
            "sentence-transformers",
            "sentence transformers",
            "semantic similarity",
        ],
    },

    "reranking": {
        "name": "Reranking Models",
        "hf_tags": [
            "text-ranking",
            "reranker",
            "reranking",
        ],
        "github_topics": [
            "reranking",
            "reranker",
            "cross-encoder",
        ],
        "keywords": [
            "rerank",
            "reranker",
            "reranking",
            "cross-encoder",
            "text-ranking",
        ],
    },

    "rag_framework": {
        "name": "RAG Frameworks",
        "hf_tags": [
            "rag",
            "retrieval",
            "langchain",
            "llamaindex",
            "haystack",
        ],
        "github_topics": [
            "rag",
            "langchain",
            "llamaindex",
            "llama-index",
            "haystack",
            "semantic-kernel",
            "gpt-index",
            "langflow",
            "flowise",
            "ragas",
        ],
        "keywords": [
            "rag",
            "retrieval augmented generation",
            "retrieval-augmented",
            "langchain",
            "llamaindex",
            "haystack",
        ],
    },

    "vector_db": {
        "name": "Vector Databases",
        "hf_tags": [
            "vector-database",
            "vector-store",
        ],
        "github_topics": [
            "vector-database",
            "vector-search",
            "qdrant",
            "chroma",
            "chromadb",
            "weaviate",
            "milvus",
            "pinecone",
            "faiss",
            "pgvector",
        ],
        "keywords": [
            "vector database",
            "vector store",
            "vector search",
            "similarity search",
            "semantic search",
        ],
    },

    "agent_framework": {
        "name": "Agent Frameworks",
        "hf_tags": [
            "agent",
            "agents",
            "multi-agent",
        ],
        "github_topics": [
            "agent",
            "agents",
            "agentic",
            "multi-agent",
            "autogpt",
            "auto-gpt",
            "babyagi",
            "crewai",
            "agentgpt",
            "superagi",
        ],
        "keywords": [
            "agent",
            "agents",
            "agentic",
            "multi-agent",
            "autonomous agent",
        ],
    },

    "document_processing": {
        "name": "Document Processing",
        "hf_tags": [
            "document-processing",
            "document-parsing",
            "ocr",
        ],
        "github_topics": [
            "document-processing",
            "document-parsing",
            "pdf-parser",
            "unstructured",
            "pypdf",
            "docling",
            "ocr",
            "information-retrieval",
            "pdf-to-text",
        ],
        "keywords": [
            "document processing",
            "document parsing",
            "pdf parser",
            "ocr",
            "information retrieval",
        ],
    },

    "observability": {
        "name": "LLM Observability & Evaluation",
        "hf_tags": [
            "evaluation",
            "monitoring",
        ],
        "github_topics": [
            "llm-observability",
            "observability",
            "monitoring",
            "evaluation",
            "evals",
            "llm-evaluation",
            "llmops",
            "tracing",
            "langfuse",
            "phoenix",
            "prompt-engineering",
        ],
        "keywords": [
            "llm observability",
            "observability",
            "monitoring",
            "evaluation",
            "evals",
            "llmops",
            "tracing",
        ],
    },
}


def get_all_hf_tags() -> List[str]:
    """Get all HuggingFace tags for RAG detection."""
    tags = []
    for category in RAG_TAXONOMY.values():
        tags.extend(category["hf_tags"])
    return list(set(tags))


def get_all_github_topics() -> List[str]:
    """Get all GitHub topics for RAG detection."""
    topics = []
    for category in RAG_TAXONOMY.values():
        topics.extend(category["github_topics"])
    return list(set(topics))


def get_all_keywords() -> List[str]:
    """Get all keywords for RAG detection."""
    keywords = []
    for category in RAG_TAXONOMY.values():
        keywords.extend(category["keywords"])
    return list(set(keywords))


def classify_category(text: str, tags: List[str]) -> str | None:
    """Classify text/tags into RAG category."""
    text_lower = text.lower()
    tags_lower = [t.lower() for t in tags]

    for category_id, config in RAG_TAXONOMY.items():
        # Check tags
        for tag in config["hf_tags"] + config["github_topics"]:
            if tag.lower() in tags_lower or tag.lower() in text_lower:
                return category_id

        # Check keywords
        for keyword in config["keywords"]:
            if keyword.lower() in text_lower:
                return category_id

    return None


def get_category_metadata() -> List[Dict]:
    """
    Get category metadata for query planner.
    Returns structured data for LLM to choose from.
    """
    return [
        {
            "category_id": category_id,
            "name": config["name"],
            "description": f"Search for {config['name'].lower()}",
            "example_queries": _get_example_queries(category_id),
        }
        for category_id, config in RAG_TAXONOMY.items()
    ]


def _get_example_queries(category_id: str) -> List[str]:
    """Get example queries for each category."""
    examples = {
        "embedding": [
            "best embedding models",
            "which embedding model should I use",
            "compare sentence transformers",
        ],
        "reranking": [
            "top reranking models",
            "how to rerank search results",
            "cross-encoder vs bi-encoder",
        ],
        "rag_framework": [
            "popular RAG frameworks",
            "langchain vs llamaindex",
            "best framework for RAG",
        ],
        "vector_db": [
            "which vector database to use",
            "qdrant vs pinecone",
            "self-hosted vector database",
        ],
        "agent_framework": [
            "best agent frameworks",
            "how to build ai agents",
            "autogpt alternatives",
        ],
        "document_processing": [
            "pdf parsing libraries",
            "document extraction tools",
            "ocr for rag",
        ],
        "observability": [
            "llm monitoring tools",
            "how to evaluate rag systems",
            "langfuse vs phoenix",
        ],
    }
    return examples.get(category_id, [])
