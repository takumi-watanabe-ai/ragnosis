# RAGnosis

> **AI-powered market intelligence for RAG technology decisions**

A production RAG system that answers questions about RAG technology itself—combining quantitative metrics from HuggingFace and GitHub with expert knowledge from official documentation. Built to showcase sophisticated RAG patterns that go beyond basic vector search.

**What makes this interesting:** Most RAG tutorials do naive vector search and call it done. This system demonstrates query planning, hybrid search, smart reranking, and cost optimization—techniques you need for production systems.

---

## What Makes It Smart

**Query Planning** - Before searching anything, an LLM analyzes what you're actually asking:
- Market data questions → Route to models/repos with metrics
- Implementation questions → Route to documentation with code examples
- Comparisons → Fetch data from multiple sources, synthesize side-by-side
- Troubleshooting → Match problem patterns, return diagnostic guides

**Hybrid Search** - Combines complementary approaches because neither works alone:
- Vector search finds conceptual matches ("retrieval quality" ≈ "improving accuracy")
- Keyword search finds exact matches ("Supabase/gte-small" finds that specific model)
- Searches across documentation, HuggingFace models, and GitHub repos simultaneously

**Smart Reranking** - Initial search returns candidates, BM25 reranking finds what matters:
- Scores based on query term coverage (not just vector similarity)
- 10x boost for title matches (signals high relevance)
- Squared penalty for missing important terms (filters out partial matches)
- Example: "Supabase/gte-small" query ranks that exact model above generic embedding articles

**Context-Aware Answers** - Different questions need different answer formats:
- Market questions → Ranked lists with GitHub stars, HuggingFace downloads, trend data
- How-to questions → Step-by-step guides with code snippets
- Troubleshooting → Problem diagnosis + actionable solutions
- Comparisons → Side-by-side feature/performance analysis

---

## Architecture & Design Decisions

**The Three-Stage Pipeline:**

1. **Query Planning** - LLM analyzes the question to understand intent before searching
2. **Parallel Execution** - Simultaneous searches across different data sources, then rerank and enrich
3. **Answer Synthesis** - LLM generates structured responses with proper citations

**Why This Approach?**

Most RAG systems jump straight to vector search. That fails for questions like "What are the top embedding models?" because:
- Vector search finds *similar* content, not ranked lists
- You need structured data (GitHub stars, HuggingFace downloads) not just text content
- Different questions need different data sources

By having the LLM analyze the query first, the system routes to the right data and formats answers appropriately.

**Cost Optimization:**

Instead of stuffing all search results (with full metadata) into the LLM context, this system:
1. Does initial search with minimal data (title + content only)
2. Reranks to find the actual top 5
3. Only then enriches those 5 with expensive SQL joins for full metadata

Result: ~60% token reduction compared to enriching everything upfront.

---

## Key Implementation Highlights

**Dual Vector Collections:**
- Documentation: Official docs from 9 sources (LangChain, LlamaIndex, Pinecone, HF, etc.)
- Models/Repos: 61 entries with rich metadata (stars, downloads, trends)
- Single query searches both collections in parallel via PostgreSQL CTEs

**Full-Text + Vector Indexes:**
```sql
-- Vector search with pgvector
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops);

-- Keyword search with GIN (on name + description)
-- No separate text column needed
```

**BM25 Reranking in TypeScript:**
- Custom implementation that understands multi-word queries
- Title boosting (10x) + term coverage scoring
- Runs post-retrieval to refine top candidates

**Automated Data Pipeline:**
- Daily: HuggingFace model stats, GitHub repo metrics, Google Trends
- Weekly: Documentation scraping from 9 official sources
- Embeddings generated on-demand for new content
- Fully automated via GitHub Actions

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| **Runtime** | Deno (Supabase Edge Functions) | Fast cold starts, TypeScript native, easy local dev |
| **Database** | PostgreSQL + pgvector | Simpler than dedicated vector DBs, powerful for hybrid search |
| **Vector Search** | pgvector cosine similarity | Native Postgres extension, handles 384-dim embeddings efficiently |
| **Keyword Search** | PostgreSQL GIN full-text | Fast exact matching, combines naturally with vector search |
| **LLM** | Ollama qwen2.5:3b-instruct | Small model sufficient for query analysis, runs locally |
| **Embeddings** | Supabase.ai.Session (gte-small) | 384 dimensions, good quality/speed tradeoff |
| **Reranking** | Custom BM25 (TypeScript) | Better than pure vector similarity for keyword-heavy queries |
| **Frontend** | Next.js + assistant-ui | Modern React streaming UI, Vercel-deployable |
| **Data Pipeline** | Python + GitHub Actions | Flexible scraping, automated scheduling |

---

## What I'd Build Next

**Implemented:**
- ✅ Query planning with LLM routing
- ✅ Dual vector search (docs + models/repos)
- ✅ Custom BM25 reranking
- ✅ Post-rerank metadata enrichment
- ✅ Automated data collection (4K+ articles)
- ✅ Modern Next.js frontend

**Next Steps:**
- Cross-encoder reranking (Cohere or local model)
- Semantic caching for common queries
- ArXiv papers + HackerNews discussions
- Analytics dashboard (query patterns, answer quality)
- A/B testing framework for RAG experiments

---

## Documentation

- [Example Queries](docs/example_queries.md) - Query patterns & expected routing behavior
- [Database Schema](supabase/migrations/) - PostgreSQL + pgvector design
- [Edge Function](supabase/functions/rag-chat/) - RAG implementation details

---

**Built to showcase:** Production RAG patterns • Query understanding • Hybrid search • Cost optimization • Automated data pipelines
