/**
 * Answer Evaluator - Comprehensive heuristic-based quality checking
 * Adapted from production RAG system evaluation criteria
 * Zero-cost monitoring without LLM calls
 */

import { LOG_PREFIX } from './utils/constants.ts'
import { getFeatureFlagService } from './services/feature-flags.ts'

export interface EvaluationResult {
  score: number  // 0-100
  confidence: 'low' | 'medium' | 'high'
  issues: string[]
  shouldIterate: boolean
  completeness: number  // 0-10
  accuracy: number      // 0-10
  clarity: number       // 0-10
  specificity: number   // 0-10
}

interface EvaluatorConfig {
  min_answer_length: number
  min_score_for_iteration: number
  min_accuracy: number
  min_clarity: number
  min_faithfulness: number
  max_iterations: number
}

/**
 * Evaluate answer quality using fast heuristics
 * No LLM calls - instant evaluation for monitoring
 * Returns null if evaluator is disabled
 */
export async function evaluateAnswer(
  question: string,
  answer: string,
  sourcesUsed: number,
  supabase: any
): Promise<EvaluationResult | null> {
  try {
    // Check if answer evaluator is enabled and get config (from database)
    const featureFlags = getFeatureFlagService(supabase)
    const isEnabled = await featureFlags.isEnabled('answer_evaluator')

    if (!isEnabled) {
      return null
    }

    // Get evaluation thresholds from feature flag config
    const config = await featureFlags.getConfig<EvaluatorConfig>('answer_evaluator')
  const issues: string[] = []

  // ========================================================================
  // DIMENSION 1: COMPLETENESS (0-10)
  // Does the answer fully address the question?
  // ========================================================================
  let completeness = 10

  // Check answer length (minimum viable)
  if (answer.length < config.min_answer_length) {
    completeness -= 8
    issues.push(`Answer critically short (< ${config.min_answer_length} chars) - lacks substance`)
  } else if (answer.length < 150) {
    completeness -= 4
    issues.push('Answer lacks depth - needs more detail')
  } else if (answer.length < 300) {
    completeness -= 2
    issues.push('Answer could be more comprehensive')
  }

  // Check for section coverage (for complex questions)
  const questionWords = question.toLowerCase().split(/\s+/)
  const hasMultiPart = questionWords.some(w => ['and', 'also', 'compare', 'versus', 'vs'].includes(w))
  if (hasMultiPart && answer.length < 400) {
    completeness -= 2
    issues.push('Multi-part question needs more comprehensive coverage')
  }

  // ========================================================================
  // DIMENSION 2: ACCURACY (0-10)
  // Are statements properly sourced and factual?
  // ========================================================================
  let accuracy = 10

  // Source usage check
  if (sourcesUsed === 0) {
    accuracy -= 9
    issues.push('No sources used - answer likely hallucinated')
  } else if (sourcesUsed < 2) {
    accuracy -= 3
    issues.push('Only one source - needs diverse evidence')
  }

  // Citation verification (inline citations)
  const citationPattern = /\*\*\[.*?\]\(.*?\)\*\*/g
  const citations = answer.match(citationPattern) || []
  const citationCount = citations.length

  if (citationCount === 0) {
    accuracy -= 5
    issues.push('Missing inline citations - cannot verify claims')
  } else if (citationCount < sourcesUsed / 2) {
    accuracy -= 2
    issues.push('Insufficient citations - most sources not referenced in text')
  }

  // Vague reference detection (hallucination risk)
  const vaguePatterns = [
    /according to (the )?sources/i,
    /based on (the )?information/i,
    /sources (indicate|suggest|show)/i,
    /the data (shows|suggests|indicates)/i,
  ]
  const hasVagueRefs = vaguePatterns.some(pattern => pattern.test(answer))

  if (hasVagueRefs && citationCount < 2) {
    accuracy -= 3
    issues.push('Vague references instead of specific citations - accuracy concern')
  }

  // ========================================================================
  // DIMENSION 3: CLARITY (0-10)
  // Is the answer well-structured and easy to understand?
  // ========================================================================
  let clarity = 10

  // Structure assessment
  const hasHeaders = /##\s+/.test(answer)
  const hasBullets = /^[\s]*[-*]\s+/m.test(answer)
  const hasNumberedList = /^\s*\d+\.\s+/m.test(answer)
  const hasCodeBlocks = /```/g.test(answer)
  const hasStructure = hasHeaders || hasBullets || hasNumberedList

  if (!hasStructure && answer.length > 200) {
    clarity -= 3
    issues.push('Lacks structure - needs headers, bullets, or numbered lists')
  }

  if (answer.length > 400 && !hasHeaders) {
    clarity -= 2
    issues.push('Long answer without section headers - hard to navigate')
  }

  // Check for code examples (for implementation questions)
  const implementationKeywords = ['how to', 'implement', 'use', 'example', 'code', 'setup', 'install']
  const needsCode = implementationKeywords.some(kw => question.toLowerCase().includes(kw))
  if (needsCode && !hasCodeBlocks) {
    clarity -= 2
    issues.push('Implementation question needs code examples')
  }

  // ========================================================================
  // DIMENSION 4: SPECIFICITY (0-10)
  // Does it provide concrete details vs vague statements?
  // ========================================================================
  let specificity = 10

  // Generic phrase detection
  const genericPhrases = [
    'it depends',
    'varies depending',
    'more research needed',
    'might be',
    'could be',
    'possibly',
    'in some cases',
    'generally',
    'usually',
  ]
  const genericMatches = genericPhrases.filter(phrase =>
    answer.toLowerCase().includes(phrase)
  )

  if (genericMatches.length > 2) {
    specificity -= 4
    issues.push('Too many hedging/generic phrases - lacks concrete details')
  } else if (genericMatches.length > 0 && answer.length < 300) {
    specificity -= 2
    issues.push('Generic response without specific examples or data')
  }

  // Check for specific indicators (numbers, versions, metrics)
  const hasNumbers = /\d+/.test(answer)
  const hasVersions = /v?\d+\.\d+/.test(answer)
  const hasMetrics = /(downloads|stars|parameters|accuracy|performance|speed)/i.test(answer)

  if (!hasNumbers && answer.length > 200) {
    specificity -= 3
    issues.push('Lacks specific numbers, metrics, or quantitative data')
  }

  // Check for model/tool names (ML/AI domain)
  const hasTechnicalTerms = /([A-Z][a-z]+){2,}|BERT|GPT|LLaMA|Llama|Transformers|PyTorch|TensorFlow/g.test(answer)
  if (!hasTechnicalTerms && answer.length > 150) {
    specificity -= 2
    issues.push('Lacks specific tool/model names - too generic')
  }

  // ========================================================================
  // FINAL SCORE CALCULATION
  // Weighted composite score (0-100)
  // ========================================================================
  const rawScore = (
    completeness * 2.5 +   // 25% weight
    accuracy * 3.5 +       // 35% weight (most important)
    clarity * 2.0 +        // 20% weight
    specificity * 2.0      // 20% weight
  )

  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)))

  // Confidence calibration (aligned with scoring)
  // high (≥85): Excellent, comprehensive answer
  // medium (60-84): Good but has room for improvement
  // low (<60): Needs significant improvement
  const confidence = finalScore >= 85 ? 'high' : finalScore >= 60 ? 'medium' : 'low'

  // Iteration decision
  const shouldIterate = finalScore < config.min_score_for_iteration

  return {
    score: finalScore,
    confidence,
    issues: issues.length > 0 ? issues : ['Excellent - answer meets all quality standards'],
    shouldIterate,
    completeness: Math.max(0, completeness),
    accuracy: Math.max(0, accuracy),
    clarity: Math.max(0, clarity),
    specificity: Math.max(0, specificity),
  }
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer evaluation error:`, error)
    return null
  }
}
