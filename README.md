# RAGnosis

> **AI-powered market intelligence for RAG technology decisions**

**Status:** 🚀 Advanced RAG System - Production Ready

---

## What It Does

Market intelligence platform for VCs, Product Managers, and Founders making RAG technology decisions. Combines quantitative metrics (downloads, stars) with expert knowledge from 4,018+ blog articles.

## Key Features

🤖 **LLM Query Preprocessing** - Ollama (qwen2.5:3b) analyzes queries to:
- Classify intent (market intelligence, implementation, troubleshooting, comparison)
- Extract entities (frameworks, models, vector DBs, companies)
- Route to optimal data source (SQL vs vector search)
- Enhance queries with context

🔍 **Hybrid Search** - Best of both worlds:
- **Vector**: pgvector cosine similarity (384-dim embeddings)
- **Keyword**: PostgreSQL full-text search (BM25-like `ts_rank_cd`)
- Searches across blogs, HuggingFace models, GitHub repos

📊 **BM25 Reranking** - Custom algorithm with:
- Term frequency scoring + stop word filtering
- 10x title match boosting
- Completeness penalty (missing terms = exponential score drop)

🔧 **Data Enrichment** - Merges vector results with SQL metrics:
- Downloads, stars, likes, forks
- RAG category classification

🎯 **Intent-Specific Answers** - Templates optimized per query type:
- Market intelligence: Lists with metrics
- Implementation: Actionable steps
- Troubleshooting: Problem → Solution
- Comparison: Side-by-side analysis

📈 **Time-Series Analytics** - SQL-powered trends:
- HuggingFace model downloads over time
- GitHub repository growth
- Google search interest

---

## Quick Start

### Prerequisites

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Install Python dependencies
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
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

# Or manually in Studio (http://localhost:54323)
# Run: supabase/migrations/20260324_initial_schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

### 4. Fetch & Ingest Data

```bash
# Fetch market data (HuggingFace, GitHub, Google Trends)
make fetch-data

# Ingest into SQL tables
make ingest

# One-time: Scrape ALL blog articles from sitemaps (100s-1000s)
make scrape-sitemap
```

### 5. Verify Data

```bash
# Open Supabase Studio
make supabase-studio

# Check tables:
# - hf_models (should have ~400 rows)
# - github_repos (should have ~400 rows)
# - google_trends (should have ~30 rows)
```

---

## Project Structure

```
ragnosis/
├── src/
│   ├── data_collection/        # Data fetchers and ingestion
│   │   ├── content/            # Blog article scraping (NEW)
│   │   │   ├── config/         # Site configs & filters
│   │   │   ├── scrapers/       # Historical & RSS scrapers
│   │   │   ├── parsers/        # Site-specific parsers
│   │   │   └── blog_orchestrator.py
│   │   ├── hf_fetcher.py       # HuggingFace models
│   │   ├── github_fetcher.py   # GitHub repositories
│   │   ├── trends_fetcher.py   # Google Trends
│   │   ├── vector_embedder.py  # Embedding pipeline
│   │   └── pipeline.py         # Complete data pipeline
│   └── agent/                   # AI research assistant (coming soon)
│       └── research_agent.py
├── supabase/
│   └── migrations/              # Database schema
├── .github/
│   └── workflows/               # GitHub Actions (daily scraping)
├── docs/
│   └── REQUIREMENTS.md          # Full specification
├── Makefile                     # Development commands
└── README.md
```

---

## Development

### Common Commands

```bash
# Setup
make setup              # Full local setup (Supabase + Ollama)

# Data collection (local)
make pipeline           # Fetch HF/GitHub/Trends + embed
make scrape-sitemap     # One-time sitemap scrape (100s-1000s articles)
make scrape-feeds       # Daily blog RSS (or use GitHub Actions)

# Embeddings
make embed              # Create embeddings for new data only

# Development
make chat               # Start chat interface
make supabase-studio    # Open database UI
make supabase-reset     # Reset database (⚠️ deletes all)
```

### Data Flow

```
Daily Cron (GitHub Actions)
  ├─ fetch-data → data/*.json
  └─ ingest → Supabase SQL tables

Analytics Queries
  └─ Direct SQL (Supabase client or Studio)
```

---

## Roadmap

**✅ Completed:**
- Analytics foundation (SQL time-series, data fetchers)
- Content layer (4,018 blog articles, embeddings, pgvector)
- Advanced RAG system:
  - LLM query preprocessing (intent, entities, routing)
  - Hybrid search (vector + keyword)
  - BM25 reranking (TypeScript)
  - Data enrichment (SQL metrics merge)
  - Intent-specific answer generation

**🚧 Next:**
- Cross-encoder neural reranking
- Multi-query expansion
- Semantic caching
- ArXiv + HackerNews integration

**📋 Future:**
- Next.js frontend + chat UI
- Analytics dashboard
- RAGAS evaluation

---

## Architecture

```
Query → LLM Preprocessing → Hybrid Search → BM25 Reranking → Data Enrichment → Answer Generation
         (qwen2.5:3b)        (Vector+Keyword)  (TypeScript)    (SQL merge)      (qwen2.5:3b)
              ↓                     ↓                ↓               ↓                ↓
         Intent/Entities      pgvector+BM25      TF scoring     +Downloads       Templated
         Smart routing        across 4K docs     +Title boost   +Stars/Likes     by intent
```

**Stack:**
- **Edge Function**: Deno (Supabase)
- **Database**: PostgreSQL + pgvector + GIN indexes
- **LLM**: Ollama qwen2.5:3b (query analysis + answer generation)
- **Embeddings**: Supabase.ai.Session (gte-small, 384-dim)
- **Data Pipeline**: Python 3.13 → GitHub Actions (daily)

---

## Documentation

- [Example Queries](docs/example_queries.md) - Query patterns & testing
- [Database Schema](supabase/migrations/) - PostgreSQL + pgvector design
- [Edge Function](supabase/functions/rag-chat/) - RAG implementation

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
| **Frontend** | Next.js (planned) |

---

## GitHub Actions Setup (Daily Automation)

Three separate workflows run daily for efficient data collection with failure isolation.

**Setup:**
1. Go to your GitHub repo → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `SUPABASE_URL`: Your production Supabase URL
   - `SUPABASE_SERVICE_KEY`: Your Supabase service role key
   - `HUGGINGFACE_API_KEY`: HuggingFace API token
   - `GH_TOKEN`: GitHub personal access token

**The workflows:**
- **8:00 AM UTC**: Market data (HF models, GitHub repos, Trends) - ~2 min
- **9:00 AM UTC**: Blog RSS feeds - ~30 sec
- **10:00 AM UTC**: Embeddings (all sources, model loads ONCE) - ~4 min

**Why separate?**
- Failure isolation (blogs fail ≠ market data fails)
- Performance (model loads once vs 3 times)
- Easy debugging and retries

See `.github/workflows/README.md` for details.

---

## Contributing

This is a portfolio/demonstration project. Not accepting contributions at this time.

---

## License

MIT

---

**Built to showcase:** RAG systems, Agentic AI, SQL analytics, Production architecture
