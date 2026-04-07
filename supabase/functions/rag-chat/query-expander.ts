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

  const prompt = `You are expanding search queries for a specialized knowledge base focused on RAG (Retrieval-Augmented Generation), vector databases, embeddings, LLMs, and AI/ML tooling.

Original query: "${originalQuery}"

Generate 2 semantic variations that:
1. Preserve the exact intent and domain context of the original query
2. Interpret ambiguous terms within the RAG/vector search/AI domain
3. Use alternative technical terminology that experts in this field would use
4. Maintain the same question type and scope
5. Stay within the RAG/AI/ML domain - do not drift into unrelated software domains
6. Write in the SAME LANGUAGE as the original

Focus on semantic diversity through different vocabulary while keeping technical accuracy within the RAG domain.

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
          temperature: 0.7,  // Moderate temperature for controlled diversity
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
