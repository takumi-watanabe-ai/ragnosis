import {
  Layers,
  Database,
  Wrench,
  Scale,
  BookOpen,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

export interface QuickQuestion {
  id: string;
  text: string;
  category: string;
}

export const quickQuestions: QuickQuestion[] = [
  // Embeddings
  {
    id: "embed-1",
    text: "What are the top embedding models?",
    category: "embeddings",
  },
  {
    id: "embed-2",
    text: "What are the best multilingual embedding models?",
    category: "embeddings",
  },
  {
    id: "embed-3",
    text: "Best embedding model for code documentation?",
    category: "embeddings",
  },
  {
    id: "embed-4",
    text: "What are the best reranking models?",
    category: "embeddings",
  },

  // Vector Databases
  {
    id: "vdb-1",
    text: "What are the most popular vector databases?",
    category: "vector-dbs",
  },
  {
    id: "vdb-2",
    text: "What vector databases are available?",
    category: "vector-dbs",
  },
  {
    id: "vdb-3",
    text: "Best vector database for production?",
    category: "vector-dbs",
  },
  {
    id: "vdb-4",
    text: "Which vector databases support filtering?",
    category: "vector-dbs",
  },

  // RAG Frameworks
  {
    id: "rag-1",
    text: "What are the most popular RAG frameworks on GitHub?",
    category: "rag-frameworks",
  },
  {
    id: "rag-2",
    text: "What RAG frameworks are available?",
    category: "rag-frameworks",
  },
  {
    id: "rag-3",
    text: "Best RAG framework for beginners?",
    category: "rag-frameworks",
  },
  {
    id: "rag-4",
    text: "Which RAG frameworks support streaming?",
    category: "rag-frameworks",
  },

  // Comparisons
  {
    id: "cmp-1",
    text: "When should I use RAG vs fine-tuning?",
    category: "comparisons",
  },
  {
    id: "cmp-2",
    text: "LangChain vs LlamaIndex?",
    category: "comparisons",
  },
  {
    id: "cmp-3",
    text: "Pinecone vs pgvector?",
    category: "comparisons",
  },
  {
    id: "cmp-4",
    text: "OpenAI embeddings vs open source alternatives?",
    category: "comparisons",
  },
  {
    id: "cmp-5",
    text: "ChromaDB vs Pinecone vs Weaviate?",
    category: "comparisons",
  },
  {
    id: "cmp-6",
    text: "Semantic search vs keyword search vs hybrid?",
    category: "comparisons",
  },

  // How-to & Concepts
  {
    id: "how-1",
    text: "How does RAG work?",
    category: "how-to",
  },
  {
    id: "how-2",
    text: "How do I improve retrieval accuracy?",
    category: "how-to",
  },
  {
    id: "how-3",
    text: "What's the best chunking strategy for RAG?",
    category: "how-to",
  },
  {
    id: "how-4",
    text: "How to implement hybrid search?",
    category: "how-to",
  },
  {
    id: "how-5",
    text: "How to prevent hallucinations in RAG?",
    category: "how-to",
  },

  // Troubleshooting
  {
    id: "trouble-1",
    text: "Why is my RAG returning duplicate results?",
    category: "troubleshooting",
  },
  {
    id: "trouble-2",
    text: "My RAG returns irrelevant results - how to fix?",
    category: "troubleshooting",
  },
  {
    id: "trouble-3",
    text: "How to debug poor retrieval quality?",
    category: "troubleshooting",
  },

  // Trends
  {
    id: "trend-1",
    text: "What's trending in RAG right now?",
    category: "trends",
  },
  {
    id: "trend-2",
    text: "Which embedding models are growing in popularity?",
    category: "trends",
  },
  {
    id: "trend-3",
    text: "What are companies using for RAG in production?",
    category: "trends",
  },
];

export const categories = [
  { id: "embeddings", label: "Embeddings", icon: Layers },
  { id: "vector-dbs", label: "Vector DBs", icon: Database },
  { id: "rag-frameworks", label: "RAG Frameworks", icon: Wrench },
  { id: "comparisons", label: "Comparisons", icon: Scale },
  { id: "how-to", label: "How-to", icon: BookOpen },
  { id: "troubleshooting", label: "Troubleshooting", icon: AlertCircle },
  { id: "trends", label: "Trends", icon: TrendingUp },
];
