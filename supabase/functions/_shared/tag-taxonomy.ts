/**
 * Unified RAG Taxonomy - Single source of truth for data collection and search.
 * Based on analysis of 771 documents (359 HF models + 412 GitHub repos).
 *
 * ⚠️ IMPORTANT: This file is mirrored in Python at:
 *    src/data_collection/rag_taxonomy.py
 *
 *    Any changes to RAG_TAXONOMY or NOISE_PATTERNS must be manually
 *    synced to the Python file to keep data collection and search aligned.
 */

export interface CategoryConfig {
  name: string
  hf_tags: string[]
  github_topics: string[]
  keywords: string[]
}

// Comprehensive RAG taxonomy based on actual data analysis
export const RAG_TAXONOMY: Record<string, CategoryConfig> = {
  // ==========================================================================
  // CORE RAG COMPONENTS
  // ==========================================================================
  embedding_models: {
    name: 'Embedding Models',
    hf_tags: [
      'feature-extraction',
      'sentence-similarity',
      'sentence-transformers',
      'embeddings',
      'text-embeddings-inference',
      'image-feature-extraction',
    ],
    github_topics: [
      'embeddings',
      'sentence-transformers',
      'text-embeddings',
      'sentence-embeddings',
      'embedding',
      'instructor-embedding',
    ],
    keywords: [
      'embedding',
      'embeddings',
      'sentence-transformers',
      'sentence transformers',
      'semantic similarity',
      'text embeddings',
    ],
  },

  reranking_models: {
    name: 'Reranking Models',
    hf_tags: [
      'text-ranking',
      'reranker',
      'reranking',
      'cross-encoder',
    ],
    github_topics: [
      'reranking',
      'reranker',
      'cross-encoder',
    ],
    keywords: [
      'rerank',
      'reranker',
      'reranking',
      'cross-encoder',
      'text-ranking',
      're-ranking',
    ],
  },

  retrieval_models: {
    name: 'Retrieval Models',
    hf_tags: [
      'retrieval',
      'ColBERT',
      'PyLate',
      'dense-retrieval',
      'sparse-retrieval',
    ],
    github_topics: [
      'retrieval',
      'ColBERT',
      'PyLate',
      'dense-retrieval',
      'sparse-retrieval',
      'information-retrieval',
      'hybrid-search',
      'full-text-search',
    ],
    keywords: [
      'colbert',
      'pylate',
      'dense retrieval',
      'sparse retrieval',
      'retrieval model',
      'bm25',
    ],
  },

  // ==========================================================================
  // RAG FRAMEWORKS & INFRASTRUCTURE
  // ==========================================================================
  rag_frameworks: {
    name: 'RAG Frameworks',
    hf_tags: [
      'rag',
      'langchain',
      'llamaindex',
      'haystack',
    ],
    github_topics: [
      'rag',
      'retrieval-augmented-generation',
      'langchain',
      'llamaindex',
      'llama-index',
      'haystack',
      'semantic-kernel',
      'gpt-index',
      'langflow',
      'flowise',
      'ragas',
      'langgraph',
      'agentic-rag',
    ],
    keywords: [
      'rag',
      'retrieval augmented generation',
      'retrieval-augmented',
      'langchain',
      'llamaindex',
      'llama index',
      'haystack',
      'semantic kernel',
    ],
  },

  vector_databases: {
    name: 'Vector Databases',
    hf_tags: [
      'vector-database',
      'vector-store',
    ],
    github_topics: [
      'vector-database',
      'vector-search',
      'qdrant',
      'chroma',
      'chromadb',
      'weaviate',
      'milvus',
      'pinecone',
      'faiss',
      'pgvector',
      'vector-search-engine',
      'hnsw',
      'nearest-neighbor-search',
      'approximate-nearest-neighbor-search',
      'neural-search',
    ],
    keywords: [
      'vector database',
      'vector store',
      'vector search',
      'similarity search',
      'qdrant',
      'chromadb',
      'pinecone',
      'milvus',
      'faiss',
      'pgvector',
      'weaviate',
    ],
  },

  agent_frameworks: {
    name: 'Agent Frameworks',
    hf_tags: [
      'agent',
      'agents',
      'multi-agent',
    ],
    github_topics: [
      'agent',
      'agents',
      'agentic',
      'agentic-ai',
      'ai-agents',
      'agentic-workflow',
      'multi-agent',
      'multi-agent-systems',
      'autogpt',
      'auto-gpt',
      'babyagi',
      'crewai',
      'agentgpt',
      'superagi',
    ],
    keywords: [
      'agent',
      'agents',
      'agentic',
      'agentic ai',
      'ai agents',
      'agentic workflow',
      'multi-agent',
      'autonomous agent',
      'autogpt',
      'crewai',
    ],
  },

  // ==========================================================================
  // SPECIALIZED TOOLS
  // ==========================================================================
  document_processing: {
    name: 'Document Processing',
    hf_tags: [
      'document-processing',
      'document-parsing',
      'ocr',
      'document-question-answering',
      'visual-question-answering',
      'visual-document-retrieval',
      'image-text-to-text',
      'table-question-answering',
    ],
    github_topics: [
      'document-processing',
      'document-parsing',
      'pdf-parser',
      'pdf-processing',
      'pdf-to-text',
      'unstructured',
      'pypdf',
      'docling',
      'ocr',
      'pdf',
      'document-qa',
      'document-retrieval',
      'vlm',
      'multi-modal',
    ],
    keywords: [
      'document processing',
      'document parsing',
      'pdf parser',
      'pdf processing',
      'ocr',
      'unstructured',
      'pypdf',
      'docling',
    ],
  },

  knowledge_management: {
    name: 'Knowledge Graphs & Memory',
    hf_tags: [],
    github_topics: [
      'knowledge-graph',
      'knowledge-base',
      'memory',
      'graphrag',
      'graph-database',
      'graph-rag',
      'memory-management',
      'memory-engine',
      'knowledgebase',
    ],
    keywords: [
      'knowledge graph',
      'knowledge base',
      'memory',
      'graphrag',
      'graph rag',
      'memory management',
      'knowledge management',
    ],
  },

  search_qa: {
    name: 'Search & Question Answering',
    hf_tags: [
      'question-answering',
    ],
    github_topics: [
      'semantic-search',
      'search',
      'search-engine',
      'similarity-search',
      'question-answering',
      'chatbot',
    ],
    keywords: [
      'semantic search',
      'search engine',
      'similarity search',
      'question answering',
      'qa system',
      'chatbot',
    ],
  },

  mcp: {
    name: 'Model Context Protocol',
    hf_tags: [],
    github_topics: [
      'mcp',
      'model-context-protocol',
    ],
    keywords: [
      'mcp',
      'model context protocol',
    ],
  },

  // ==========================================================================
  // LLM ECOSYSTEM
  // ==========================================================================
  llm_providers: {
    name: 'LLM Providers & Platforms',
    hf_tags: [
      'openai',
      'anthropic',
      'conversational',
      'text-generation',
      'summarization',
      'translation',
    ],
    github_topics: [
      'llm',
      'llms',
      'openai',
      'chatgpt',
      'gpt',
      'gpt-4',
      'gpt-3',
      'anthropic',
      'claude',
      'gemini',
      'ollama',
      'deepseek',
      'llama',
      'llama3',
      'mistral',
      'llamacpp',
      'huggingface',
      'large-language-models',
      'generative-ai',
      'genai',
    ],
    keywords: [
      'llm',
      'large language model',
      'openai',
      'chatgpt',
      'gpt-4',
      'claude',
      'anthropic',
      'gemini',
      'ollama',
      'llama',
    ],
  },

  observability_evaluation: {
    name: 'Observability & Evaluation',
    hf_tags: [
      'evaluation',
      'monitoring',
      'mteb',
    ],
    github_topics: [
      'llmops',
      'llm-evaluation',
      'mlops',
      'observability',
      'monitoring',
      'tracing',
      'evaluation',
      'evals',
      'langfuse',
      'phoenix',
      'prompt-engineering',
      'fine-tuning',
      'benchmark',
      'benchmarking',
    ],
    keywords: [
      'llmops',
      'mlops',
      'llm observability',
      'observability',
      'monitoring',
      'evaluation',
      'evals',
      'tracing',
      'langfuse',
      'prompt engineering',
    ],
  },

  // ==========================================================================
  // DEVELOPMENT TOOLS - DISABLED FOR DATA COLLECTION (too broad, non-RAG specific)
  // ==========================================================================
  // These categories capture too many non-RAG repos and create noise in the dataset.
  // Keep them commented out for data collection, only use for search filtering if needed.
  //
  // programming_languages: {
  //   name: 'Programming Languages',
  //   hf_tags: [],
  //   github_topics: [
  //     'python',
  //     'typescript',
  //     'javascript',
  //     'golang',
  //     'go',
  //     'rust',
  //     'java',
  //   ],
  //   keywords: [
  //     'python',
  //     'typescript',
  //     'javascript',
  //     'golang',
  //     'rust',
  //     'java',
  //   ],
  // },
  //
  // web_infrastructure: {
  //   name: 'Web Frameworks & Infrastructure',
  //   hf_tags: [],
  //   github_topics: [
  //     'nextjs',
  //     'react',
  //     'fastapi',
  //     'streamlit',
  //     'docker',
  //     'kubernetes',
  //     'postgresql',
  //     'postgres',
  //   ],
  //   keywords: [
  //     'nextjs',
  //     'react',
  //     'fastapi',
  //     'streamlit',
  //     'docker',
  //     'kubernetes',
  //     'postgresql',
  //   ],
  // },
}

