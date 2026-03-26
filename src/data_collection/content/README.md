# Blog Content Scraping

Scrapes RAG-related blog articles from multiple sources for the RAGnosis knowledge base.

## Architecture

```
content/
├── config/
│   ├── sites.yaml       # Blog site definitions (RSS URLs only)
│   └── filters.yaml     # Content filters (skip keywords, RAG topics)
├── scrapers/
│   ├── base_scraper.py  # Base class + Article model
│   └── feed_scraper.py  # Unified RSS scraper (historical + daily)
└── blog_orchestrator.py # Main entry point
```

## Two Scraping Modes (Same RSS Scraper)

### 1. Historical Mode (One-time bulk)
```bash
make scrape-sitemap
```

- Fetches **ALL articles** from RSS feeds (no limit)
- One-time setup to build knowledge base
- Processes all entries in feed
- Stores in `blog_articles` SQL table

### 2. Daily Mode (Recent articles only)
```bash
make scrape-feeds
```

- Fetches **recent ~20 articles** from RSS feeds
- Daily monitoring for new content
- Much faster (processes fewer entries)
- Runs via GitHub Actions cron

**Same scraper, different limits!** RSS feeds contain full article history.

## Workflow

```
┌─────────────────────────────────────────────┐
│ 1. Fetch RSS Feed                            │
│    - Historical: ALL entries (no limit)      │
│    - Daily: Recent ~20 entries               │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 2. Filter Articles                           │
│    - Skip job posts, webinars, events       │
│    - Extract RAG topics (chunking, etc.)     │
│    - All articles are RAG-related (curated)  │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 3. Store in SQL (blog_articles)              │
│    - Deduplication by URL                    │
│    - No duplicates allowed                   │
└────────────────┬────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│ 4. Create Vector Embeddings                  │
│    - VectorEmbedder reads blog_articles      │
│    - Embeds title + excerpt                  │
│    - Stores in ragnosis_docs (pgvector)      │
│    - Deduplication by article ID             │
└─────────────────────────────────────────────┘
```

## Adding New Sites

Just add to `config/sites.yaml`:
```yaml
newsite:
  name: "New Site Blog"
  source_id: "newsite"
  rss_url: "https://newsite.com/rss.xml"  # Must have RSS feed
  enabled: true
  priority: 6
```

That's it! No parsers needed - RSS is standardized.

## Configuration

### Content Filters
Edit `config/filters.yaml` to adjust:
- `skip_keywords`: Auto-reject (e.g., "hiring", "job", "webinar")
- `rag_topics`: Topic extraction (e.g., "chunking", "embedding")

**Note:** No `rag_keywords` filter - we only scrape RAG-focused blogs, so all articles are relevant!

### Site Settings
Edit `config/sites.yaml` to:
- Enable/disable sites (`enabled: true/false`)
- Change scraping priority
- Update RSS URLs

## Running in Production

```bash
# One-time: Get all historical articles
make scrape-sitemap

# Daily: Check for new articles
make scrape-feeds

# Create embeddings for new articles
make pipeline
```

## Database Schema

Articles stored in `blog_articles` table:
- `id`: SHA256 hash of URL (unique)
- `url`: Article URL (unique constraint prevents duplicates)
- `title`, `author`, `published_at`, `content`, `excerpt`
- `source`: Site identifier (e.g., "langchain")
- `tags`: Article tags
- `rag_topics`: Extracted topics (e.g., ["chunking", "retrieval"])
- `scrape_method`: "historical" or "rss"

**Note:** No `is_rag_related` field - filtering happens before DB insert!

Vector embeddings stored in `ragnosis_docs` with `doc_type="blog_article"`.

## Vector Embeddings Strategy

**Same collection for all content types:**
- HF models: `doc_type="hf_model"` (name + short description)
- GitHub repos: `doc_type="github_repo"` (name + short description)
- Blog articles: `doc_type="blog_article"` (title + **FULL content**)

**Why full content for articles:**
- Better semantic search quality
- Captures all RAG concepts in the article
- Sentence transformer auto-truncates to token limit (~512 tokens)
- Allows unified search: "RAG chunking strategies" returns models, repos, AND articles

**Storage:**
- `description` field: Full content (for embedding + re-ranking)
- `text` field: Short preview (first 300 chars for display)
- `embedding`: Vector of full content (384 dimensions)

## Deduplication

Both SQL and vector databases prevent duplicates:
1. **SQL**: `url` has UNIQUE constraint
2. **Vector**: VectorEmbedder checks existing IDs before inserting

No duplicate articles will ever be stored.
