# Golden Dataset v2.0

**Status:** ✅ Ready for testing (2026-03-30)
**Total Questions:** 28
**Purpose:** Balanced evaluation across all RAGnosis content types

---

## Dataset Organization

Questions are organized by category with IDs for targeted testing:

| Category | ID Range | Count | Description |
|----------|----------|-------|-------------|
| **Concepts** | concept_01 - concept_04 | 4 | RAG fundamentals, how it works |
| **Models** | model_01 - model_06 | 6 | Embedding & reranking models |
| **Repos** | repo_01 - repo_03 | 3 | Frameworks & vector databases |
| **Comparison** | comparison_01 - comparison_05 | 5 | X vs Y comparisons |
| **Implementation** | impl_01 - impl_09 | 9 | How-to guides, best practices |
| **Troubleshooting** | troubleshoot_01 | 1 | Fixing common issues |

### Content Type Distribution

| Content Type | Count | % | Categories |
|--------------|-------|---|-----------|
| Documentation-heavy | 17 | 61% | concepts, implementation, troubleshooting, some comparisons |
| Model questions | 6 | 21% | models |
| Repo questions | 3 | 11% | repos |
| Mixed | 2 | 7% | some comparisons, concepts |

---

## Running Targeted Tests

### By Category

Test specific question categories using Python filtering:

```bash
# Test only concept questions (4 questions)
python evaluate_ragnosis.py --filter_category concepts

# Test only model questions (6 questions)
python evaluate_ragnosis.py --filter_category models

# Test implementation questions (9 questions)
python evaluate_ragnosis.py --filter_category implementation
```

### By Range

Test specific question ranges by line number:

```bash
# Test questions 1-4 (concepts)
python evaluate_ragnosis.py --max_samples 4

# Test questions 5-10 (models)
python evaluate_ragnosis.py --offset 4 --max_samples 6

# Test questions 11-13 (repos)
python evaluate_ragnosis.py --offset 10 --max_samples 3

# Test questions 14-18 (comparisons)
python evaluate_ragnosis.py --offset 13 --max_samples 5

# Test questions 19-27 (implementation)
python evaluate_ragnosis.py --offset 18 --max_samples 9
```

### Quick Tests

```bash
# Full evaluation (all 28)
python evaluate_ragnosis.py

# Quick test (first 5)
python evaluate_ragnosis.py --max_samples 5

# Save detailed predictions
python evaluate_ragnosis.py --save_predictions
```

---

## Dataset Structure

Each question includes:

```json
{
  "question_id": "category_##",
  "category": "category_name",
  "question": "user query",
  "ground_truth": "expected answer based on characteristics",
  "expected_doc_types": ["blog_article", "hf_model", "github_repo"],
  "contains_info_about": ["entity1", "entity2"]
}
```

**Fields:**
- `question_id` - Unique ID with category prefix (e.g., "concept_01", "model_03")
- `category` - Category name for filtering
- `question` - Realistic user query
- `ground_truth` - Time-stable answer (characteristics, not rankings)
- `expected_doc_types` - What document types should appear in results
- `contains_info_about` - Key entities that should be mentioned

---

## Evaluation Metrics

### RAGAS Metrics (Core)
1. **Faithfulness** - Answer grounded in retrieved context (anti-hallucination)
2. **Answer Relevance** - Addresses the query
3. **Context Precision** - Retrieved docs are relevant
4. **Answer Correctness** - Factually accurate vs ground truth

### Custom Metrics
- **doc_type_accuracy** - Correct document types retrieved
- **entity_accuracy** - Expected entities found in sources/answer
- **error_rate** - Requests that failed

---

## Design Principles

✅ **Time-stable** - Ground truth based on characteristics/tradeoffs, not rankings
✅ **Content-balanced** - Tests all document types (61% blog, 21% model, 11% repo, 7% mixed)
✅ **Realistic** - Questions from real user needs (user_questions.md)
✅ **Retrievable** - Answers exist in actual database content
✅ **Organized** - Grouped by category for targeted testing

---

## Category Details

### Concepts (4 questions)
Tests understanding of RAG fundamentals:
- What is RAG, how it works
- Vector databases, reranking concepts
- Primarily needs blog articles

### Models (6 questions)
Tests HuggingFace model retrieval:
- Best embedding models for different use cases
- Multilingual models, reranking models
- Needs hf_model documents

### Repos (3 questions)
Tests GitHub repo retrieval:
- RAG frameworks, vector databases
- Framework recommendations
- Needs github_repo documents

### Comparison (5 questions)
Tests comparative analysis:
- X vs Y comparisons (RAG vs fine-tuning, frameworks, databases)
- Trade-off discussions
- Mixed document types

### Implementation (9 questions - largest)
Tests how-to and best practices:
- Chunking strategies, retrieval improvement
- Evaluation, deployment, production concerns
- Primarily needs blog articles

### Troubleshooting (1 question)
Tests problem-solving:
- Fixing common RAG issues
- Needs blog articles

---

## Update Policy

**DO NOT modify for:**
- ❌ Tweaking ground truth to match current retrieval
- ❌ Removing "hard" questions
- ❌ Adding time-sensitive rankings

**Create v2.1 only if:**
- ✅ Fixing objectively incorrect ground truth
- ✅ Adding underrepresented query types
- ✅ Major system changes require new baseline

**Remember:** Improve the system, not the test.
