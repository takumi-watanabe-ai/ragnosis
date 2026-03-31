#!/usr/bin/env python3
"""
RAGnosis RAGAS Evaluation Script v2

Evaluates RAGnosis using 4 core RAGAS metrics:
1. Faithfulness - Answer grounded in retrieved context (anti-hallucination)
2. Answer Relevance - Addresses the query
3. Context Precision - Retrieved docs are relevant
4. Answer Correctness - Factually accurate vs ground truth

Usage:
    python evaluate_ragnosis.py
    python evaluate_ragnosis.py --max_samples 10
    python evaluate_ragnosis.py --save_predictions
"""

import argparse
import json
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional
from tqdm import tqdm
import logging

# Disable RAGAS telemetry
os.environ["RAGAS_DO_NOT_TRACK"] = "true"

# Suppress logging noise
logging.getLogger('ragas').setLevel(logging.ERROR)
logging.getLogger('httpx').setLevel(logging.WARNING)

from datasets import Dataset
from ragas import evaluate
import warnings
warnings.filterwarnings('ignore', category=DeprecationWarning)

from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    answer_correctness,
)
from langchain_community.chat_models import ChatOllama
from langchain_community.embeddings import FastEmbedEmbeddings
import requests

# Configuration
DEFAULT_EDGE_FUNCTION_URL = os.getenv(
    "EDGE_FUNCTION_URL",
    "http://127.0.0.1:54321/functions/v1/rag-chat"
)
DEFAULT_LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")
DEFAULT_LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:3b-instruct")
DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
DEFAULT_GOLDEN_DATA = "golden_data/golden_dataset.jsonl"
DEFAULT_OUTPUT_DIR = "results"
DEFAULT_TIMEOUT = 60


