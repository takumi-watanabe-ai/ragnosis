# GitHub Actions Workflows

Three separate workflows for efficient daily data collection with failure isolation.

## Workflow Schedule

```
8:00 AM UTC  → daily-market-data.yml   (Time-series: HF, GitHub, Trends)
9:00 AM UTC  → daily-blog-scrape.yml   (RSS feeds)
10:00 AM UTC → daily-embeddings.yml    (Load model ONCE, embed all)
```

## 1. Daily Market Data (Critical)

**File:** `daily-market-data.yml`
**Schedule:** 8:00 AM UTC
**Runtime:** ~2 minutes
**Failure:** CRITICAL - creates gaps in time-series analytics

**What it does:**
- Fetches HuggingFace models (daily snapshot)
- Fetches GitHub repos (daily snapshot)
- Fetches Google Trends (daily snapshot)
- Inserts to SQL tables
- Does NOT create embeddings (saves time)

**Failure handling:**
- HF or GitHub fail → Job fails (critical data)
- Trends fail → Warning only (can be flaky)

## 2. Daily Blog Scrape (Independent)

**File:** `daily-blog-scrape.yml`
**Schedule:** 9:00 AM UTC
**Runtime:** ~30 seconds
**Failure:** Less critical - can retry

**What it does:**
- Scrapes RSS feeds from 5 blog sources
- Filters for RAG-related content
- Inserts to `blog_articles` SQL table
- Does NOT create embeddings (saves time)

**Failure handling:**
- Scrape fails → Job fails, but doesn't affect market data
- Individual site failures handled gracefully (continue with others)

## 3. Daily Embeddings (Batch Processing)

**File:** `daily-embeddings.yml`
**Schedule:** 10:00 AM UTC (after data collection)
**Runtime:** ~4 minutes (model loading)
**Failure:** Non-critical - can retry manually

**What it does:**
- Loads sentence-transformer model ONCE
- Embeds ALL new data from today:
  - New HF models
  - New GitHub repos
  - New blog articles
- Inserts to `ragnosis_docs` vector table
- Skips existing entries (deduplication)

**Failure handling:**
- Embedding fails → Warning only (data safe in SQL)
- Can retry manually: `python src/data_collection/vector_embedder.py`

## Why 3 Separate Workflows?

### ✅ Advantages

1. **Failure Isolation**
   - Blogs fail ≠ Market data fails
   - Each can retry independently

2. **Performance**
   - Model loads ONCE per day (not 3 times)
   - 6-7 min total vs 8+ min if embedded after each scrape

3. **Flexibility**
   - Can run manually: Actions → Select workflow → Run workflow
   - Can adjust schedules independently
   - Easy debugging (clear logs per workflow)

4. **Cost Optimization**
   - Minimal GitHub Actions minutes
   - Efficient batch processing

### 📊 Total Daily Runtime

- Market data: 2 min
- Blog scrape: 0.5 min
- Embeddings: 4 min
- **Total: ~6.5 minutes/day**

## Required Secrets

Go to: Settings → Secrets and variables → Actions

Add these secrets:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (bypasses RLS)
- `HUGGINGFACE_API_KEY` - HuggingFace API token
- `GH_TOKEN` - GitHub personal access token

## Manual Triggers

All workflows can be triggered manually:
1. Go to Actions tab
2. Select workflow
3. Click "Run workflow"
4. Choose branch (usually `main`)

## Monitoring

Check workflow results:
- Green checkmark = Success
- Red X = Failed
- Yellow warning = Partial failure

Click on workflow run for detailed logs.

## Retry Failed Steps

If embeddings fail (data safe in SQL):
```bash
# Local retry
make pipeline

# Or just embeddings
python src/data_collection/vector_embedder.py
```

If scraping fails (MUST retry):
```bash
# Retry market data
python src/data_collection/pipeline.py

# Retry blog scrape
make scrape-feeds
```
