"""
GitHub repository fetcher for RAG/LLM framework adoption signals.

Fetches TOP repos overall to track RAG framework market share and ranking.
"""

import logging
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import requests

from rag_taxonomy import RAG_TAXONOMY

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class GitHubRepo:
    """GitHub repository data model with ranking context."""

    id: str
    repo_name: str
    owner: str
    description: str
    stars: int
    forks: int
    watchers: int
    open_issues: int
    language: str
    topics: List[str]
    rag_categories: List[str]
    created_at: str
    updated_at: str
    url: str
    ranking_position: int  # Position in overall top repos
    source: str = "github"
    scraped_at: str = datetime.now().isoformat()


class GitHubFetcher:
    """Fetcher for GitHub repository market share and ranking."""

    API_URL = "https://api.github.com"
    GRAPHQL_URL = "https://api.github.com/graphql"

    def __init__(self, output_dir: str = "data", api_token: Optional[str] = None, supabase_client: Optional[Any] = None):
        """Initialize fetcher."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.api_token = api_token
        self.supabase = supabase_client

        if api_token:
            self.session.headers.update(
                {
                    "Authorization": f"Bearer {api_token}",
                    "Accept": "application/vnd.github.v3+json",
                }
            )
        else:
            self.session.headers.update({"Accept": "application/vnd.github.v3+json"})

    def _has_data_for_today(self) -> bool:
        """Check if GitHub repos data already exists for today."""
        if not self.supabase:
            return False

        try:
            today = date.today().isoformat()
            result = self.supabase.table("github_repos").select("id").eq("snapshot_date", today).limit(1).execute()
            has_data = len(result.data) > 0

            if has_data:
                logger.info(f"✓ GitHub repos data already exists for {today}")

            return has_data
        except Exception as e:
            logger.debug(f"Error checking for existing data: {e}")
            return False

    def _graphql_search(
        self, topic: str, min_stars: int, max_results: int = 100
    ) -> List[Dict]:
        """
        Search repos using GraphQL API (5000/hour limit vs REST Search's 30/hour).

        Args:
            topic: GitHub topic to search for
            min_stars: Minimum star count
            max_results: Maximum results to return (max 100 per query)

        Returns:
            List of repository data dictionaries
        """
        query = f"""
        query {{
          search(query: "topic:{topic} stars:>={min_stars}", type: REPOSITORY, first: {min(max_results, 100)}) {{
            nodes {{
              ... on Repository {{
                nameWithOwner
                owner {{ login }}
                description
                stargazerCount
                forkCount
                watchers {{ totalCount }}
                issues(states: OPEN) {{ totalCount }}
                primaryLanguage {{ name }}
                repositoryTopics(first: 20) {{
                  nodes {{
                    topic {{ name }}
                  }}
                }}
                createdAt
                updatedAt
                url
              }}
            }}
          }}
        }}
        """

        try:
            response = self.session.post(
                self.GRAPHQL_URL,
                json={"query": query},
                timeout=10
            )

            if response.status_code == 403:
                logger.warning("⚠️  Rate limit - skipping remaining topics")
                return []

            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                logger.warning(f"GraphQL errors: {data['errors']}")
                return []

            # Convert GraphQL response to REST-like format for compatibility
            repos = []
            nodes = data.get("data", {}).get("search", {}).get("nodes", [])

            for node in nodes:
                if not node:
                    continue

                # Extract topics
                topics = [
                    t["topic"]["name"]
                    for t in node.get("repositoryTopics", {}).get("nodes", [])
                    if t and t.get("topic")
                ]

                # Convert to REST API format
                repo_data = {
                    "full_name": node.get("nameWithOwner", ""),
                    "owner": {"login": node.get("owner", {}).get("login", "")},
                    "description": node.get("description", ""),
                    "stargazers_count": node.get("stargazerCount", 0),
                    "forks_count": node.get("forkCount", 0),
                    "watchers_count": node.get("watchers", {}).get("totalCount", 0),
                    "open_issues_count": node.get("issues", {}).get("totalCount", 0),
                    "language": node.get("primaryLanguage", {}).get("name", "") if node.get("primaryLanguage") else "",
                    "topics": topics,
                    "created_at": node.get("createdAt", ""),
                    "updated_at": node.get("updatedAt", ""),
                    "html_url": node.get("url", ""),
                }
                repos.append(repo_data)

            return repos

        except requests.RequestException as e:
            logger.debug(f"GraphQL query error: {e}")
            return []

    def fetch_by_topics(
        self,
        max_per_topic: int = 10,
        min_stars: int = 500,
        min_months_since_update: int = 12,
    ) -> List[GitHubRepo]:
        """
        Fetch repos using TARGETED topic-based search with quality filters.

        Args:
            max_per_topic: Max repos per topic (default: 10)
            min_stars: Minimum stars threshold for quality (default: 500)
            min_months_since_update: Only include repos updated within this many months (default: 12)

        Returns:
            Deduplicated list of high-quality, active RAG repos
        """
        # Check if data already exists for today
        if self._has_data_for_today():
            logger.info("⏭️  Skipping GitHub fetch - data already exists for today")
            return []

        logger.info(f"📥 Fetching repos via targeted topic search...")
        logger.info(f"   Max per topic: {max_per_topic}, Min stars: {min_stars}")
        logger.info(f"   Recent activity: updated within {min_months_since_update} months")
        
        # Calculate cutoff date for recency filter (timezone-naive for comparison)
        cutoff_date = datetime.now() - timedelta(days=min_months_since_update * 30)

        seen_ids = set()
        all_repos = []
        ranking_position = 1
        skipped_inactive = 0

        try:
            # Search by each category's topics
            for category_id, config in RAG_TAXONOMY.items():
                logger.info(f"\n🔍 Searching category: {config['name']}")

                for topic in config["github_topics"]:
                    logger.info(f"   Topic: {topic}")

                    try:
                        # Use GraphQL API (5000/hour limit vs REST's 30/hour)
                        repo_results = self._graphql_search(
                            topic=topic,
                            min_stars=min_stars,
                            max_results=max_per_topic
                        )

                        if not repo_results:
                            continue

                        for repo_data in repo_results:
                            repo_name = repo_data.get("full_name", "")

                            # Skip duplicates
                            if repo_name in seen_ids:
                                continue

                            # Check recency filter
                            updated_at_str = repo_data.get("updated_at", "")
                            if updated_at_str:
                                try:
                                    # Parse as timezone-aware, then convert to naive for comparison
                                    updated_at = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
                                    updated_at_naive = updated_at.replace(tzinfo=None)
                                    if updated_at_naive < cutoff_date:
                                        skipped_inactive += 1
                                        continue
                                except (ValueError, AttributeError):
                                    pass  # If parsing fails, include the repo

                            repo = self._parse_repo(
                                repo_data,
                                ranking_position=ranking_position
                            )

                            # Filter: only keep RAG-related repos
                            if repo and self._is_rag_related(repo.repo_name, repo.description, repo.topics):
                                all_repos.append(repo)
                                seen_ids.add(repo_name)
                                ranking_position += 1

                                logger.info(
                                    f"      ✓ {repo.repo_name} "
                                    f"({repo.stars:,}⭐)"
                                )
                                
                    except requests.RequestException as e:
                        logger.debug(f"   Error fetching topic '{topic}': {e}")
                        continue
                        
            # Sort by stars for final ranking
            all_repos.sort(key=lambda r: r.stars, reverse=True)
            
            # Update ranking positions after sort
            for idx, repo in enumerate(all_repos):
                repo.ranking_position = idx + 1

            logger.info(f"\n✅ Fetched {len(all_repos)} unique repos via topic search")
            logger.info(f"   Covered {len(RAG_TAXONOMY)} categories")
            logger.info(f"   Skipped {skipped_inactive} inactive repos (not updated in {min_months_since_update} months)")

            return all_repos
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch repos by topics: {e}")
            return []

    def _parse_repo(self, data: Dict, ranking_position: int) -> Optional[GitHubRepo]:
        """Parse repo data and classify if RAG-related."""
        try:
            repo_name = data.get("full_name", "")
            if not repo_name:
                return None

            owner = data.get("owner", {}).get("login", "")
            # Skip description (will extract from README during embedding for consistency)
            description = ""
            stars = data.get("stargazers_count", 0)
            forks = data.get("forks_count", 0)
            watchers = data.get("watchers_count", 0)
            open_issues = data.get("open_issues_count", 0)
            language = data.get("language", "")
            all_topics = data.get("topics", [])
            created_at = data.get("created_at", "")
            updated_at = data.get("updated_at", "")
            url = data.get("html_url", "")

            # Filter topics to only include those in RAG_TAXONOMY
            topics = self._filter_relevant_topics(all_topics)

            # Generate ID
            repo_id = f"gh_repo_{repo_name.replace('/', '_')}"

            # Map topics to RAG categories
            rag_categories = self._map_topics_to_categories(topics)

            return GitHubRepo(
                id=repo_id,
                repo_name=repo_name,
                owner=owner,
                description=description,
                stars=stars,
                forks=forks,
                watchers=watchers,
                open_issues=open_issues,
                language=language,
                topics=topics,
                rag_categories=rag_categories,
                created_at=created_at,
                updated_at=updated_at,
                url=url,
                ranking_position=ranking_position
            )

        except Exception as e:
            logger.debug(f"Error parsing repo: {e}")
            return None

    def _filter_relevant_topics(self, topics: List[str]) -> List[str]:
        """Filter topics to only include those defined in RAG_TAXONOMY."""
        # Collect all valid GitHub topics from taxonomy
        valid_topics = set()
        for config in RAG_TAXONOMY.values():
            valid_topics.update(t.lower() for t in config["github_topics"])

        # Filter to only include taxonomy topics (case-insensitive match)
        filtered = []
        for topic in topics:
            if topic.lower() in valid_topics:
                filtered.append(topic)

        return filtered

    def _map_topics_to_categories(self, topics: List[str]) -> List[str]:
        """Map repo topics to RAG taxonomy categories."""
        categories = set()
        topics_lower = [t.lower() for t in topics]

        for category_id, config in RAG_TAXONOMY.items():
            # Check if any repo topic matches this category's github_topics
            for github_topic in config["github_topics"]:
                if github_topic.lower() in topics_lower:
                    categories.add(category_id)
                    break

        return sorted(list(categories))

    def _is_rag_related(
        self, repo_name: str, description: str, topics: List[str]
    ) -> bool:
        """Determine if repo is RAG/retrieval/embedding related (for filtering)."""
        text = f"{repo_name} {description} {' '.join(topics)}".lower()

        # First check if matches taxonomy
        matched = False
        for category in RAG_TAXONOMY.values():
            # Check keywords
            for keyword in category["keywords"]:
                if keyword.lower() in text:
                    matched = True
                    break

            # Check GitHub topics
            if not matched:
                for topic in category["github_topics"]:
                    if topic.lower() in text:
                        matched = True
                        break

            if matched:
                break

        if not matched:
            return False

        # If matched broad keywords, exclude obvious non-RAG false positives
        exclude_keywords = [
            "ui framework", "css framework", "alpine", "tailwind",
            "web framework", "frontend framework", "react component",
            "crud", "admin panel", "dashboard template",
            "stable-diffusion", "image generation", "midjourney",
        ]

        for exclude in exclude_keywords:
            if exclude in text:
                return False

        return True

