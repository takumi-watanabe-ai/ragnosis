"""
RAGnosis Streamlit Dashboard - RAG Chatbot for AI Job Market Intelligence.

Ask questions about RAG/AI job market trends and get answers grounded in real data.
This UI calls a Supabase Edge Function which handles RAG logic and Ollama integration.
"""

import os
import requests
from typing import Dict
from dotenv import load_dotenv
from urllib.parse import urlparse

import streamlit as st

# Load environment variables
load_dotenv()

# Configure page
st.set_page_config(
    page_title="RAGnosis - AI Job Market Intelligence",
    page_icon="🔬",
    layout="wide",
    initial_sidebar_state="expanded"
)


class EdgeFunctionClient:
    """Client for calling the RAG edge function."""

    def __init__(self, edge_function_url: str, supabase_key: str = None):
        """Initialize edge function client."""
        self.edge_function_url = edge_function_url
        self.headers = {"Content-Type": "application/json"}

        # Add authorization header if key is provided (for production)
        if supabase_key:
            self.headers["Authorization"] = f"Bearer {supabase_key}"

    def ask_question(self, query: str, top_k: int = 5) -> Dict:
        """
        Send question to edge function and get RAG response.

        Args:
            query: User question
            top_k: Number of documents to retrieve

        Returns:
            Dictionary with answer, sources, and metadata
        """
        try:
            response = requests.post(
                self.edge_function_url,
                json={"query": query, "top_k": top_k},
                headers=self.headers,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "answer": f"Error: Edge function returned status {response.status_code}",
                    "sources": [],
                    "confidence": "error",
                    "error": response.text
                }

        except requests.exceptions.Timeout:
            return {
                "answer": "Request timed out. The model might be loading or the server is busy.",
                "sources": [],
                "confidence": "error"
            }
        except Exception as e:
            return {
                "answer": f"Error calling edge function: {str(e)}",
                "sources": [],
                "confidence": "error"
            }


@st.cache_resource
def initialize_client():
    """Initialize and cache the edge function client."""
    # Get edge function URL from environment
    edge_function_url = os.getenv("EDGE_FUNCTION_URL")
    supabase_key = os.getenv("SUPABASE_KEY")

    # Validate required config
    if not edge_function_url:
        st.error("Missing EDGE_FUNCTION_URL in .env file.")
        st.info("For local development, use: http://localhost:54321/functions/v1/rag-chat")
        st.stop()

    # For local development with --no-verify-jwt, key is optional
    if not supabase_key and "localhost" not in edge_function_url:
        st.error("Missing SUPABASE_KEY in .env file (required for production).")
        st.stop()

    try:
        client = EdgeFunctionClient(
            edge_function_url=edge_function_url,
            supabase_key=supabase_key
        )
        return client
    except Exception as e:
        st.error(f"Failed to initialize client: {e}")
        st.stop()