class RAGnosisEvaluator:
    """Evaluator for RAGnosis using RAGAS metrics."""

    def __init__(
        self,
        edge_function_url: str = DEFAULT_EDGE_FUNCTION_URL,
        llm_model: str = DEFAULT_LLM_MODEL,
        llm_base_url: str = DEFAULT_LLM_BASE_URL,
        embedding_model: str = DEFAULT_EMBEDDING_MODEL,
        timeout: int = DEFAULT_TIMEOUT,
    ):
        self.edge_function_url = edge_function_url
        self.llm_model = llm_model
        self.llm_base_url = llm_base_url
        self.embedding_model = embedding_model
        self.timeout = timeout

        print(f"🎯 RAGnosis Evaluator v2")
        print(f"🌐 Edge Function: {self.edge_function_url}")
        print(f"🤖 LLM: {self.llm_model} @ {self.llm_base_url}")
        print(f"📦 Embeddings: {self.embedding_model}")

        print("\n📊 Initializing RAGAS...")
        self._setup_ragas_models()

    def _setup_ragas_models(self):
        """Setup LLM and embeddings for RAGAS."""
        self.ragas_llm = ChatOllama(
            model=self.llm_model,
            base_url=self.llm_base_url,
            temperature=0.1,
            timeout=300,
            num_ctx=8192,
            num_predict=2048,
        )

        from langchain_core.embeddings import Embeddings
        base_embeddings = FastEmbedEmbeddings(
            model_name=self.embedding_model,
            cache_dir=os.getenv("FASTEMBED_CACHE_PATH", None),
        )

        class SafeFastEmbeddings(Embeddings):
            def __init__(self, base_model, model_name):
                self._base = base_model
                self.model = model_name

            def embed_documents(self, texts):
                return self._base.embed_documents(texts)

            def embed_query(self, text):
                return self._base.embed_query(text)

        self.ragas_embeddings = SafeFastEmbeddings(base_embeddings, self.embedding_model)
        print(f"✅ RAGAS initialized")

    def load_golden_dataset(
        self,
        filepath: str = DEFAULT_GOLDEN_DATA,
        max_samples: Optional[int] = None,
        offset: int = 0,
        filter_category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Load golden dataset from JSONL."""
        all_questions = []
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                all_questions.append(json.loads(line))

        # Filter by category if specified
        if filter_category:
            questions = [q for q in all_questions if q.get("category") == filter_category]
            print(f"\n📂 Filtered to category '{filter_category}': {len(questions)} questions")
        else:
            questions = all_questions

        # Apply offset and limit
        if offset > 0:
            questions = questions[offset:]
        if max_samples:
            questions = questions[:max_samples]

        range_str = f" [questions {offset+1}-{offset+len(questions)}]" if offset > 0 or max_samples else ""
        if not filter_category:
            print(f"\n📂 Loaded {len(questions)} questions{range_str}")

        return questions

    def call_edge_function(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        """Call RAGnosis Edge Function."""
        try:
            response = requests.post(
                self.edge_function_url,
                json={"query": query, "top_k": top_k},
                headers={"Content-Type": "application/json"},
                timeout=self.timeout
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            return {"answer": "Request timed out", "sources": [], "error": "timeout"}
        except Exception as e:
            return {"answer": f"Error: {str(e)}", "sources": [], "error": str(e)}

    def validate_retrieval(self, prediction: Dict[str, Any], expected: Dict[str, Any]) -> Dict[str, bool]:
        """Validate expected_doc_types and contains_info_about."""
        validation = {}

        # Check expected_doc_types
        if "expected_doc_types" in expected:
            source_types = [s.get("type", "") for s in prediction.get("sources", [])]
            has_expected_types = any(
                exp_type in source_types
                for exp_type in expected["expected_doc_types"]
            )
            validation["has_expected_doc_types"] = has_expected_types

        # Check contains_info_about
        if "contains_info_about" in expected:
            all_text = " ".join([
                s.get("name", "") + " " + prediction.get("answer", "")
                for s in prediction.get("sources", [])
            ]).lower()

            has_info = all(
                entity.lower() in all_text
                for entity in expected["contains_info_about"]
            )
            validation["has_expected_entities"] = has_info

        return validation

    def evaluate_dataset(
        self,
        questions: List[Dict[str, Any]],
        top_k: int = 5,
        save_predictions: bool = False,
        output_dir: str = DEFAULT_OUTPUT_DIR,
    ) -> Dict[str, Any]:
        """Evaluate RAGnosis on golden dataset."""
        print(f"\n🔍 Running RAGnosis on {len(questions)} questions...")

        predictions = []
        doc_type_accuracy = []
        entity_accuracy = []

        for q in tqdm(questions, desc="Generating answers"):
            result = self.call_edge_function(q["question"], top_k=top_k)

            # Extract contexts
            contexts = []
            for source in result.get("sources", []):
                if "content" in source:
                    contexts.append(source["content"])
                elif "text" in source:
                    contexts.append(source["text"])

            if not contexts and result.get("answer"):
                contexts = [result["answer"]]

            prediction = {
                "question": q["question"],
                "ground_truth": q["ground_truth"],
                "answer": result.get("answer", ""),
                "contexts": contexts,
                "sources": result.get("sources", []),
                "has_error": "error" in result,
            }

            # Validate retrieval
            validation = self.validate_retrieval(prediction, q)
            prediction.update(validation)

            if "has_expected_doc_types" in validation:
                doc_type_accuracy.append(1 if validation["has_expected_doc_types"] else 0)
            if "has_expected_entities" in validation:
                entity_accuracy.append(1 if validation["has_expected_entities"] else 0)

            predictions.append(prediction)

        # Save predictions
        predictions_file = None
        if save_predictions:
            predictions_file = self._save_predictions(predictions, output_dir)

        # Custom metrics
        custom_metrics = {
            "total_questions": len(questions),
            "error_rate": sum(1 for p in predictions if p["has_error"]) / len(predictions),
        }

        if doc_type_accuracy:
            custom_metrics["doc_type_accuracy"] = sum(doc_type_accuracy) / len(doc_type_accuracy)
        if entity_accuracy:
            custom_metrics["entity_accuracy"] = sum(entity_accuracy) / len(entity_accuracy)

        # RAGAS evaluation
        valid_predictions = [p for p in predictions if p["contexts"]]

        if not valid_predictions:
            print("\n⚠️  No valid predictions for RAGAS")
            return {
                "edge_function_url": self.edge_function_url,
                "llm_model": self.llm_model,
                "custom_metrics": custom_metrics,
                "ragas_metrics": {},
                "predictions_file": predictions_file,
            }

        print(f"\n📊 Evaluating {len(valid_predictions)} predictions with RAGAS...")
        ragas_data = {
            "question": [p["question"] for p in valid_predictions],
            "answer": [p["answer"] for p in valid_predictions],
            "contexts": [p["contexts"] for p in valid_predictions],
            "ground_truth": [p["ground_truth"] for p in valid_predictions],
            "reference": [p["ground_truth"] for p in valid_predictions],
        }

        dataset = Dataset.from_dict(ragas_data)

        try:
            from ragas.run_config import RunConfig
            run_config = RunConfig(max_workers=4, max_wait=180, timeout=180, max_retries=5)

            ragas_result = evaluate(
                dataset,
                metrics=[faithfulness, answer_relevancy, context_precision, answer_correctness],
                llm=self.ragas_llm,
                embeddings=self.ragas_embeddings,
                run_config=run_config,
            )

            df = ragas_result.to_pandas()
            ragas_metrics = df.select_dtypes(include=['number']).mean().to_dict()

            return {
                "edge_function_url": self.edge_function_url,
                "llm_model": self.llm_model,
                "embedding_model": self.embedding_model,
                "custom_metrics": custom_metrics,
                "ragas_metrics": ragas_metrics,
                "predictions_file": predictions_file,
            }

        except Exception as e:
            print(f"❌ RAGAS evaluation failed: {e}")
            return {
                "edge_function_url": self.edge_function_url,
                "llm_model": self.llm_model,
                "custom_metrics": custom_metrics,
                "ragas_metrics": {},
                "predictions_file": predictions_file,
                "ragas_error": str(e),
            }

    def _save_predictions(self, predictions: List[Dict], output_dir: str) -> str:
        """Save predictions to JSON."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        filename = output_path / f"predictions_{timestamp}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(predictions, f, indent=2, ensure_ascii=False)

        print(f"💾 Predictions saved: {filename}")
        return str(filename)


def print_results(results: Dict[str, Any]):
    """Print evaluation results."""
    print("\n" + "=" * 70)
    print("🎯 RAGnosis Evaluation Results")
    print("=" * 70)

    print(f"\n📋 Configuration:")
    print(f"  Edge Function:   {results['edge_function_url']}")
    print(f"  LLM Model:       {results['llm_model']}")

    print(f"\n📊 Custom Metrics:")
    for metric, value in results["custom_metrics"].items():
        if isinstance(value, float):
            print(f"  {metric:25s}: {value:.4f}")
        else:
            print(f"  {metric:25s}: {value}")

    if results["ragas_metrics"]:
        print(f"\n📊 RAGAS Metrics:")
        for metric, value in results["ragas_metrics"].items():
            print(f"  {metric:25s}: {value:.4f}")

    if results.get("predictions_file"):
        print(f"\n💾 Predictions: {results['predictions_file']}")

    print("=" * 70 + "\n")


def save_results(results: Dict[str, Any], output_dir: str):
    """Save results to JSON."""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = output_path / f"evaluation_results_{timestamp}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"💾 Results saved: {filename}")


def main():
    parser = argparse.ArgumentParser(description="RAGnosis RAGAS Evaluation v2")
    parser.add_argument("--golden_data", default=DEFAULT_GOLDEN_DATA)
    parser.add_argument("--max_samples", type=int, default=None, help="Max questions to evaluate")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N questions")
    parser.add_argument("--filter_category", type=str, default=None,
                       help="Filter by category: concepts, models, repos, comparison, implementation, troubleshooting")
    parser.add_argument("--top_k", type=int, default=5)
    parser.add_argument("--llm_model", default=DEFAULT_LLM_MODEL)
    parser.add_argument("--llm_base_url", default=DEFAULT_LLM_BASE_URL)
    parser.add_argument("--embedding_model", default=DEFAULT_EMBEDDING_MODEL)
    parser.add_argument("--edge_function_url", default=DEFAULT_EDGE_FUNCTION_URL)
    parser.add_argument("--output_dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--save_predictions", action="store_true")
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)

    args = parser.parse_args()

    print("=" * 70)
    print("🚀 RAGnosis RAGAS Evaluation v2")
    print("=" * 70)

    evaluator = RAGnosisEvaluator(
        edge_function_url=args.edge_function_url,
        llm_model=args.llm_model,
        llm_base_url=args.llm_base_url,
        embedding_model=args.embedding_model,
        timeout=args.timeout,
    )

    questions = evaluator.load_golden_dataset(
        args.golden_data,
        max_samples=args.max_samples,
        offset=args.offset,
        filter_category=args.filter_category
    )

    results = evaluator.evaluate_dataset(
        questions,
        top_k=args.top_k,
        save_predictions=args.save_predictions,
        output_dir=args.output_dir,
    )

    print_results(results)
    save_results(results, args.output_dir)


if __name__ == "__main__":
    main()
