# Next Steps: System Improvements

**Last Session:** 2026-03-28 (Session 2)
**Baseline:** recall 0.57, precision 0.57, faithfulness 0.72
**Goal:** recall 0.65+, precision 0.65+, faithfulness 0.80+

---

## Session 3 Summary (2026-03-29)

**Baseline:** recall 0.57, precision 0.57, faithfulness 0.72

**Iteration Results:**

| Iter | Config | Faith | Prec | Recall | Notes |
|------|--------|-------|------|--------|-------|
| 0 | boost=0 (BUG), strat=ON | 0.789 | 0.500 | 0.509 | boost=0 zeros out models/repos! |
| 1 | boost=1.0, strat=ON, impl only | 1.000 | 0.571 | 0.453 | Perfect faith but low recall |
| 2 | boost=1.0, strat=OFF, impl only | 0.964 | 0.571 | 0.600 | Best impl results! |
| 3 | boost=1.5, strat=OFF, impl only | 0.976 | 0.714 | 0.479 | High boost hurts recall |
| 4 | boost=1.5, strat=OFF, market, NO ROUTING | 0.746 | 0.200 | 0.000 | Disabling routing = catastrophic |
| 5 | boost=1.0, strat=OFF, routing ON, FULL | **0.845** | 0.571 | **0.338** | Best faith, worst recall |

**Key Findings:**
1. **Routing is critical:** Market queries need direct DB routing (iter 4 showed recall=0 without it)
2. **Stratified sampling OFF** works better for impl queries (iter 2 vs iter 1)
3. **boost=1.0 hurts recall:** Pure RRF without boost drops recall 40% (0.57→0.34)
4. **Faith vs Recall tradeoff:** Higher faithfulness correlates with lower recall

**Current Best:** Iter 5 (faith 0.845 beats target 0.80!) but recall 0.338 far below target 0.65

| 6 | boost=1.0, strat=ON, routing ON, FULL | 0.815 | 0.500 | 0.408 | Strat helps recall but hurts precision |
| 7-impl | boost=1.3, strat=ON, impl only | 0.844 | 0.714 | **0.667** | BEST impl results! Above all targets! |
| 7-full | boost=1.3, strat=ON, routing ON, FULL | 0.761 | 0.500 | 0.524 | Recall improved but faith dropped |

**Key Learnings:**

1. **Boost is critical:** boost=0 zeros out models/repos (BUG), boost=1.0 can't compete, boost=1.3 helps recall
2. **Routing matters:** Direct DB routing for market queries is essential (semantic search had recall=0)
3. **Stratified sampling:** Helps recall (+7-12%) but hurts precision (-12%)
4. **Query type differences:**
   - **Implementation queries** (5-11): Benefit from boost=1.3 + stratified (recall 0.67✓, prec 0.71✓)
   - **Full dataset**: boost=1.3 helps recall but hurts faithfulness

5. **Tradeoff discovered:** Faithfulness vs Recall appear inversely correlated
   - Iter 5 (boost=1.0, strat OFF): faith 0.845 ✓✓, recall 0.338 ✗✗
   - Iter 7 (boost=1.3, strat ON): faith 0.761 ✗, recall 0.524 ↑

**Current Status vs Targets:**
- Baseline: recall 0.57, precision 0.57, faithfulness 0.72
- Targets: recall 0.65+, precision 0.65+, faithfulness 0.80+
- Best overall (iter 5): faith 0.845✓✓, prec 0.571, recall 0.338✗✗
- Best recall (iter 7): faith 0.761✓, prec 0.500✗, recall 0.524✗

**Next Steps:**
1. Try boost=1.2 (middle ground) with stratified sampling
2. Increase candidateCount to 40-50 to improve both metrics
3. Consider query-type specific boost values (higher for impl, lower for conceptual)
4. Investigate why faithfulness drops with higher boost

---

## Iteration Plan

### Phase 1: Fix Critical Issues
1. Fix structuredDataBoost (set to 1.0 or remove multiplication)
2. Test with stratified sampling ON vs OFF
3. Evaluate if top_models/top_repos routing helps or hurts

### Phase 2: Parameter Tuning
1. Candidate count (30 → 40 → 50)
2. Query-adaptive weights refinement
3. Stratified sampling weights optimization

---

## 3. Measure Against Baseline

### Quick Comparison

After each change:
```bash
# Run evaluation
make eval-full

# Compare to baseline
cat evaluation/results/baseline_v1.0.json

# Look for:
# - context_recall: target 0.65+ (baseline 0.57)
# - context_precision: target 0.65+ (baseline 0.57)
# - faithfulness: target 0.80+ (baseline 0.72)
```

### Detailed Analysis

**Check specific query types:**
```bash
# Test market intelligence queries (should be strongest)
make eval-range RANGE=15:5

# Test implementation queries
make eval-range RANGE=4:7

# Test decision queries
make eval-range RANGE=0:6
```

**Analyze predictions:**
```python
import json

# Load latest run
with open('evaluation/results/predictions_[TIMESTAMP].json') as f:
    current = json.load(f)

# Load baseline
with open('evaluation/results/baseline_v1.0_predictions.json') as f:
    baseline = json.load(f)

# Compare specific questions
for c, b in zip(current, baseline):
    if c['question_id'] == 'real_001':  # Example
        print(f"Question: {c['question']}")
        print(f"Baseline sources: {[s['name'] for s in b['sources'][:3]]}")
        print(f"Current sources: {[s['name'] for s in c['sources'][:3]]}")
```

---

## Recommended Testing Sequence

1. **Enable stratified sampling**
   - Change config.ts
   - Run `make eval-quick`
   - If improved: run `make eval-full`

2. **If recall still <0.65, increase candidates**
   - Try candidateCount: 40, then 50
   - Test each with `make eval-quick`

3. **If precision <0.65, adjust boost**
   - Try 6.0x or 7.0x boost
   - Test with `make eval-quick`

4. **Final full evaluation**
   - Run `make eval-full`
   - Compare all metrics to baseline
   - Document improvements

---

## Success Criteria

**Minimum acceptable:**
- recall ≥ 0.60 (+5% from baseline)
- precision ≥ 0.60 (+5% from baseline)
- faithfulness ≥ 0.75 (+3% from baseline)

**Target goal:**
- recall ≥ 0.65 (+14% from baseline)
- precision ≥ 0.65 (+14% from baseline)
- faithfulness ≥ 0.80 (+11% from baseline)

---

## If Metrics Regress

**Faithfulness drops:** LLM is straying from context
- Solution: Strengthen grounding in prompt (answer-generator.ts)
- Add explicit instruction to cite sources

**Recall drops:** Missing relevant documents
- Solution: Increase candidateCount or reduce diversity enforcement
- Check if routing is working (market queries should use top_models/top_repos)

**Precision drops:** Retrieving irrelevant documents
- Solution: Reduce boost or tighten query-adaptive weights
- Consider adding reranking (future enhancement)

---

## Notes

- Always test incrementally (one change at a time)
- Use `make eval-quick` for fast iteration
- Only run `make eval-full` when confident
- Commit working configurations
- Document all parameter changes in git commits

