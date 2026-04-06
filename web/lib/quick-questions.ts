import {
  Layers,
  Database,
  Wrench,
  Scale,
  BookOpen,
  AlertCircle,
  TrendingUp,
  Sparkles,
} from "lucide-react";

export interface QuickQuestion {
  id: string;
  text: string;
  category: string;
}

export const quickQuestions: QuickQuestion[] = [
  // Getting Started
  {
    id: "start-1",
    text: "What is RAG?",
    category: "getting-started",
  },
  {
    id: "start-2",
    text: "When should I use RAG?",
    category: "getting-started",
  },
  {
    id: "start-3",
    text: "What do I need to build RAG?",
    category: "getting-started",
  },
  {
    id: "start-4",
    text: "RAG vs fine-tuning - which is better?",
    category: "getting-started",
  },

  // Embeddings
  {
    id: "embed-1",
    text: "What are the top embedding models?",
    category: "embeddings",
  },
  {
    id: "embed-2",
    text: "Which embedding models are most used?",
    category: "embeddings",
  },
  {
    id: "embed-3",
    text: "Best multilingual embedding models?",
    category: "embeddings",
  },
  {
    id: "embed-4",
    text: "How do I choose an embedding model?",
    category: "embeddings",
  },

  // Databases
  {
    id: "vdb-1",
    text: "What are the most popular vector databases?",
    category: "vector-dbs",
  },
  {
    id: "vdb-2",
    text: "Which database should I use for production?",
    category: "vector-dbs",
  },
  {
    id: "vdb-3",
    text: "Pinecone vs pgvector vs Weaviate?",
    category: "vector-dbs",
  },
  {
    id: "vdb-4",
    text: "Which databases are growing fastest?",
    category: "vector-dbs",
  },

  // Frameworks
  {
    id: "rag-1",
    text: "Which RAG frameworks are most popular?",
    category: "rag-frameworks",
  },
  {
    id: "rag-2",
    text: "What's the best framework for beginners?",
    category: "rag-frameworks",
  },
  {
    id: "rag-3",
    text: "Which frameworks are growing fastest?",
    category: "rag-frameworks",
  },
  {
    id: "rag-4",
    text: "LangChain vs LlamaIndex?",
    category: "rag-frameworks",
  },

  // Comparisons
  {
    id: "cmp-1",
    text: "LangChain vs LlamaIndex?",
    category: "comparisons",
  },
  {
    id: "cmp-2",
    text: "Pinecone vs pgvector?",
    category: "comparisons",
  },
  {
    id: "cmp-3",
    text: "OpenAI embeddings vs open source alternatives?",
    category: "comparisons",
  },
  {
    id: "cmp-4",
    text: "Semantic vs keyword vs hybrid search?",
    category: "comparisons",
  },

  // How It Works
  {
    id: "how-1",
    text: "How does RAG work?",
    category: "how-it-works",
  },
  {
    id: "how-2",
    text: "What are the key components of RAG?",
    category: "how-it-works",
  },
  {
    id: "how-3",
    text: "How do I improve retrieval accuracy?",
    category: "how-it-works",
  },
  {
    id: "how-4",
    text: "What's the best chunking strategy?",
    category: "how-it-works",
  },
  {
    id: "how-5",
    text: "How can I prevent hallucinations?",
    category: "how-it-works",
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
    text: "How do I debug poor retrieval quality?",
    category: "troubleshooting",
  },
  {
    id: "trouble-4",
    text: "Why is my RAG slow?",
    category: "troubleshooting",
  },
  {
    id: "trouble-5",
    text: "How do I reduce hallucinations?",
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
    text: "Which embedding models are growing fastest?",
    category: "trends",
  },
  {
    id: "trend-3",
    text: "What are companies using in production?",
    category: "trends",
  },
  {
    id: "trend-4",
    text: "Which vector databases are gaining traction?",
    category: "trends",
  },
  {
    id: "trend-5",
    text: "What's the hottest area in RAG?",
    category: "trends",
  },
];

export const categories = [
  { id: "getting-started", label: "Getting Started", icon: BookOpen },
  { id: "how-it-works", label: "How It Works", icon: Layers },
  { id: "rag-frameworks", label: "Frameworks", icon: Wrench },
  { id: "embeddings", label: "Embeddings", icon: Sparkles },
  { id: "vector-dbs", label: "Databases", icon: Database },
  { id: "comparisons", label: "Comparisons", icon: Scale },
  { id: "troubleshooting", label: "Troubleshooting", icon: AlertCircle },
  { id: "trends", label: "Trends", icon: TrendingUp },
];
