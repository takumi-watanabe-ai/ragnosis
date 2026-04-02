/**
 * Cross-Encoder Reranker - Rerank results for better precision/recall
 * Uses semantic similarity scoring between query and documents
 */

import type { SearchResult } from './types.ts'
import { config } from './config.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

export class CrossEncoderReranker {
  private aiSession: any = null

  /**
   * Rerank results using semantic similarity or lightweight text matching
   * For models/repos: uses fast text matching to avoid CPU timeout
   * For blogs: uses full embedding similarity
   */
  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 15
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results

    console.log(`🔀 Reranking ${results.length} results...`)

    // For models/repos with many results, use lightweight text matching
    const isStructuredData = results[0]?.doc_type === 'hf_model' || results[0]?.doc_type === 'github_repo'
    if (isStructuredData && results.length > 30) {
      return this.lightweightRerank(query, results, topK)
    }

    // For blog articles or small result sets, use full semantic reranking
    return this.semanticRerank(query, results, topK)
  }

  /**
   * Fast text-based reranking for models/repos (no embeddings needed)
   */
  private lightweightRerank(
    query: string,
    results: SearchResult[],
    topK: number
  ): SearchResult[] {
    const queryLower = query.toLowerCase()
    const queryTerms = queryLower.split(/\s+/)

    const scored = results.map(result => {
      const content = this.getRelevantContent(result).toLowerCase()

      // Calculate score based on term matches
      let score = 0

      // Exact name match (highest weight)
      if (content.includes(queryLower)) score += 10

      // Term matches
      queryTerms.forEach(term => {
        if (content.includes(term)) score += 2
      })

      // Boost for popular items (downloads/stars)
      const popularity = result.downloads || result.stars || 0
      score += Math.log10(popularity + 1) * 0.1

      return {
        ...result,
        rerank_score: score,
        similarity: score
      }
    })

    const reranked = scored
      .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
      .slice(0, topK)

    console.log(`✅ Lightweight reranking complete, returning top ${reranked.length}`)
    return reranked
  }

  /**
   * Full semantic reranking using embeddings
   */
  private async semanticRerank(
    query: string,
    results: SearchResult[],
    topK: number
  ): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      if (!this.aiSession) {
        // @ts-ignore
        this.aiSession = new Supabase.ai.Session(config.embedding.model)
      }

      const queryEmbedding = await this.aiSession.run(query, {
        mean_pool: true,
        normalize: true
      })

      // Generate embeddings for all result contents in parallel
      const contentTexts = results.map(r => this.getRelevantContent(r))
      const contentEmbeddings = await Promise.all(
        contentTexts.map(text =>
          this.aiSession.run(text, { mean_pool: true, normalize: true })
        )
      )

      const scoredResults = results.map((result, index) => {
        const contentEmbedding = contentEmbeddings[index]
        const similarity = this.cosineSimilarity(queryEmbedding, contentEmbedding)
        const combinedScore = (similarity * 0.7) + ((result.rerank_score || 0) * 0.3)

        return {
          ...result,
          rerank_score: combinedScore,
          similarity: combinedScore
        }
      })

      // Sort by combined score and return top K
      const reranked = scoredResults
        .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
        .slice(0, topK)

      console.log(`✅ Semantic reranking complete, returning top ${reranked.length}`)

      return reranked
    } catch (error) {
      console.error('❌ Reranking failed:', error)
      // Return original results if reranking fails
      return results.slice(0, topK)
    }
  }

  /**
   * Get relevant content for reranking
   */
  private getRelevantContent(result: SearchResult): string {
    const parts: string[] = [result.name]

    if (result.description) {
      parts.push(result.description)
    }

    // For models/repos, include task and topics for better matching
    if (result.doc_type === 'hf_model' || result.doc_type === 'github_repo') {
      if (result.task) parts.push(`Task: ${result.task}`)
      if (result.rag_category) parts.push(`Category: ${result.rag_category}`)
      if (result.author) parts.push(`Author: ${result.author}`)
      if (result.owner) parts.push(`Owner: ${result.owner}`)
    }

    if (result.content) {
      // Use first 500 chars of content
      parts.push(result.content.substring(0, 500))
    }

    return parts.join(' ').substring(0, 1000)
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
    }

    // Since embeddings are normalized, dot product = cosine similarity
    return dotProduct
  }
}
