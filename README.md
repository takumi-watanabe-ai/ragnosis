# RAGnosis

> **Diagnose the RAG market with AI-powered intelligence**

AI-powered market intelligence platform for VCs, Product Managers, and Founders making RAG technology decisions.

**Status:** 🚧 POC Development - Analytics Phase

---

## What This Does

RAGnosis helps you make data-driven decisions about RAG (Retrieval-Augmented Generation) technology:

- **For VCs:** Identify promising RAG startups and investment opportunities
- **For Product Managers:** Track competitive RAG features and adoption trends
- **For Founders:** Understand market positioning and technical landscape

## Current Features (Analytics Phase)

✅ **Time-Series Analytics** (SQL-powered)
- HuggingFace model trends (downloads, rankings over time)
- GitHub repository growth (stars, forks, activity)
- Google search interest (trend detection)
- RAG market share analysis

🚧 **Coming Next: AI Research Agent**
- Natural language queries over unstructured content
- Multi-step reasoning and planning
- Synthesizes insights from papers, blogs, discussions
- Source attribution and citations

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

### ✅ Phase 1: Analytics Foundation (Current)
- [x] SQL schema with time-series tables
- [x] Data fetchers (HF, GitHub, Trends)
- [x] Ingestion pipeline
- [ ] Verify 30 days of historical data

### 🚧 Phase 2: Content Layer (In Progress)
- [x] Blog post aggregator (RSS feeds + historical)
  - LangChain, LlamaIndex, Pinecone, Weaviate, HuggingFace blogs
  - Historical scraping + daily RSS monitoring
  - Auto-filtered for RAG relevance
- [x] Vector embeddings for blog content
- [ ] ArXiv paper scraper
- [ ] HackerNews discussion fetcher

### 📋 Phase 3: AI Research Agent
- [ ] LangChain agent orchestration
- [ ] Tool definitions (SQL query, vector search)
- [ ] Natural language interface
- [ ] Multi-step reasoning with planning

### 📋 Phase 4: Production Deploy
- [ ] Next.js frontend (Vercel)
- [ ] Edge Functions for agent
- [ ] Custom domain (ragnosis.com)
- [ ] Analytics tracking

---

## Architecture

**Current (Analytics Only):**
```
Data Sources → Daily Fetch → SQL Tables → Analytics Queries
```

**Future (Full System):**
```
┌─────────────────────────────────────────────┐
│  UI (Next.js on Vercel)                     │
│  ├─ Analytics Dashboard (SQL queries)       │
│  └─ AI Chat Interface (agent)               │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴─────────┐
        ▼                  ▼
┌──────────────┐   ┌──────────────────┐
│ Supabase SQL │   │ Vercel Edge Fn   │
│ (Analytics)  │   │ (Agent)          │
└──────────────┘   └────────┬─────────┘
                            │
                   ┌────────┴─────────┐
                   ▼                  ▼
           ┌──────────────┐  ┌──────────────┐
           │ pgvector     │  │ LLM          │
           │ (RAG)        │  │ (OpenRouter) │
           └──────────────┘  └──────────────┘
```

---

## Documentation

- [REQUIREMENTS.md](REQUIREMENTS.md) - Full project specification
- [Supabase Schema](supabase/migrations/20260324_initial_schema.sql) - Database design

---

## Tech Stack

**Backend:**
- **Database:** Supabase (PostgreSQL + pgvector)
- **Embeddings:** sentence-transformers/all-MiniLM-L6-v2
- **Agent:** LangChain (coming soon)
- **LLM:** OpenRouter API

**Frontend (Coming Soon):**
- **Framework:** Next.js
- **Deployment:** Vercel
- **Styling:** Tailwind CSS

**Data Pipeline:**
- **Language:** Python 3.13
- **Automation:** GitHub Actions (daily cron)

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
