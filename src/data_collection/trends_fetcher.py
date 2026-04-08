"""
Google Trends fetcher for RAG/LLM search interest signals.

Tracks public search interest to predict adoption trends.
"""

import json
import logging
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict

from pytrends.request import TrendReq
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class TrendData:
    """Google Trends data model."""

    id: str
    keyword: str
    category: str  # "rag_term", "framework", "tool"
    current_interest: int  # Most recent interest level
    avg_interest: float  # Average search interest (0-100)
    peak_interest: int  # Peak search interest
    time_series: List[Dict]  # [{date: "2024-01", value: 45}, ...]
    related_queries: List[Dict]  # Top related searches
    scraped_at: str = datetime.now().isoformat()


class GoogleTrendsFetcher:
    """Fetcher for Google Trends search interest data."""

    # Keywords to track - CONCEPTS vs TOOLS
    # Strategy: Simple terms, accept some ambiguity for signal strength
    RAG_KEYWORDS = {
        # Core RAG concepts (track awareness)
        "concepts": [
            "RAG",  # Ambiguous but HIGH signal
            "retrieval augmented generation",
            "vector database",
            "vector search",
            "semantic search",
            "embedding",
            "hybrid search",
            "reranking",
            "sentence transformers",
        ],
        # RAG frameworks (specific tools)
        "frameworks": [
            "LangChain",
            "LlamaIndex",
            "Haystack",  # Simple name
            "DSPy",
        ],
        # Vector databases (specific tools - simple names)
        "vector_dbs": [
            "Qdrant",
            "Pinecone",
            "Weaviate",
            "Milvus",
            "Chroma",  # Yes, includes color but we want the signal
            "Faiss",
            "pgvector",
        ],
        # Agent terms (track agent trend)
        "agent_terms": ["AI agent", "agentic AI", "autonomous agent"],
    }

    def __init__(self, output_dir: str = "data"):
        """Initialize fetcher."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.pytrends = TrendReq(hl="en-US", tz=360)

    def fetch_trends(
        self,
        keywords: Optional[List[str]] = None,
        timeframe: str = "today 12-m",  # Last 12 months
        geo: str = "",  # '' = worldwide
        max_keywords_per_request: int = 5,
        reference_keyword: str = "RAG",  # Baseline for cross-batch normalization
    ) -> List[TrendData]:
        """
        Fetch Google Trends data for keywords.

        Args:
            keywords: List of keywords to track (max 5 per request)
            timeframe: Time range ('today 12-m', 'today 3-m', 'today 5-y')
            geo: Geographic location ('' = worldwide, 'US', 'GB', etc.)
            max_keywords_per_request: Google Trends API limit

        Returns:
            List of TrendData objects
        """
        if keywords is None:
            # Use all predefined keywords
            keywords = []
            for category_keywords in self.RAG_KEYWORDS.values():
                keywords.extend(category_keywords)

        logger.info(f"📊 Fetching Google Trends data for {len(keywords)} keywords...")
        logger.info(f"   Timeframe: {timeframe}, Geo: {geo or 'Worldwide'}")
        logger.info(f"   Using '{reference_keyword}' as normalization baseline")

        all_trends = []
        reference_data = None  # Store reference keyword data for normalization

        # Process in batches (Google Trends limit: 5 keywords per request)
        # Include reference keyword in each batch for cross-batch normalization
        for i in range(0, len(keywords), max_keywords_per_request):
            batch = keywords[i : i + max_keywords_per_request]

            # Add reference keyword if not already in batch (use 4 keywords + reference)
            if reference_keyword not in batch:
                # Reduce batch size to 4 to make room for reference
                batch = keywords[i : i + max_keywords_per_request - 1]
                batch_with_ref = [reference_keyword] + batch
            else:
                batch_with_ref = batch

            logger.info(f"\n🔍 Processing batch: {', '.join(batch_with_ref)}")

            # Retry logic with exponential backoff
            max_retries = 3
            base_delay = 10

            for attempt in range(max_retries):
                try:
                    # Build payload with reference keyword
                    self.pytrends.build_payload(
                        batch_with_ref, timeframe=timeframe, geo=geo
                    )

                    # Get interest over time
                    interest_df = self.pytrends.interest_over_time()

                    if interest_df.empty:
                        logger.warning(f"⚠️  No data for batch: {batch_with_ref}")
                        time.sleep(5)  # Rate limiting
                        break

                    # Store reference keyword data from first batch
                    if reference_data is None and reference_keyword in interest_df.columns:
                        reference_data = interest_df[reference_keyword].copy()
                        logger.info(
                            f"📌 Stored reference data for '{reference_keyword}' "
                            f"(avg={reference_data.mean():.1f})"
                        )

                    # Calculate normalization factor for this batch
                    norm_factor = 1.0
                    if (
                        reference_data is not None
                        and reference_keyword in interest_df.columns
                    ):
                        current_ref_avg = interest_df[reference_keyword].mean()
                        baseline_ref_avg = reference_data.mean()
                        if current_ref_avg > 0:
                            norm_factor = baseline_ref_avg / current_ref_avg
                            logger.info(
                                f"🔧 Normalization factor: {norm_factor:.3f} "
                                f"(baseline: {baseline_ref_avg:.1f}, current: {current_ref_avg:.1f})"
                            )

                    # Process each keyword in original batch (skip reference if added)
                    for keyword in batch:
                        if keyword not in interest_df.columns:
                            continue

                        trend_data = self._parse_trend_data(
                            keyword=keyword,
                            interest_df=interest_df,
                            timeframe=timeframe,
                            geo=geo,
                            normalization_factor=norm_factor,
                        )

                        if trend_data:
                            all_trends.append(trend_data)
                            logger.info(
                                f"✓ {keyword}: Avg={trend_data.avg_interest:.1f}, "
                                f"Current={trend_data.current_interest} (norm: {norm_factor:.3f})"
                            )

                    # Also process reference keyword if this is the first batch
                    if i == 0 and reference_keyword in interest_df.columns:
                        ref_trend_data = self._parse_trend_data(
                            keyword=reference_keyword,
                            interest_df=interest_df,
                            timeframe=timeframe,
                            geo=geo,
                            normalization_factor=1.0,  # Reference is baseline
                        )
                        if ref_trend_data:
                            all_trends.append(ref_trend_data)
                            logger.info(
                                f"✓ {reference_keyword} (baseline): Avg={ref_trend_data.avg_interest:.1f}, "
                                f"Current={ref_trend_data.current_interest}"
                            )

                    # Get related queries for first keyword in batch
                    try:
                        related = self.pytrends.related_queries()
                        if related and batch[0] in related:
                            # Store in trend data
                            for trend in all_trends:
                                if trend.keyword == batch[0]:
                                    trend.related_queries = self._format_related_queries(
                                        related[batch[0]]
                                    )
                                    break
                    except Exception as e:
                        logger.debug(f"No related queries: {e}")

                    # Success - break retry loop
                    break

                except Exception as e:
                    error_msg = str(e)

                    # Check if rate limited
                    if "429" in error_msg or "Too Many Requests" in error_msg:
                        if attempt < max_retries - 1:
                            # Exponential backoff with jitter
                            delay = base_delay * (2 ** attempt) + random.uniform(0, 5)
                            logger.warning(
                                f"⏳ Rate limited. Waiting {delay:.1f}s before retry "
                                f"({attempt + 1}/{max_retries})..."
                            )
                            time.sleep(delay)
                        else:
                            logger.error(
                                f"❌ Failed to fetch batch {batch} after {max_retries} attempts: {e}"
                            )
                    else:
                        logger.error(f"❌ Failed to fetch batch {batch}: {e}")
                        break

            # Rate limiting between batches (randomized to avoid patterns)
            if i + max_keywords_per_request < len(keywords):
                delay = random.uniform(12, 18)
                logger.info(f"⏸️  Waiting {delay:.1f}s before next batch...")
                time.sleep(delay)

        logger.info(f"\n✅ Fetched trends for {len(all_trends)} keywords")
        return all_trends

    def _parse_trend_data(
        self,
        keyword: str,
        interest_df,
        timeframe: str,
        geo: str,
        normalization_factor: float = 1.0,
    ) -> Optional[TrendData]:
        """Parse trend data from DataFrame and apply normalization."""
        try:
            series = interest_df[keyword]

            # Calculate metrics with normalization
            avg_interest = float(series.mean() * normalization_factor)
            peak_interest = int(series.max() * normalization_factor)
            current_interest = int(series.iloc[-1] * normalization_factor)

            # Convert time series to list with normalization
            time_series = []
            for date, value in series.items():
                time_series.append(
                    {
                        "date": date.strftime("%Y-%m-%d"),
                        "value": int(value * normalization_factor),
                    }
                )

            # Determine category
            category = self._get_category(keyword)

            # Generate ID
            trend_id = f"trend_{keyword.replace(' ', '_').lower()}_global"

            return TrendData(
                id=trend_id,
                keyword=keyword,
                category=category,
                current_interest=current_interest,
                avg_interest=avg_interest,
                peak_interest=peak_interest,
                time_series=time_series,
                related_queries=[],
            )

        except Exception as e:
            logger.debug(f"Error parsing trend for {keyword}: {e}")
            return None

    def _get_category(self, keyword: str) -> str:
        """Determine category for keyword."""
        for category, keywords in self.RAG_KEYWORDS.items():
            if keyword in keywords:
                return category
        return "other"

    def _format_related_queries(self, related_data: Dict) -> List[Dict]:
        """Format related queries data."""
        queries = []

        # Top queries
        if "top" in related_data and related_data["top"] is not None:
            top_df = related_data["top"]
            for _, row in top_df.head(5).iterrows():
                queries.append(
                    {"query": row["query"], "value": int(row["value"]), "type": "top"}
                )

        # Rising queries
        if "rising" in related_data and related_data["rising"] is not None:
            rising_df = related_data["rising"]
            for _, row in rising_df.head(5).iterrows():
                queries.append(
                    {
                        "query": row["query"],
                        "value": str(row["value"]),  # Can be "Breakout"
                        "type": "rising",
                    }
                )

        return queries

    def save_trends(
        self, trends: List[TrendData], filename: str = "google_trends.json"
    ):
        """Save trends to JSON file."""
        filepath = self.output_dir / filename
        trends_dict = [asdict(trend) for trend in trends]

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(trends_dict, f, indent=2, ensure_ascii=False)

        logger.info(f"💾 Saved {len(trends)} trends to {filepath}")
        return filepath

    def analyze_trends(self, trends: List[TrendData]) -> Dict:
        """Analyze trend patterns and rankings."""
        # Sort by current interest
        sorted_trends = sorted(trends, key=lambda t: t.current_interest, reverse=True)

        # Category breakdown
        categories = {}
        for trend in trends:
            cat = trend.category
            if cat not in categories:
                categories[cat] = {"count": 0, "avg_interest": 0, "rising_count": 0}
            categories[cat]["count"] += 1
            categories[cat]["avg_interest"] += trend.avg_interest

        # Calculate averages
        for cat in categories:
            categories[cat]["avg_interest"] /= categories[cat]["count"]

        return {
            "total_keywords": len(trends),
            "categories": categories,
            "top_10_by_interest": [
                {
                    "rank": i + 1,
                    "keyword": t.keyword,
                    "category": t.category,
                    "current_interest": t.current_interest,
                }
                for i, t in enumerate(sorted_trends[:10])
            ],
        }


def main():
    """Main entry point for Google Trends fetcher."""
    fetcher = GoogleTrendsFetcher()

    # Fetch trends for all predefined keywords
    all_keywords = []
    for category_keywords in fetcher.RAG_KEYWORDS.values():
        all_keywords.extend(category_keywords)

    num_batches = (len(all_keywords) + 4) // 5  # 5 keywords per batch
    estimated_minutes = num_batches * 0.25  # ~15s per batch
    logger.info(
        f"\n⏱️  Fetching {len(all_keywords)} keywords in {num_batches} batches "
        f"(~{estimated_minutes:.0f} minutes with rate limiting)\n"
    )

    trends = fetcher.fetch_trends(
        keywords=all_keywords,
        timeframe="today 12-m",  # Last 12 months
        geo="",  # Worldwide
    )

    if trends:
        fetcher.save_trends(trends, "google_trends.json")

        # Analyze
        analysis = fetcher.analyze_trends(trends)

        # Display results
        logger.info("\n" + "=" * 60)
        logger.info("📊 GOOGLE TRENDS ANALYSIS")
        logger.info("=" * 60)
        logger.info(f"Total keywords tracked: {analysis['total_keywords']}")

        logger.info("\n📋 Category breakdown:")
        for category, stats in analysis["categories"].items():
            logger.info(
                f"  {category}: {stats['count']} keywords, "
                f"avg interest={stats['avg_interest']:.1f}, "
                f"rising={stats['rising_count']}"
            )

        logger.info("\n🏆 Top 10 by current search interest:")
        for item in analysis["top_10_by_interest"]:
            logger.info(
                f"  #{item['rank']:2d} {item['keyword']:<25} "
                f"Interest={item['current_interest']:3d} "
                f"({item['trend']})"
            )

        logger.info("=" * 60 + "\n")
        logger.info("✅ Google Trends fetch complete!")
        logger.info("💡 This shows public search interest trends")
        logger.info("Next step: Run Supabase ingestion pipeline")
    else:
        logger.error("❌ No trends fetched.")


if __name__ == "__main__":
    main()
