# RAGnosis Evaluation

Quick evaluation guide for diagnostic/support RAG system.

## 🎯 Quick Start

**Run evaluation (23 questions, ~2 min):**
```bash
cd evaluation
. ../venv/bin/activate
python3 evaluate_ragnosis.py --golden_data golden_data/golden_dataset.jsonl > /tmp/eval.txt 2>&1
tail -35 /tmp/eval.txt  # See metrics only
```

**Test specific query types:**
```bash
python3 evaluate_ragnosis.py --offset 5 --max_samples 7  # Implementation (5-11)
python3 evaluate_ragnosis.py --offset 0 --max_samples 5  # Conceptual (0-4)
```

## 📊 Understanding Metrics

**For Diagnostic RAG, prioritize:**
1. **Faithfulness (target: 0.85+)** - Answers don't hallucinate, grounded in sources
2. **Relevancy (target: 0.75+)** - Answers directly address user's question
3. Precision/Recall - Less critical (users want guidance, not exact docs)

**Metric definitions:**
- **Faithfulness:** Claims in answer ÷ claims supported by sources
- **Relevancy:** How well answer addresses the specific question
- **Precision:** Retrieved docs are relevant (low = too much noise)
- **Recall:** Found all relevant docs (low = missing information)

**Current State:** faithfulness 0.85 ✓, relevancy 0.75 ✓

## 🔧 Key Config Parameters

All located in `supabase/functions/rag-chat/config.ts`:

```typescript
candidateCount: 50        // Fetches 100 total (50 vector + 50 BM25) for RRF
finalResultCount: 20      // Returns top 20 after RRF fusion
structuredDataBoost: 1.0  // Multiplier for models/repos (1.0 = neutral, 1.2-1.3 = favor)
primaryExcerpt: 400       // Context chars for top 2 sources
secondaryExcerpt: 150     // Context chars for sources 3-20
```

**Critical Bug Alert:** `structuredDataBoost: 0` zeros out all models/repos scores!

## ⚡ Quick Improvements

### Option 1: Tune Boost (Quickest - 2min test)
```typescript
// config.ts line 44
structuredDataBoost: 1.2,  // Try 1.2-1.3 for better recall
```
**Impact:** Better recall by helping models/repos compete with blogs

### Option 2: Adjust Result Count (Quick)
```typescript
// config.ts line 40
finalResultCount: 15,  // Lower = higher precision (less noise)
finalResultCount: 25,  // Higher = higher recall (more coverage)
```

### Option 3: Increase Context (Medium - if relevancy low)
```typescript
// config.ts lines 48-49
primaryExcerpt: 600,      // More complete answers
secondaryExcerpt: 200,    // More context per source
```
⚠️ **Warning:** Keep total context <2K tokens for 3B models (quality degrades beyond that)

### Option 4: Add Reranking (Complex)
- Use cross-encoder after RRF to rerank top 20
- Impact: +10-15% precision/recall
- Tradeoff: +model download, +200ms latency

## 🔍 Answer Generation

Located in `supabase/functions/rag-chat/answer-generator.ts`:

**Key prompt elements:**
- Line 154-166: Base grounding rules ("ONLY use sources")
- Line 203-209: Conceptual intent instructions
- Line 206: **"FIRST: Directly answer user's specific question"** (critical for relevancy)

**If relevancy drops:** Check this instruction is present and not removed

## 🐛 Troubleshooting

**Faithfulness drops (<0.80):**
- Check: `answer-generator.ts` grounding rules (lines 154-166)
- Fix: Strengthen "ONLY use sources" instruction
- Cause: LLM adding knowledge beyond retrieved sources

**Relevancy drops (<0.70):**
- Check: "FIRST: Directly answer..." at line 206 of answer-generator.ts
- Fix: Ensure direct answer instruction is present
- Cause: LLM giving generic coverage instead of answering question

**Recall drops (<0.45):**
- Check: structuredDataBoost ≥ 1.0 (line 44 config.ts)
- Try: Increase boost to 1.2-1.3
- Alternative: Increase candidateCount (50 → 60)
- Cause: Models/repos not scoring high enough vs blogs

**Precision drops (<0.35):**
- Check: finalResultCount (line 40 config.ts)
- Try: Reduce from 20 to 15
- Alternative: Lower structuredDataBoost if too high
- Cause: Too much noise in retrieved sources

## 📝 Important Concepts

**This is diagnostic/support RAG, not fact retrieval:**
- Users want troubleshooting guidance, not specific data points
- Faithfulness > Relevancy >> Precision/Recall (in priority)
- Don't over-optimize precision/recall - users care about helpful answers

**Key learnings:**
- Stratified sampling removed (added complexity, marginal gains)
- More context helps (200→400 chars improved relevancy +2%)
- Direct answer instruction critical (added to conceptual prompt)
- Query routing works well (don't disable it)

**Cost considerations:**
- Local Ollama: Free
- OpenRouter qwen2.5:3b: ~$0.24 per 1K queries
- Context budget: Keep <2K tokens for quality with 3B models

## 🔄 Testing Workflow

1. Make ONE config change
2. Run quick eval: `python3 evaluate_ragnosis.py`
3. Check metrics (tail output)
4. If improved: commit; if worse: revert
5. Repeat

**Don't change multiple things at once** - you won't know what worked.

---

**Setup:** `pip install -r requirements.txt` in venv
**Edge function must be running:** `make chat` or equivalent
**Ollama required for RAGAS:** `docker compose up ollama -d`
