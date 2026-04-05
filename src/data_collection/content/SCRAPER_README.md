# Documentation Scraper System

## Overview

The scraper system now supports two types of content sources:

1. **Sitemap-based sources** (`DocScraper`) - For sites with XML sitemaps
2. **URL list sources** (`URLListScraper`) - For curated lists of individual URLs (e.g., Awesome-RAG)

Both scrapers share common functionality through the `BaseScraper` base class.

## Architecture

```
base_scraper.py          # Base class with common HTML extraction & RAG classification
├── doc_scraper.py       # Sitemap-based scraper
│   └── docs.yaml        # Sitemap source configurations
└── url_list_scraper.py  # URL list scraper
    └── url_lists.yaml   # Curated URL list configurations
```

## Files

### Core Components

- **`base_scraper.py`** - Base class with reusable scraping logic:
  - `DocPage` dataclass for representing scraped pages
  - `BaseScraper` class with HTML extraction methods
  - RAG content classification
  - Statistics tracking

- **`doc_scraper.py`** - Sitemap-based scraper (refactored):
  - Inherits from `BaseScraper`
  - Scrapes from XML sitemaps
  - Configured via `docs.yaml`

- **`url_list_scraper.py`** - NEW: URL list scraper:
  - Inherits from `BaseScraper`
  - Scrapes from curated URL lists
  - Configured via `url_lists.yaml`

### Configuration Files

- **`docs.yaml`** - Sitemap sources (LangChain, LlamaIndex, etc.)
- **`url_lists.yaml`** - NEW: Curated URL lists:
  - `awesome_rag_high_priority` - 23 framework docs & RAG articles
  - `awesome_rag_technique_guides` - 4 prompting technique guides
  - `awesome_rag_tutorials` - 6 developer tutorials
  - `awesome_rag_database_docs` - 4 vector database docs
  - `awesome_rag_blog_articles` - 11 Medium & technical blog posts
  - `awesome_rag_tools_benchmarks` - 4 tools & benchmark sites
  - **Total: 52 scrapable URLs from Awesome-RAG**

### Pipeline

- **`doc_pipeline.py`** - Updated to use both scrapers:
  - Scrapes sitemap sources first
  - Then scrapes URL lists
  - Combines results and inserts into database

## Usage

### Run the full pipeline

```bash
cd src/data_collection/content
python doc_pipeline.py
```

This will:
1. Scrape all enabled sitemap sources (from `docs.yaml`)
2. Scrape all enabled URL lists (from `url_lists.yaml`)
3. Insert new RAG-relevant pages into the database

### Test the URL list scraper

```bash
cd src/data_collection/content
python test_scrapers.py
```

This will scrape 3 sample pages from the Awesome-RAG high priority list.

## Adding New URL Lists

To add a new curated URL list, edit `url_lists.yaml`:

```yaml
my_custom_list:
  name: "My Custom RAG Resources"
  source_id: "my-custom-rag"
  enabled: true
  priority: 7
  urls:
    - "https://example.com/rag-tutorial"
    - "https://example.com/vector-database-guide"
    # Add more URLs...
```

## How It Works

1. **URL Filtering**:
   - URLs are filtered using the existing `RAGContentClassifier`
   - Only URLs with RAG keywords in the path are scraped
   - Exclusion patterns filter out non-educational content

2. **Content Extraction**:
   - HTML is fetched and parsed with BeautifulSoup
   - Main content is extracted (article, main tags)
   - Title, content, and metadata are extracted

3. **RAG Classification**:
   - Page content is classified for RAG relevance
   - Only pages matching RAG taxonomy categories are kept
   - Pages must have minimum keyword matches

4. **Database Storage**:
   - Scraped pages are converted to `DocPage` objects
   - Stored in `knowledge_base` table via Supabase
   - Duplicate URLs are automatically skipped

## Statistics

The scrapers track and log:
- URLs found
- URLs filtered out (non-RAG)
- Pages fetched
- Pages rejected (no RAG categories)
- Pages accepted (RAG-relevant)
- Filter rates for URLs and pages

## Awesome-RAG Integration

From the Awesome-RAG repository (116 total URLs):
- ✅ **52 scrapable** with existing system (HTML pages)
- ❌ **64 excluded**:
  - 34 GitHub repos (need different scraper)
  - 7 ArXiv papers (PDFs)
  - 3 YouTube videos (need transcripts)
  - 20 low-value (Wikipedia, badges, landing pages)

All 52 scrapable URLs are now configured in `url_lists.yaml` and integrated into the pipeline.
