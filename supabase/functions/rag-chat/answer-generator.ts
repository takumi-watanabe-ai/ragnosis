/**
 * Answer Generator - Step 3: Synthesize answer from data sources
 * Single LLM call to generate final answer
 */

import type { SearchResult, QueryIntent } from './types.ts'
import { config } from './config.ts'

/**
 * Generate answer from search results
 */
export async function generateAnswer(
  query: string,
  results: SearchResult[],
  intent: QueryIntent
): Promise<string> {
  // For market intelligence list queries, use direct formatting (no LLM hallucination)
  const isListQuery = /\b(top|best|popular|trending|list)\b/i.test(query)
  if (intent === 'market_intelligence' && isListQuery && results.length > 0) {
    return formatMarketIntelligence(results)
  }

  // Otherwise use LLM to synthesize answer
  const prompt = buildAnswerPrompt(query, results, intent)

  try {
    const response = await fetch(`${config.llm.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.llm.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1000
        }
      })
    })

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.response.trim()
  } catch (error) {
    console.error('❌ Answer generation failed:', error)
    return 'Sorry, I encountered an error generating the answer. Please try again.'
  }
}

/**
 * Direct formatting for market intelligence (no LLM to prevent hallucination)
 */
function formatMarketIntelligence(results: SearchResult[]): string {
  const docType = results[0]?.doc_type
  let answer = ''

  results.forEach((item, i) => {
    const num = i + 1
    answer += `\n${num}. **[${item.name}](${item.url})**\n`

    if (docType === 'hf_model') {
      if (item.downloads) answer += `   - Downloads: ${item.downloads.toLocaleString()}\n`
      if (item.likes) answer += `   - Likes: ${item.likes.toLocaleString()}\n`
      if (item.ranking_position) answer += `   - Ranking: #${item.ranking_position}\n`
      if (item.author) answer += `   - Author: ${item.author}\n`
    } else if (docType === 'github_repo') {
      if (item.stars) answer += `   - Stars: ${item.stars.toLocaleString()}\n`
      if (item.forks) answer += `   - Forks: ${item.forks.toLocaleString()}\n`
      if (item.owner) answer += `   - Owner: ${item.owner}\n`
      if (item.language) answer += `   - Language: ${item.language}\n`
    } else if (docType === 'google_trend') {
      if (item.current_interest) answer += `   - Current Interest: ${item.current_interest}%\n`
      if (item.avg_interest) answer += `   - Average Interest: ${item.avg_interest.toFixed(1)}%\n`
      if (item.trend_direction) answer += `   - Trend: ${item.trend_direction}\n`
      if (item.peak_interest) answer += `   - Peak Interest: ${item.peak_interest}%\n`
    }
  })

  return answer.trim()
}

/**
 * Build LLM prompt for answer synthesis
 */
function buildAnswerPrompt(query: string, results: SearchResult[], intent: QueryIntent): string {
  // Build context from results
  let context = 'SOURCES:\n'

  results.forEach((item, i) => {
    const num = i + 1
    const cleanName = item.name.replace(/\s*\(part\s+\d+\/\d+\)\s*$/i, '').trim()
    const sourceLink = `**[${cleanName}](${item.url})**`

    context += `\n[${num}] ${sourceLink}`

    // Add type indicator
    if (item.doc_type === 'hf_model') context += ` (Type: HuggingFace Model)`
    else if (item.doc_type === 'github_repo') context += ` (Type: GitHub Repository)`
    else if (item.doc_type === 'blog_article') context += ` (Type: Blog Article)`
    else if (item.doc_type === 'google_trend') context += ` (Type: Google Trend)`

    context += '\n'

    // Add metrics
    if (item.doc_type === 'hf_model') {
      if (item.downloads) context += `   Downloads: ${item.downloads.toLocaleString()}\n`
      if (item.likes) context += `   Likes: ${item.likes.toLocaleString()}\n`
      if (item.author) context += `   Author: ${item.author}\n`
      if (item.rag_category) context += `   Category: ${item.rag_category}\n`
    } else if (item.doc_type === 'github_repo') {
      if (item.stars) context += `   Stars: ${item.stars.toLocaleString()}\n`
      if (item.forks) context += `   Forks: ${item.forks.toLocaleString()}\n`
      if (item.owner) context += `   Owner: ${item.owner}\n`
      if (item.language) context += `   Language: ${item.language}\n`
    } else if (item.doc_type === 'google_trend') {
      if (item.current_interest) context += `   Current Interest: ${item.current_interest}%\n`
      if (item.trend_direction) context += `   Trend: ${item.trend_direction}\n`
    } else if (item.doc_type === 'blog_article') {
      if (item.content) {
        const excerpt = item.content.substring(0, 500).trim()
        context += `   ${excerpt}...\n`
      }
    }

    if (item.description && item.doc_type !== 'blog_article') {
      const desc = item.description.substring(0, 200).trim()
      context += `   ${desc}\n`
    }
  })

  // Build intent-specific instructions
  const instructions = getInstructionsByIntent(intent)

  return `${context}

Question: ${query}

${instructions}

Answer:`
}

/**
 * Get instructions based on query intent
 */
function getInstructionsByIntent(intent: QueryIntent): string {
  const baseRules = `You are a RAG/ML expert. Answer STRICTLY using ONLY the sources above.

CRITICAL GROUNDING RULES:
- Use ONLY information explicitly shown in the SOURCES section
- Do NOT use your training knowledge or make assumptions
- Every fact MUST come from the provided sources
- If something is not in SOURCES, do not mention it
- CRITICAL: Every time you reference a source, copy its EXACT link format from SOURCES (includes **[Name](url)**)`

  switch (intent) {
    case 'market_intelligence':
      return `${baseRules}

Requirements:
- RESPECT SOURCE TYPES: If asked about "models", only use HuggingFace Model sources. If asked about "repos/tools", only use GitHub Repository sources.
- ONLY use metrics explicitly shown (downloads/likes/stars/forks)
- Include ALL provided metrics with exact numbers
- Use ALL relevant sources of the correct type
- Be concise but comprehensive`

    case 'implementation':
      return `${baseRules}

Requirements:
- Provide actionable, step-by-step guidance
- Include specific parameters and configurations from sources
- Explain what to do AND why it works
- Cover alternatives and trade-offs if mentioned
- Be concise - focus on actionable information`

    case 'troubleshooting':
      return `${baseRules}

Requirements:
- Explain root causes and symptoms
- Provide ALL solutions from sources with specific details
- Indicate which solutions work best for which scenarios
- Include prevention best practices
- Be concise - prioritize actionable solutions`

    case 'comparison':
      return `${baseRules}

Requirements:
- Compare ALL items with features, performance, and use cases from sources
- Use markdown table for 3+ items, otherwise clear sections
- Provide "Use X if..." decision guidance
- Be concise - focus on key differentiators`

    case 'conceptual':
    default:
      return `${baseRules}

Requirements:
- Answer directly covering what, why, and how from sources
- Include definitions, mechanisms, use cases, and trade-offs
- Synthesize across sources - show different perspectives
- Be concise yet thorough - focus on understanding`
  }
}
