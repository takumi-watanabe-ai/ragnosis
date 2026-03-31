/**
 * Answer Evaluator - Self-evaluation for iterative improvement
 * Implements quality scoring and adaptive iteration
 */

import { config } from './config.ts'

export interface EvaluationResult {
  score: number  // 0-100
  confidence: 'low' | 'medium' | 'high'
  issues: string[]
  shouldIterate: boolean
}

/**
 * Evaluate answer quality and decide if we need to iterate
 */
export async function evaluateAnswer(
  question: string,
  answer: string,
  sourcesUsed: number
): Promise<EvaluationResult> {
  // Quick checks first
  if (answer.length < 50) {
    return {
      score: 30,
      confidence: 'low',
      issues: ['Answer too short'],
      shouldIterate: true
    }
  }

  if (sourcesUsed === 0) {
    return {
      score: 20,
      confidence: 'low',
      issues: ['No sources used'],
      shouldIterate: true
    }
  }

  // Use LLM to evaluate quality
  const prompt = `You are a strict answer quality evaluator. Rate this answer's quality.

Question: ${question}

Answer: ${answer}

Sources Used: ${sourcesUsed}

Rate the answer on these criteria (0-100):
1. Relevance: Does it directly answer the question?
2. Completeness: Are all aspects addressed?
3. Grounding: Is it well-sourced with citations?
4. Clarity: Is it clear and well-structured?

Respond with ONLY a JSON object (no markdown), must include issues
{
  "score": <0-100>,
  "issues": ["issue 1", "issue 2", ...]
}`

  try {
    const response = await fetch(`${config.llm.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 200
        }
      })
    })

    if (!response.ok) {
      // If evaluation fails, don't iterate
      return {
        score: response.score,
        confidence: response.confidence,
        issues: response.issues,
        shouldIterate: false
      }
    }

    const data = await response.json()
    const result = JSON.parse(data.response.trim())

    const score = result.score || 70
    const issues = result.issues || []

    // Quality thresholds
    const confidence = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'
    const shouldIterate = score < 70  // Iterate if below 70

    return {
      score,
      confidence,
      issues,
      shouldIterate
    }
  } catch (error) {
    console.error('Evaluation failed:', error)
    // If evaluation fails, don't iterate (assume good enough)
    return {
      score: -1,
      confidence: 'error',
      issues: [],
      shouldIterate: false
    }
  }
}
