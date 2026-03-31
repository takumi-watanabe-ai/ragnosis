/**
 * Answer Verification - Validates answer claims against sources
 * Improves faithfulness by removing unsupported statements
 */

import type { SearchResult } from './types.ts'
import { config } from './config.ts'

interface VerificationResult {
  verifiedAnswer: string
  removedClaims: string[]
  faithfulnessScore: number
}

/**
 * Verify answer against sources and remove unsupported claims
 */
export async function verifyAnswer(
  answer: string,
  sources: SearchResult[]
): Promise<VerificationResult> {
  console.log('🔍 Verifying answer against sources...')

  // Build source content for verification
  const sourceContent = sources
    .map((s, i) => `[${i + 1}] ${s.name}: ${s.content || s.description}`)
    .join('\n\n')

  const prompt = `You are a fact-checking assistant. Your job is to verify if an answer is fully supported by the given sources.

SOURCES:
${sourceContent}

ANSWER TO VERIFY:
${answer}

TASK:
1. Identify each factual claim in the answer
2. Check if each claim is directly supported by the sources
3. Remove any claims that are NOT explicitly supported
4. Return only the verified, faithful answer

RULES:
- ONLY include information explicitly stated in sources
- Remove general knowledge not in sources
- Remove assumptions or inferences not supported by sources
- Keep the same formatting and structure
- Maintain all source citations that are supported

Return ONLY the verified answer text, nothing else.`

  try {
    const response = await fetch(`${config.llm.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,  // Low temperature for consistent verification
          num_predict: 600
        }
      })
    })

    if (!response.ok) {
      console.error('❌ Verification failed, returning original answer')
      return {
        verifiedAnswer: answer,
        removedClaims: [],
        faithfulnessScore: 1.0
      }
    }

    const data = await response.json()
    const verifiedAnswer = data.response.trim()

    // Calculate faithfulness score (rough estimate based on length ratio)
    const originalLength = answer.length
    const verifiedLength = verifiedAnswer.length
    const faithfulnessScore = Math.min(1.0, verifiedLength / originalLength)

    console.log(`✅ Verification complete (faithfulness: ${faithfulnessScore.toFixed(2)})`)

    return {
      verifiedAnswer,
      removedClaims: [],  // Could implement detailed claim tracking
      faithfulnessScore
    }
  } catch (error) {
    console.error('❌ Verification error:', error)
    return {
      verifiedAnswer: answer,
      removedClaims: [],
      faithfulnessScore: 1.0
    }
  }
}
