/**
 * Answer Evaluator - LLM-based quality checking
 * Uses LLM to evaluate answer quality across 4 dimensions
 * Provides smarter, more nuanced evaluation than heuristics
 */

import { LOG_PREFIX, WEIGHTS, THRESHOLDS } from "./utils/constants.ts";
import { getFeatureFlagService } from "./services/feature-flags.ts";
import { getLLMClient } from "./services/llm-client.ts";

export interface EvaluationResult {
  score: number; // 0-100
  confidence: "low" | "medium" | "high";
  issues: string[];
  shouldIterate: boolean;
  relevancy: number; // 0-10
  accuracy: number; // 0-10
  clarity: number; // 0-10
  specificity: number; // 0-10
}

interface EvaluatorConfig {
  min_score_for_iteration: number;
}

/**
 * LLM response format for answer evaluation
 */
interface LLMEvaluationResponse {
  relevancy: number; // 0-10
  accuracy: number; // 0-10
  clarity: number; // 0-10
  specificity: number; // 0-10
  issues: string[];
}

/**
 * Build evaluation prompt for LLM
 */
function buildEvaluationPrompt(
  question: string,
  answer: string,
  sourcesUsed: number,
): string {
  return `You are an expert RAG system evaluator. Evaluate the quality of the generated answer based on the user's question.

**User Question:**
${question}

**Generated Answer:**
${answer}

**Sources Used:** ${sourcesUsed}

Evaluate the answer on the following 4 dimensions using a 0-10 scale:

1. **Relevancy (0-10)**: Does the answer directly address what was asked?
   - 10: Perfectly addresses the question with all key points covered
   - 7-9: Mostly relevant, minor gaps or tangents
   - 4-6: Partially relevant, missing key aspects
   - 0-3: Off-topic or doesn't address the question

2. **Accuracy (0-10)**: Are claims properly cited and factual?
   - 10: All claims cited with inline references, no vague statements
   - 7-9: Most claims cited, minor gaps in citations
   - 4-6: Some citations but many unsupported claims
   - 0-3: No citations or unreliable information
   - Special: Deduct heavily if sources_used = 0 (likely hallucinated)

3. **Clarity (0-10)**: Is the answer well-structured and easy to understand?
   - 10: Excellent structure with headers, bullets, clear organization
   - 7-9: Good structure, easy to follow
   - 4-6: Somewhat organized but could be clearer
   - 0-3: Poorly structured, hard to understand
   - Consider: Use of headers, bullet points, code blocks (when appropriate), logical flow

4. **Specificity (0-10)**: Does it provide concrete details vs vague statements?
   - 10: Specific examples, numbers, versions, tool names, actionable details
   - 7-9: Mostly specific with some concrete examples
   - 4-6: Mix of specific and generic content
   - 0-3: Too generic, hedging phrases, no concrete details
   - Look for: Version numbers, metrics, specific tool/model names, quantitative data

**Output Format (JSON):**
{
  "relevancy": <number 0-10>,
  "accuracy": <number 0-10>,
  "clarity": <number 0-10>,
  "specificity": <number 0-10>,
  "issues": [<array of concise action items>]
}

**Issue format:** Brief, actionable fix (max 100 chars). Example: "Add inline citations [1][2] after each claim in Overview"`;
}

/**
 * Evaluate answer quality using LLM
 * Returns null if evaluator is disabled
 */
export async function evaluateAnswer(
  question: string,
  answer: string,
  sourcesUsed: number,
  supabase: any,
): Promise<EvaluationResult | null> {
  try {
    // Check if answer evaluator is enabled
    const featureFlags = getFeatureFlagService(supabase);
    const isEnabled = await featureFlags.isEnabled("answer_evaluator");

    if (!isEnabled) {
      return null;
    }

    // Get evaluation thresholds from feature flag config
    const config =
      await featureFlags.getConfig<EvaluatorConfig>("answer_evaluator");

    // Build LLM evaluation prompt
    const prompt = buildEvaluationPrompt(question, answer, sourcesUsed);

    // Call LLM with automatic JSON parsing (increased tokens for detailed issues)
    const llmClient = getLLMClient();
    const llmResponse = await llmClient.chatJson<LLMEvaluationResponse>(
      prompt,
      {
        maxTokens: 2000, // Increased from default to handle detailed issues array
      },
    );

    if (!llmResponse) {
      console.error(`${LOG_PREFIX.WARNING} LLM evaluation failed`);
      return null;
    }

    // Ensure scores are within valid range
    const relevancy = Math.max(0, Math.min(10, llmResponse.relevancy));
    const accuracy = Math.max(0, Math.min(10, llmResponse.accuracy));
    const clarity = Math.max(0, Math.min(10, llmResponse.clarity));
    const specificity = Math.max(0, Math.min(10, llmResponse.specificity));

    // Calculate weighted composite score (0-100)
    const rawScore =
      relevancy * WEIGHTS.EVALUATION.RELEVANCY +      // 35% weight (most important)
      accuracy * WEIGHTS.EVALUATION.ACCURACY +        // 30% weight
      clarity * WEIGHTS.EVALUATION.CLARITY +          // 17.5% weight
      specificity * WEIGHTS.EVALUATION.SPECIFICITY;   // 17.5% weight

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));

    // Confidence calibration
    const confidence =
      finalScore >= THRESHOLDS.EVAL_CONFIDENCE_HIGH ? "high" :
      finalScore >= THRESHOLDS.EVAL_CONFIDENCE_MEDIUM ? "medium" : "low";

    // Iteration decision
    const shouldIterate = finalScore < config.min_score_for_iteration;

    return {
      score: finalScore,
      confidence,
      issues:
        llmResponse.issues.length > 0
          ? llmResponse.issues
          : ["Excellent - answer meets all quality standards"],
      shouldIterate,
      relevancy,
      accuracy,
      clarity,
      specificity,
    };
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer evaluation error:`, error);
    return null;
  }
}