def main():
    """Main Streamlit app."""
    # Header
    st.title("🔬 RAGnosis")
    st.subheader("RAG Market Intelligence + Expert Troubleshooting")
    st.markdown("Ask about RAG models, frameworks, trends, or get expert help with implementation challenges")

    # Initialize settings with defaults
    show_sources = True
    show_confidence = False
    top_k = 5

    # Sidebar
    with st.sidebar:
        st.header("💡 Example Questions")
        st.caption("Click any question to try it")

        # Market Intelligence
        st.markdown("**📊 Market Intelligence**")
        example_questions_market = [
            "What are the top embedding models?",
            "Most popular RAG frameworks",
            "Best reranking models",
            "Top vector databases by popularity",
            "RAG trends over time"
        ]

        for q in example_questions_market:
            if st.button(q, key=f"market_{q}", use_container_width=True):
                st.session_state.clicked_question = q

        st.divider()

        # Implementation & Troubleshooting
        st.markdown("**🛠️ Implementation Help**")
        example_questions_impl = [
            "How to fix chunking errors in RAG?",
            "How to improve retrieval accuracy?",
            "Guide to choosing vector databases",
            "Best practices for RAG deployment",
            "What are similar tools like RAGAS?",
            "How to implement hybrid search?",
            "Reranking vs embedding models"
        ]

        for q in example_questions_impl:
            if st.button(q, key=f"impl_{q}", use_container_width=True):
                st.session_state.clicked_question = q

        st.divider()

        # Comparison Queries
        st.markdown("**⚖️ Comparisons**")
        example_questions_compare = [
            "LangChain vs LlamaIndex",
            "Pinecone vs Weaviate vs Qdrant",
            "OpenAI embeddings vs open source",
            "RAG vs fine-tuning"
        ]

        for q in example_questions_compare:
            if st.button(q, key=f"compare_{q}", use_container_width=True):
                st.session_state.clicked_question = q

        st.divider()

        # Settings (collapsed)
        with st.expander("⚙️ Settings"):
            show_sources = st.checkbox("Show sources", value=True)
            show_confidence = st.checkbox("Show confidence", value=False)
            top_k = st.slider("Sources to retrieve", 1, 10, 5)

        # Connection status (minimal)
        edge_function_url = os.getenv("EDGE_FUNCTION_URL", "Not configured")
        if "localhost" in edge_function_url:
            st.caption("🖥️ Local")
        else:
            st.caption("☁️ Cloud")

    # Initialize client
    client = initialize_client()

    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Handle clicked example questions
    if "clicked_question" in st.session_state:
        prompt = st.session_state.clicked_question
        del st.session_state.clicked_question  # Clear after use

        # Add to chat history and process
        st.session_state.messages.append({"role": "user", "content": prompt})

        # Generate response
        with st.spinner("Searching..."):
            result = client.ask_question(prompt, top_k=top_k)

        # Add assistant response
        st.session_state.messages.append({
            "role": "assistant",
            "content": result["answer"],
            "sources": result.get("sources", []),
            "confidence": result.get("confidence", "unknown")
        })

        # Rerun to display the new messages
        st.rerun()

    # Display chat history
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            # Display markdown content
            st.markdown(message["content"], unsafe_allow_html=False)

            # Show search results as cards if available
            if message["role"] == "assistant" and "sources" in message and show_sources:
                if message["sources"]:
                    st.markdown("### Search Results")
                    cols = st.columns(3, gap="small")  # Small gap between columns
                    for i, source in enumerate(message["sources"]):
                        col = cols[i % 3]
                        with col:
                            title = source['metadata']['title']
                            url = source['metadata']['url']

                            # Extract domain from URL
                            domain = urlparse(url).netloc

                            # Create compact card
                            st.markdown(f"""
                            <div style="border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin-bottom: 6px;">
                                <a href="{url}" target="_blank" style="text-decoration: none; color: inherit;">
                                    <div style="font-size: 13px; font-weight: 500; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis;">{title}</div>
                                    <div style="font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{domain}</div>
                                </a>
                            </div>
                            """, unsafe_allow_html=True)

    # Chat input
    if prompt := st.chat_input("Ask about RAG models, trends, or how to solve implementation challenges..."):
        # Add user message to history
        st.session_state.messages.append({"role": "user", "content": prompt})

        # Display user message
        with st.chat_message("user"):
            st.markdown(prompt)

        # Generate response
        with st.chat_message("assistant"):
            with st.spinner("Searching market data and expert knowledge base..."):
                result = client.ask_question(prompt, top_k=top_k)

            # Display markdown answer (now includes formatted sources)
            st.markdown(result["answer"], unsafe_allow_html=False)

            # Show confidence if enabled
            if show_confidence and "confidence" in result:
                confidence = result.get("confidence", "unknown")
                count = result.get("count", 0)
                confidence_emoji = "🟢" if confidence == "high" else "🟡" if confidence == "medium" else "🔴"
                st.info(f"{confidence_emoji} **Confidence:** {confidence} | **Sources:** {count}", icon="ℹ️")

            # Show search results as cards
            if show_sources and result.get("sources"):
                st.markdown("### Search Results")
                cols = st.columns(3, gap="small")  # Small gap between columns
                for i, source in enumerate(result["sources"]):
                    col = cols[i % 3]
                    with col:
                        title = source['metadata']['title']
                        url = source['metadata']['url']

                        # Extract domain from URL
                        domain = urlparse(url).netloc

                        # Create compact card
                        st.markdown(f"""
                        <div style="border: 1px solid #ddd; border-radius: 6px; padding: 8px; margin-bottom: 6px;">
                            <a href="{url}" target="_blank" style="text-decoration: none; color: inherit;">
                                <div style="font-size: 13px; font-weight: 500; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis;">{title}</div>
                                <div style="font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{domain}</div>
                            </a>
                        </div>
                        """, unsafe_allow_html=True)

        # Add assistant response to history
        st.session_state.messages.append({
            "role": "assistant",
            "content": result["answer"],
            "sources": result.get("sources", []),
            "confidence": result.get("confidence", "unknown")
        })


if __name__ == "__main__":
    main()
