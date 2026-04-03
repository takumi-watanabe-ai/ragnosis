"""
HuggingFace models fetcher for RAG/LLM adoption signals.

Fetches TOP trending models to track RAG market share and ranking changes over time.
"""

import logging
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from huggingface_hub import HfApi

from rag_taxonomy import RAG_TAXONOMY

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class HFModel:
    """HuggingFace model data model with ranking context."""

    id: str
    model_name: str
    task: str
    downloads: int
    likes: int
    last_updated: Optional[str]
    description: str
    tags: List[str]
    rag_categories: List[str]
    author: str
    url: str
    ranking_position: int  # Position in overall top models
    source: str = "huggingface"
    scraped_at: str = datetime.now().isoformat()


class HFModelFetcher:
    """Fetcher for HuggingFace model market share and ranking."""

    API_URL = "https://huggingface.co/api/models"

    def __init__(self, output_dir: str = "data", api_token: Optional[str] = None, supabase_client: Optional[Any] = None):
        """Initialize fetcher."""
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.api_token = api_token
        self.hf_api = HfApi(token=api_token)
        self.supabase = supabase_client

    def _has_data_for_today(self) -> bool:
        """Check if HuggingFace models data already exists for today."""
        if not self.supabase:
            return False

        try:
            today = date.today().isoformat()
            result = self.supabase.table("hf_models").select("id").eq("snapshot_date", today).limit(1).execute()
            has_data = len(result.data) > 0

            if has_data:
                logger.info(f"✓ HuggingFace models data already exists for {today}")

            return has_data
        except Exception as e:
            logger.debug(f"Error checking for existing data: {e}")
            return False

    def fetch_by_tags(
        self,
        max_per_tag: int = 50,
        min_downloads: int = 100,
    ) -> List[HFModel]:
        """
        Fetch models using TARGETED tag-based search.

        This captures:
        - High-quality models regardless of absolute ranking
        - Specialized models (rerankers, embeddings) that may have lower downloads
        - Better coverage of RAG ecosystem niches

        Args:
            max_per_tag: Max models to fetch per tag (recommended: 30-100)
            min_downloads: Minimum downloads threshold for quality

        Returns:
            Deduplicated list of RAG models from targeted searches
        """
        # Check if data already exists for today
        if self._has_data_for_today():
            logger.info("⏭️  Skipping HuggingFace fetch - data already exists for today")
            return []

        logger.info(f"📥 Fetching models via targeted tag search...")
        logger.info(f"   Max per tag: {max_per_tag}, Min downloads: {min_downloads}")

        seen_ids = set()
        all_models = []
        ranking_position = 1

        try:
            # Search by each category's tags
            for category_id, config in RAG_TAXONOMY.items():
                logger.info(f"\n🔍 Searching category: {config['name']}")

                for tag in config["hf_tags"]:
                    logger.info(f"   Tag: {tag}")

                    try:
                        # Search with specific tag filter
                        model_infos = list(
                            self.hf_api.list_models(
                                filter=tag,
                                sort="downloads",
                                direction=-1,
                                limit=max_per_tag,
                                full=True,
                            )
                        )

                        for model_info in model_infos:
                            model_id = model_info.id

                            # Skip duplicates
                            if model_id in seen_ids:
                                continue

                            # Check minimum quality threshold
                            downloads = getattr(model_info, "downloads", 0) or 0
                            if downloads < min_downloads:
                                continue

                            model = self._parse_model_info(
                                model_info, ranking_position=ranking_position
                            )

                            if model and self._is_valid_model(model):
                                all_models.append(model)
                                seen_ids.add(model_id)
                                ranking_position += 1

                                logger.info(
                                    f"      ✓ {model.model_name} "
                                    f"({model.downloads:,} downloads)"
                                )

                    except Exception as e:
                        logger.debug(f"   Error fetching tag '{tag}': {e}")
                        continue

            # Sort by downloads for final ranking
            all_models.sort(key=lambda m: m.downloads, reverse=True)

            # Update ranking positions after sort
            for idx, model in enumerate(all_models):
                model.ranking_position = idx + 1

            logger.info(f"\n✅ Fetched {len(all_models)} unique models via tag search")
            logger.info(f"   Covered {len(RAG_TAXONOMY)} categories")

            return all_models

        except Exception as e:
            logger.error(f"❌ Failed to fetch models by tags: {e}")
            return []

    def _parse_model_info(self, model_info, ranking_position: int) -> Optional[HFModel]:
        """Parse ModelInfo object from Hub API and classify if RAG-related."""
        try:
            model_name = model_info.id
            if not model_name:
                return None

            # Extract metadata from ModelInfo
            downloads = getattr(model_info, "downloads", 0) or 0
            likes = getattr(model_info, "likes", 0) or 0
            last_updated = getattr(model_info, "lastModified", None)
            if last_updated:
                last_updated = (
                    last_updated.isoformat()
                    if hasattr(last_updated, "isoformat")
                    else str(last_updated)
                )

            # Extract tags
            all_tags = getattr(model_info, "tags", []) or []
            all_tags = [str(t) for t in all_tags if t]

            # Extract task
            task = getattr(model_info, "pipeline_tag", "unknown") or "unknown"

            # Skip description fetch during pipeline (optimization - will fetch during embedding)
            # Description is extracted from full model card during embedding phase
            description = ""

            # Filter: only keep RAG-related models (don't store flag, just filter)
            if not self._is_rag_related(all_tags, task, model_name, description):
                return None

            # Filter tags to only include those in RAG_TAXONOMY
            tags = self._filter_relevant_tags(all_tags, task)

            # Extract author
            author = getattr(model_info, "author", None) or (
                model_name.split("/")[0] if "/" in model_name else "unknown"
            )

            # Generate URL and ID
            url = f"https://huggingface.co/{model_name}"
            model_id = f"hf_model_{model_name.replace('/', '_')}"

            # Map tags to RAG categories
            rag_categories = self._map_tags_to_categories(tags, task)

            return HFModel(
                id=model_id,
                model_name=model_name,
                task=task,
                downloads=downloads,
                likes=likes,
                last_updated=last_updated,
                description=description,
                tags=tags,
                rag_categories=rag_categories,
                author=author,
                url=url,
                ranking_position=ranking_position,
            )

        except Exception as e:
            logger.debug(f"Error parsing model: {e}")
            return None

    def _filter_relevant_tags(self, tags: List[str], task: str) -> List[str]:
        """Filter tags to only include those defined in RAG_TAXONOMY."""
        # Collect all valid HF tags from taxonomy
        valid_tags = set()
        for config in RAG_TAXONOMY.values():
            valid_tags.update(t.lower() for t in config["hf_tags"])

        # Filter to only include taxonomy tags (case-insensitive match)
        # Also always include the task if it's relevant
        filtered = []
        tags_with_task = tags + [task] if task != "unknown" else tags

        for tag in tags_with_task:
            if tag.lower() in valid_tags:
                filtered.append(tag)

        return filtered

    def _map_tags_to_categories(self, tags: List[str], task: str) -> List[str]:
        """Map model tags and task to RAG taxonomy categories."""
        categories = set()
        tags_and_task = [t.lower() for t in tags] + [task.lower()]

        for category_id, config in RAG_TAXONOMY.items():
            # Check if any tag/task matches this category's hf_tags
            for hf_tag in config["hf_tags"]:
                if hf_tag.lower() in tags_and_task:
                    categories.add(category_id)
                    break

        return sorted(list(categories))

    def _is_rag_related(
        self, tags: List[str], task: str, name: str, description: str
    ) -> bool:
        """Determine if model is RAG/embedding/retrieval related (for filtering)."""
        # Collect all relevant tags from taxonomy
        all_hf_tags = set()
        all_keywords = set()
        for category in RAG_TAXONOMY.values():
            all_hf_tags.update(t.lower() for t in category["hf_tags"])
            all_keywords.update(k.lower() for k in category["keywords"])

        # Check tags
        for tag in tags:
            if tag.lower() in all_hf_tags:
                return True

        # Check task
        if task.lower() in all_hf_tags:
            return True

        # Check name/description for keywords
        text = f"{name} {description}".lower()
        if not any(keyword in text for keyword in all_keywords):
            return False

        # If we matched broad keywords (llm, agent), exclude obvious non-RAG false positives
        exclude_keywords = [
            "stable-diffusion", "dall-e", "midjourney", "flux", "sdxl",
            "image generation", "text-to-image", "controlnet",
            "object detection", "face detection", "yolo",
        ]

        for exclude in exclude_keywords:
            if exclude in text:
                return False

        return True

    def _is_valid_model(self, model: HFModel) -> bool:
        """Basic quality filter (very permissive since we want all top models)."""
        # Only filter obvious junk
        if model.downloads < 10:
            return False
        return True
