/**
 * Query Expansion - Generate semantic variations to improve recall
 */

import { config } from './config.ts'

/**
 * Expand query into multiple semantic variations
 */
export async function expandQuery(originalQuery: string): Promise<string[]> {
  // For simple ranking queries, don't expand
  if (/^(top|best|most popular|list|show me)\s+\d*/i.test(originalQuery)) {
    return [originalQuery]
  }

  console.log(`🔄 Expanding query: "${originalQuery}"`)

  const prompt = `Generate 2 alternative phrasings of this search query that capture the same intent but use different words.

Original query: "${originalQuery}"

Return ONLY the 2 alternative queries, one per line, nothing else. No numbering, no explanations.`

  try {
    const response = await fetch(`${config.llm.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,  // Higher temperature for diversity
          num_predict: 100
        }
      })
    })

    if (!response.ok) {
      return [originalQuery]
    }

    const data = await response.json()
    const expansions = data.response
      .trim()
      .split('\n')
      .map((q: string) => q.trim().replace(/^[-•*\d.]+\s*/, ''))
      .filter((q: string) => q.length > 0)
      .slice(0, 2)

    // Always include original query
    const allQueries = [originalQuery, ...expansions]
    console.log(`✅ Expanded to ${allQueries.length} queries`)

    return allQueries
  } catch (error) {
    console.error('❌ Query expansion failed:', error)
    return [originalQuery]
  }
}