// ============================================================================
// NOISE PATTERNS - Tags to filter out
// ============================================================================

export const NOISE_PATTERNS = [
  // Metadata
  /^arxiv:/,
  /^dataset:/,
  /^region:/,
  /^deploy:/,
  /^license:/,
  /^base_model:/,
  /^doi:/,
  // Technical markers
  /^eval-results$/,
  /^endpoints_compatible$/,
  /^model-index$/,
  /^custom_code$/,
  /^generated_from_trainer$/,
  // Model formats (keep in DB, but not for semantic search)
  /^safetensors$/,
  /^onnx$/,
  /^gguf$/,
  /^openvino$/,
  /^pytorch$/,
  /^transformers\.js$/,
  // Natural language codes (2-letter ISO codes)
  /^(en|ja|zh|ru|ar|es|ko|de|fr|pt|it|hi|nl|tr|pl|cs|th|fa|ca|id|sv|sl|gu|gl|uk|da|mn|el|lv|vi|fi|mr|et|ro|ms|sr|ga|ka|hy|lt|sk|bg|my|hu|mk|te|hr|sq|ta|he|ur|pa|bn|kn|cy|eu|sw|ml|km|so|af|kk|ky)$/,
  /^multilingual$/,
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all relevant tags across all RAG_TAXONOMY categories
 */
export function getAllRelevantTags(): string[] {
  const tags = new Set<string>()

  Object.values(RAG_TAXONOMY).forEach(category => {
    category.hf_tags.forEach(tag => tags.add(tag))
    category.github_topics.forEach(tag => tags.add(tag))
  })

  return Array.from(tags).sort()
}

/**
 * Get category for a given tag
 */
export function getCategoryForTag(tag: string): string | null {
  const tagLower = tag.toLowerCase()

  for (const [categoryId, config] of Object.entries(RAG_TAXONOMY)) {
    const allTags = [...config.hf_tags, ...config.github_topics].map(t =>
      t.toLowerCase()
    )
    if (allTags.includes(tagLower)) {
      return categoryId
    }
  }

  return null
}

/**
 * Extract relevant tags from query using taxonomy
 */
export function extractQueryTags(query: string): string[] {
  const queryLower = query.toLowerCase()
  const matchedTags = new Set<string>()

  Object.values(RAG_TAXONOMY).forEach(category => {
    // Check keywords first
    for (const keyword of category.keywords) {
      if (queryLower.includes(keyword.toLowerCase())) {
        // Add associated tags
        category.hf_tags.forEach(t => matchedTags.add(t))
        category.github_topics.forEach(t => matchedTags.add(t))
        break
      }
    }

    // Check direct tag matches
    ;[...category.hf_tags, ...category.github_topics].forEach(tag => {
      if (queryLower.includes(tag.toLowerCase())) {
        matchedTags.add(tag)
      }
    })
  })

  return Array.from(matchedTags).sort()
}
