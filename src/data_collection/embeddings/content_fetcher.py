"""
Content fetcher for external APIs (HuggingFace, GitHub).

Responsible for fetching model cards and README files from external sources.
"""

import logging
import base64
import re
from typing import Optional

import requests
from huggingface_hub import ModelCard

logger = logging.getLogger(__name__)


class ContentFetcher:
    """Fetches content from HuggingFace and GitHub APIs."""

    @staticmethod
    def clean_markdown_html(text: str) -> str:
        """
        Clean markdown and HTML from text content for better embedding quality.

        Removes:
        - HTML tags (<div>, <img>, <a>, etc.)
        - Markdown links (keep link text, remove URL)
        - Markdown images (remove entirely)
        - Excessive whitespace and newlines
        - Markdown code fences (keep code content)
        - HTML entities

        Args:
            text: Raw markdown/HTML text

        Returns:
            Cleaned plain text
        """
        if not text:
            return ""

        # Remove HTML comments
        text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)

        # Remove HTML tags but keep content
        text = re.sub(r'<[^>]+>', ' ', text)

        # Convert markdown images to nothing (they have no semantic value)
        text = re.sub(r'!\[.*?\]\(.*?\)', '', text)

        # Convert markdown links to just the link text
        text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

        # Remove markdown code fences but keep content
        text = re.sub(r'```[\w]*\n', '\n', text)
        text = re.sub(r'```', '', text)

        # Remove markdown headers (# ## ###) but keep text
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

        # Remove markdown bold/italic markers
        text = re.sub(r'\*\*([^\*]+)\*\*', r'\1', text)  # **bold**
        text = re.sub(r'\*([^\*]+)\*', r'\1', text)      # *italic*
        text = re.sub(r'__([^_]+)__', r'\1', text)       # __bold__
        text = re.sub(r'_([^_]+)_', r'\1', text)         # _italic_

        # Remove HTML entities
        text = re.sub(r'&[a-zA-Z]+;', ' ', text)
        text = re.sub(r'&#\d+;', ' ', text)

        # Collapse multiple newlines/whitespace
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        text = re.sub(r' +', ' ', text)

        # Remove leading/trailing whitespace from each line
        text = '\n'.join(line.strip() for line in text.split('\n'))

        # Final trim
        return text.strip()

    def fetch_hf_model_card(self, model_name: str, hf_token: Optional[str] = None) -> Optional[str]:
        """
        Fetch HuggingFace model card using ModelCard API.

        Args:
            model_name: HuggingFace model name (e.g., "Supabase/gte-small")
            hf_token: Optional HuggingFace API token

        Returns:
            Model card README content as string, or None if not found
        """
        try:
            card = ModelCard.load(model_name, token=hf_token)
            # Clean markdown/HTML for better embedding quality
            return self.clean_markdown_html(card.content) if card.content else None
        except Exception as e:
            logger.warning(f"   ⚠️ Failed to fetch model card for {model_name}: {e}")
            return None

    def fetch_github_readme(self, repo_name: str, github_token: Optional[str] = None) -> Optional[str]:
        """
        Fetch GitHub README content.

        Args:
            repo_name: GitHub repository name (e.g., "langflow-ai/langflow")
            github_token: Optional GitHub personal access token

        Returns:
            README content as string, or None if not found
        """
        # Try common README filenames
        readme_filenames = ["README.md", "readme.md", "Readme.md", "README"]

        headers = {}
        if github_token:
            headers["Authorization"] = f"token {github_token}"

        for filename in readme_filenames:
            url = f"https://api.github.com/repos/{repo_name}/contents/{filename}"
            try:
                response = requests.get(url, headers=headers, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    # Decode base64 content
                    content = base64.b64decode(data["content"]).decode("utf-8")
                    # Clean markdown/HTML for better embedding quality
                    return self.clean_markdown_html(content)
            except Exception as e:
                logger.debug(f"   ⚠️ Failed to fetch {filename} for {repo_name}: {e}")
                continue

        logger.warning(f"   ⚠️ No README found for {repo_name}")
        return None

    def extract_description_from_text(self, text: str, max_length: int = 200) -> str:
        """
        Extract description from text (first ~200 characters).

        Args:
            text: Full text content
            max_length: Maximum description length

        Returns:
            Truncated description string
        """
        if not text:
            return ""

        # Take first ~200 chars, break at sentence or word boundary
        if len(text) <= max_length:
            return text.strip()

        # Find sentence boundary
        truncated = text[:max_length]
        last_period = truncated.rfind(". ")
        if last_period > max_length // 2:
            return text[: last_period + 1].strip()

        # Find word boundary
        last_space = truncated.rfind(" ")
        if last_space > 0:
            return text[:last_space].strip() + "..."

        return truncated.strip() + "..."
