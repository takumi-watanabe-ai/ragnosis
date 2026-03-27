import type { EnrichedResult } from '../_shared/types.ts'
import { config } from './config.ts'

/**
 * Build prompt based on query intent
 */
function buildPrompt(query: string, context: string, intent: string, answerMode: string): string {
  const completionNote = '\n\nBe concise and complete.'
  // Market Intelligence: Lists with metrics
  if (intent === 'market_intelligence') {
    return `${context}

Question: ${query}

List the top items with metrics. Cite sources using their names and URLs from the numbered list above as clickable markdown links.

Example:
The top models include **[Llama 3.1](https://...)** (50M downloads), **[Mistral 7B](https://...)** (20M downloads), and others.

- **[Llama 3.1](https://...)**: Excellent for instruction following
- **[Mistral 7B](https://...)**: Fast inference, good quality

Include all relevant items from the sources.${completionNote}

Answer:`
  }

  // Implementation/How-to: Solutions and steps
  if (intent === 'implementation') {
    return `${context}

Question: ${query}

Provide actionable steps. Cite sources naturally using their names and URLs from the numbered list above.

Example:
To implement RAG chunking, follow these steps as recommended by **[LangChain Documentation](https://...)** and **[OpenAI Best Practices](https://...)**:

Steps:
- Start with 512-token chunks aligned to your embedding model
- Use 20% overlap to preserve context boundaries
- Test and adjust based on retrieval quality${completionNote}

Answer:`
  }

  // Troubleshooting: Problem → Solution
  if (intent === 'troubleshooting') {
    return `${context}

Question: ${query}

Explain the issue and provide solutions. Cite sources naturally using their names and URLs from the numbered list above.

Example:
The issue occurs when chunk sizes are improperly configured, as highlighted by **[Chunking Best Practices](https://...)** and **[RAG Pipeline Guide](https://...)**.

Solutions:
- **[Chunking Best Practices](https://...)** recommends adjusting chunk size based on your embedding model
- **[RAG Pipeline Guide](https://...)** suggests using 20% overlap between chunks
- Additional recommendations${completionNote}

Answer:`
  }

  // Comparison: Side-by-side
  if (intent === 'comparison') {
    return `${context}

Question: ${query}

Compare options from the sources. Cite naturally using their names and URLs from the numbered list above.

Example:
**[Character-based Splitting](https://...)**: Simple, fast, works for most text
**[Recursive Splitting](https://...)**: Preserves structure, better for code
**[Semantic Chunking](https://...)**: Context-aware, slower but higher quality

Trade-offs:
- Character-based is fastest but may split mid-sentence
- Recursive preserves hierarchy but requires more configuration
- Semantic gives best quality but has higher latency${completionNote}

Answer:`
  }

  // Conceptual/Default: Explanation
  return `${context}

Question: ${query}

Explain the concept clearly. Cite sources naturally using their names and URLs from the numbered list above.

Example:
Chunking in RAG refers to breaking documents into smaller segments for efficient retrieval, as explained by **[RAG Fundamentals](https://...)** and **[Vector Database Guide](https://...)**.

Key points:
- Chunk size affects retrieval precision and context preservation
- Overlap between chunks helps maintain continuity
- Different strategies work better for different content types${completionNote}

Answer:`
}

/**
 * Generate answer using LLM (Ollama).
 */
export async function generateAnswer(
  query: string,
  results: EnrichedResult[],
  intent: string = 'conceptual',
  answerMode: string = 'standard'
): Promise<string> {
  const { url: ollamaUrl, model: ollamaModel, maxTokensSafetyCeiling, stopSequences } = config.llm

  // Build context from enriched results
  let context = 'SOURCES:\n'
  results.forEach((item, i) => {
    const num = i + 1
    // Clean up chunk markers like "(part 3/6)" from titles
    const cleanName = item.name.replace(/\s*\(part\s+\d+\/\d+\)\s*$/i, '').trim()

    // Include relevance score in title for blog articles
    if (item.doc_type === 'blog_article' && (item as any).similarity) {
      const relevanceScore = ((item as any).similarity * 100).toFixed(1)
      context += `\n[${num}] ${cleanName} [Relevance: ${relevanceScore}%]\n`
    } else {
      context += `\n[${num}] ${cleanName}\n`
    }

    // Handle different doc types
    if (item.doc_type === 'blog_article') {
      context += `   Type: Blog Article\n`
      if ((item as any).source) {
        context += `   Source: ${(item as any).source}\n`
      }
      if ((item as any).published_at) {
        context += `   Published: ${new Date((item as any).published_at).toLocaleDateString()}\n`
      }
    } else if (item.doc_type === 'hf_model') {
      context += `   Type: HuggingFace Model\n`
    } else if (item.doc_type === 'github_repo') {
      context += `   Type: GitHub Repository\n`
    } else if (item.doc_type === 'trend') {
      context += `   Type: Google Trend\n`
    }

    if (item.description) {
      // Use full description for better LLM context (critical details often come later)
      context += `   Description: ${item.description}\n`
    }

    if (item.rag_category) {
      context += `   Category: ${item.rag_category}\n`
    }

    // Add metrics
    if (item.downloads) {
      context += `   Downloads: ${item.downloads.toLocaleString()}\n`
    }
    if (item.likes) {
      context += `   Likes: ${item.likes.toLocaleString()}\n`
    }
    if (item.stars) {
      context += `   Stars: ${item.stars.toLocaleString()}\n`
    }
    if (item.forks) {
      context += `   Forks: ${item.forks.toLocaleString()}\n`
    }
    if (item.ranking_position) {
      context += `   Ranking: #${item.ranking_position}\n`
    }

    context += `   URL: ${item.url}\n`
  })

  // Build intent-specific prompt
  const prompt = buildPrompt(query, context, intent, answerMode)

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
      options: {
        temperature: 0.5,  // Increased from 0.3 for better instruction following
        num_predict: maxTokensSafetyCeiling,  // Safety ceiling to allow completion
        stop: stopSequences  // Stop at unwanted patterns
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.response.trim()
}
