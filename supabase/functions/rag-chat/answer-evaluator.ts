/**
 * Answer Evaluator - Fast heuristic-based quality checking
 * Zero-cost monitoring without LLM calls
 */

import { THRESHOLDS } from './utils/constants.ts'

export interface EvaluationResult {
  score: number  // 0-100
  confidence: 'low' | 'medium' | 'high'
  issues: string[]
  shouldIterate: boolean
}

/**
 * Evaluate answer quality using fast heuristics
 * No LLM calls - instant evaluation for monitoring
 */
export async function evaluateAnswer(
  question: string,
  answer: string,
  sourcesUsed: number
): Promise<EvaluationResult> {
  const issues: string[] = []
  let score = 100

  // Check 1: Answer length (minimum viable answer)
  if (answer.length < THRESHOLDS.MIN_ANSWER_LENGTH) {
    score -= 50
    issues.push('Answer too short (< 50 chars)')
  } else if (answer.length < 150) {
    score -= 15
    issues.push('Answer lacks depth')
  }

  // Check 2: Source usage
  if (sourcesUsed === 0) {
    score -= 40
    issues.push('No sources used')
  } else if (sourcesUsed < 2) {
    score -= 10
    issues.push('Only one source used')
  }

  // Check 3: Inline citations (markdown links: **[Name](url)**)
  const citationPattern = /\*\*\[.*?\]\(.*?\)\*\*/g
  const citations = answer.match(citationPattern) || []
  const citationCount = citations.length

  if (citationCount === 0) {
    score -= 25
    issues.push('Missing inline citations')
  } else if (citationCount < sourcesUsed / 2) {
    score -= 10
    issues.push('Few inline citations')
  }

  // Check 4: Vague source references (hallucination indicators)
  const vaguePatterns = [
    /according to (the )?sources/i,
    /based on (the )?information/i,
    /sources (indicate|suggest|show)/i,
  ]
  const hasVagueRefs = vaguePatterns.some(pattern => pattern.test(answer))

  if (hasVagueRefs && citationCount < 2) {
    score -= 15
    issues.push('Vague source references instead of specific citations')
  }

  // Check 5: Generic/placeholder content
  const genericPhrases = [
    'it depends',
    'varies depending',
    'more research needed',
  ]
  const hasGeneric = genericPhrases.some(phrase =>
    answer.toLowerCase().includes(phrase)
  )

  if (hasGeneric && answer.length < 300) {
    score -= 10
    issues.push('Generic response lacking specifics')
  }

  // Check 6: Structure (headers, bullets, formatting)
  const hasHeaders = /##\s+/.test(answer)
  const hasBullets = /^[\s]*[-*]\s+/m.test(answer)
  const hasStructure = hasHeaders || hasBullets

  if (!hasStructure && answer.length > 200) {
    score -= 5
    issues.push('Lacks structure (no headers/bullets)')
  }

  // Calculate final score and confidence
  const finalScore = Math.max(0, Math.min(100, score))
  const confidence = finalScore >= 80 ? 'high' : finalScore >= 60 ? 'medium' : 'low'

  return {
    score: finalScore,
    confidence,
    issues: issues.length > 0 ? issues : ['None - answer meets quality standards'],
    shouldIterate: false  // Iteration not implemented yet
  }
}
