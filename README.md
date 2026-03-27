# RAGnosis

> **AI-powered market intelligence for RAG technology decisions**

Making smart decisions about RAG technology? You need both the numbers (what's popular) and the know-how (what actually works). RAGnosis gives you both: quantitative metrics from HuggingFace and GitHub, plus expert knowledge from 4,000+ blog articles from teams who've built RAG systems in production.

**Status:** 🚀 Production Ready

---

## What Makes It Smart

Most RAG systems just do vector search and call it a day. This one actually thinks about your question first:

**Smart Query Understanding** - Before searching anything, an LLM figures out what you're really asking:
- Are you looking for market data? ("What are the top embedding models?")
- Need implementation help? ("How do I fix retrieval accuracy?")
- Comparing options? ("LangChain vs LlamaIndex")
- The system then routes to the right data source automatically

**Hybrid Search** - Combines two search approaches because sometimes you need both:
- Vector search finds conceptually similar content ("retrieval quality" matches "improving accuracy")
- Keyword search finds exact matches ("Supabase/gte-small" finds that specific model)
- Searches across blog articles, HuggingFace models, and GitHub repos simultaneously

**Smart Reranking** - Not all "relevant" results are actually relevant:
- Custom BM25 algorithm scores results based on how many query terms they match
- Heavily boosts results where terms appear in the title (10x multiplier)
- Penalizes results missing important query terms (squared penalty)
- Result: "Supabase/gte-small" ranks higher than generic embedding articles

**Answer Generation** - Different questions need different answer styles:
- Market questions get ranked lists with metrics
- Implementation questions get step-by-step guides
- Troubleshooting gets problem diagnosis + solutions
- Comparisons get side-by-side analysis

---

## How It Works

```
Your Query
    ↓
┌─────────────────────────────────────────────────────────┐
│ 1. Query Analysis (Ollama qwen2.5:3b)                  │
│    • What kind of question is this?                     │
│    • What entities are mentioned? (models, frameworks)  │
│    • Where should we look? (SQL, blog articles, both)   │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Hybrid Search                                        │
│    • Vector: Semantic similarity across 4K+ blog docs   │
│    • Keyword: BM25 ranking on PostgreSQL full-text      │
│    • SQL: Direct metrics for specific models/repos      │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Reranking (Custom BM25 in TypeScript)               │
│    • Score: How many query terms match?                 │
│    • Boost: Title matches = 10x weight                  │
│    • Penalty: Missing terms = score² drop               │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Data Enrichment                                      │
│    • Merge SQL metadata (downloads, stars, likes)       │
│    • Add RAG category tags                              │
│    • Filter by quality threshold                        │
└───────────────────────┬─────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Answer Generation (Ollama qwen2.5:3b)               │
│    • Use intent-specific prompt template                │
│    • Cite sources with markdown links                   │
│    • Format for readability                             │
└─────────────────────────────────────────────────────────┘
                        ↓
                 Final Answer
```

**The Stack:**
- **Runtime**: Deno (Supabase Edge Functions)
- **Database**: PostgreSQL with pgvector extension + GIN full-text indexes
- **LLM**: Ollama qwen2.5:3b (runs locally for query analysis & answer generation)
- **Embeddings**: Supabase.ai.Session using gte-small (384 dimensions)
- **Data Pipeline**: Python scripts + GitHub Actions (automated daily/weekly)

---

## Quick Start

### Prerequisites

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 1. Start Supabase

```bash
supabase init
supabase start  # Copy the API URL and keys!
```

### 2. Setup Database

```bash
# Apply schema
supabase db reset
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 4. Fetch & Ingest Data

```bash
# Fetch market data (HuggingFace, GitHub, Google Trends)
make pipeline

# One-time: Scrape ALL blog articles from sitemaps
make scrape-sitemap
```

### 5. Verify Data

```bash
# Open Supabase Studio
make supabase-studio

# Check tables:
# - hf_models (~400 rows)
# - github_repos (~400 rows)
# - blog_articles (~4,000 rows)
```

---

## Development Commands

```bash
# Setup
make setup              # Full local setup (Supabase + Ollama)

# Data collection
make pipeline           # Fetch HF/GitHub/Trends data
make scrape-sitemap     # Comprehensive blog scraping
make embed              # Create embeddings for new data

# Development
make chat               # Start chat interface
make supabase-studio    # Open database UI
```

---

## Automated Data Collection

The system updates automatically via GitHub Actions:

**Daily:**
- 8:00 AM UTC - Market data (HuggingFace models, GitHub repos, Google Trends)
- 10:00 AM UTC - Vector embeddings (creates embeddings for any new data)

**Weekly:**
- Sunday 2:00 AM UTC - Blog articles (comprehensive sitemap scraping)

**Setup:**
Add these secrets in GitHub repo → Settings → Secrets:
- `SUPABASE_URL` - Your production Supabase URL
- `SUPABASE_SERVICE_KEY` - Service role key
- `HUGGINGFACE_API_KEY` - HuggingFace API token
- `GH_TOKEN` - GitHub personal access token

---

## Roadmap

**✅ Built:**
- Advanced RAG pipeline with LLM query preprocessing
- Hybrid search (vector + keyword)
- Custom BM25 reranking
- Intent-specific answer generation
- Automated data collection (4K+ blog articles)

**🚧 Next:**
- Cross-encoder neural reranking (replace custom BM25)
- Multi-query expansion
- Semantic caching
- ArXiv + HackerNews integration

**📋 Future:**
- Next.js frontend with chat UI
- Analytics dashboard
- RAGAS evaluation metrics

---

## Documentation

- [Example Queries](docs/example_queries.md) - Query patterns & testing scenarios
- [Database Schema](supabase/migrations/) - PostgreSQL + pgvector design
- [Edge Function](supabase/functions/rag-chat/) - RAG implementation details

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Deno (Supabase Edge Functions) |
| **Database** | PostgreSQL + pgvector + GIN indexes |
| **LLM** | Ollama qwen2.5:3b-instruct |
| **Embeddings** | Supabase.ai.Session (gte-small, 384-dim) |
| **Vector Search** | pgvector cosine similarity |
| **Keyword Search** | PostgreSQL full-text (ts_rank_cd) |
| **Reranking** | Custom BM25 (TypeScript) |
| **Data Pipeline** | Python 3.13 + GitHub Actions |

---

## License

MIT

---

**Built to showcase:** Production RAG systems, LLM-powered query understanding, Hybrid search architectures, Automated data pipelines
