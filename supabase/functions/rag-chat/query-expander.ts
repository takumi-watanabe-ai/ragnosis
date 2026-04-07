/**
 * Query Expansion - Generate semantic variations to improve recall
 */

import { config } from './config.ts'
import type { ProgressEmitter } from './types.ts'

/**
 * Expand query into multiple semantic variations
 *
 * Strategy: Generate DIVERSE queries that explore different aspects/angles
 * instead of just rephrasing. This prevents duplicate results and improves recall.
 *
 * Example:
 *   Original: "What is RAG?"
 *   Bad (rephrasing): "How does RAG work?", "Explain RAG" → same docs
 *   Good (diverse): "RAG architecture components", "RAG vs fine-tuning" → different docs
 */
export async function expandQuery(
  originalQuery: string,
  progress?: ProgressEmitter
): Promise<string[]> {
  // For simple ranking queries, don't expand
  if (/^(top|best|most popular|list|show me)\s+\d*/i.test(originalQuery)) {
    return [originalQuery]
  }

  console.log(`🔄 Expanding query: "${originalQuery}"`)

  const prompt = `Generate 2 diverse search queries that explore different aspects or angles of the original question. Each query should target different information that would help answer the original question comprehensively.

Original query: "${originalQuery}"

Guidelines:
- Query 1: Focus on a specific sub-aspect or related concept
- Query 2: Focus on a different angle (e.g., use cases, comparison, implementation, etc.)
- Make them meaningfully different, not just rephrased synonyms
- Keep them concise and searchable

Return ONLY the 2 alternative queries, one per line, nothing else. No numbering, no explanations.`

  try {
    // Use Ollama for query expansion (fast local model)
    const response = await fetch(`${config.llm.ollama.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.ollama.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.9,  // High temperature for maximum diversity
          num_predict: 150
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
    console.log(`✅ Expanded to ${allQueries.length} queries:`)
    allQueries.forEach((q, i) => {
      const prefix = i === 0 ? '   →' : '   •'
      console.log(`${prefix} "${q}"`)
    })

    // Emit progress with expanded queries
    if (progress) {
      const variationCount = allQueries.length - 1; // Exclude original
      const queriesList = allQueries.map((q, i) =>
        i === 0 ? `→ "${q}" (original)` : `• "${q}"`
      ).join('\n')
      progress.emit('expansion_complete', `Created ${variationCount} variations to explore different aspects:\n${queriesList}`)
    }

    return allQueries
  } catch (error) {
    console.error('❌ Query expansion failed:', error)
    return [originalQuery]
  }
}
