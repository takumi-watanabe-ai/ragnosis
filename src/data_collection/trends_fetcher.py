"""
Google Trends fetcher for RAG/LLM search interest signals.

Tracks public search interest to predict adoption trends.
"""

import json
import logging
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

        all_trends = []

        # Process in batches (Google Trends limit: 5 keywords per request)
        for i in range(0, len(keywords), max_keywords_per_request):
            batch = keywords[i : i + max_keywords_per_request]
            logger.info(f"\n🔍 Processing batch: {', '.join(batch)}")

            try:
                # Build payload
                self.pytrends.build_payload(batch, timeframe=timeframe, geo=geo)

                # Get interest over time
                interest_df = self.pytrends.interest_over_time()

                if interest_df.empty:
                    logger.warning(f"⚠️  No data for batch: {batch}")
                    time.sleep(2)  # Rate limiting
                    continue

                # Process each keyword in batch
                for keyword in batch:
                    if keyword not in interest_df.columns:
                        continue

                    trend_data = self._parse_trend_data(
                        keyword=keyword,
                        interest_df=interest_df,
                        timeframe=timeframe,
                        geo=geo,
                    )

                    if trend_data:
                        all_trends.append(trend_data)
                        logger.info(
                            f"✓ {keyword}: Avg={trend_data.avg_interest:.1f}, "
                            f"Current={trend_data.current_interest}"
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

                # Rate limiting
                time.sleep(2)

            except Exception as e:
                logger.error(f"❌ Failed to fetch batch {batch}: {e}")
                time.sleep(5)
                continue

        logger.info(f"\n✅ Fetched trends for {len(all_trends)} keywords")
        return all_trends

    def _parse_trend_data(
        self, keyword: str, interest_df, timeframe: str, geo: str
    ) -> Optional[TrendData]:
        """Parse trend data from DataFrame."""
        try:
            series = interest_df[keyword]

            # Calculate metrics
            avg_interest = float(series.mean())
            peak_interest = int(series.max())
            current_interest = int(series.iloc[-1])

            # Convert time series to list
            time_series = []
            for date, value in series.items():
                time_series.append(
                    {"date": date.strftime("%Y-%m-%d"), "value": int(value)}
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
