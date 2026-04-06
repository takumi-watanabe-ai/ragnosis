/**
 * Reranking strategies for search results
 * - ScoreFusion: Fast, combines existing vector + BM25 scores
 * - CrossEncoder: Slower but more accurate, uses gte-small to encode query+doc together
 */

import type { SearchResult } from './types.ts'
import { config } from './config.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

/**
 * Pass-through reranker - uses RRF scores directly without reranking
 */
export class PassThroughReranker {
  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 20
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results

    console.log(`📊 Using RRF scores directly`)

    // Results already have rerank_score from RRF merge
    // Just return top K (already sorted from RRF)
    const top = results.slice(0, topK)

    console.log(`✅ Returning top ${top.length} from RRF`)
    if (top.length > 0) {
      const vectorSim = top[0].vector_similarity?.toFixed(3) || 'N/A'
      const bm25Rank = top[0].bm25_rank ? `#${top[0].bm25_rank}` : 'N/A'
      console.log(`   Top result: "${top[0].name.substring(0, 60)}..." (vector: ${vectorSim}, bm25: ${bm25Rank})`)
    }

    return top
  }
}

/**
 * Cross-encoder reranker - uses gte-small to encode query+doc together
 * Simulates cross-encoder behavior with bi-encoder by:
 * 1. Embedding query alone
 * 2. Embedding query + document together
 * 3. Comparing the combined embedding to measure relevance
 *
 * Optimization: Only reranks top candidates to reduce CPU load
 */
export class CrossEncoderReranker {
  private aiSession: any = null
  private embeddingModel: string
  private maxCandidates: number

  constructor(embeddingModel: string = 'gte-small', maxCandidates: number = 50) {
    this.embeddingModel = embeddingModel
    this.maxCandidates = maxCandidates
  }

  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 20
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results

    // Limit candidates to reduce CPU load
    const candidates = results.slice(0, this.maxCandidates)
    console.log(`🔀 Cross-encoder reranking top ${candidates.length} candidates (max: ${this.maxCandidates})...`)

    try {
      // Initialize AI session if needed
      if (!this.aiSession) {
        console.log(`🤖 Initializing AI session for cross-encoding: ${this.embeddingModel}`)
        this.aiSession = new Supabase.ai.Session(this.embeddingModel)
      }

      // Embed query once
      const queryEmbedding = await this.aiSession.run(query, { mean_pool: true, normalize: true })

      // Score each candidate by embedding query + document together
      const scoredPromises = candidates.map(async (result) => {
        const docText = this.getDocumentText(result)

        // Embed query + document together
        const combinedText = `${query} ${docText}`
        const combinedEmbedding = await this.aiSession.run(combinedText, { mean_pool: true, normalize: true })

        // Calculate relevance as similarity between combined and query
        // Higher similarity means the document is more relevant to the query
        const relevanceScore = this.cosineSimilarity(combinedEmbedding, queryEmbedding)

        return {
          ...result,
          rerank_score: relevanceScore,
          similarity: relevanceScore
        }
      })

      const scored = await Promise.all(scoredPromises)

      // Sort by relevance score and return top K
      const reranked = scored
        .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
        .slice(0, topK)

      console.log(`✅ Cross-encoder reranking complete, returning top ${reranked.length}`)
      if (reranked.length > 0) {
        console.log(`   Top result: "${reranked[0].name.substring(0, 60)}..." (score: ${reranked[0].rerank_score?.toFixed(4)})`)
      }

      return reranked

    } catch (error) {
      console.error('❌ Cross-encoder reranking failed, using RRF scores:', error)
      // Fallback to RRF scores
      const fallback = new PassThroughReranker()
      return fallback.rerank(query, results, topK)
    }
  }

  /**
   * Extract text from document for cross-encoding
   */
  private getDocumentText(result: SearchResult): string {
    const { maxChars } = config.search.reranker.crossEncoder
    const parts: string[] = []

    if (result.name) parts.push(result.name)
    if (result.description) parts.push(result.description)

    // For models/repos, include task for better context
    if (result.doc_type === 'hf_model' || result.doc_type === 'github_repo') {
      if (result.task) parts.push(result.task)
    }

    return parts.join(' ').substring(0, maxChars)
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Embeddings must have same length')
    }

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
}

/**
 * Factory function to create reranker
 * Uses feature flag to determine if cross-encoder should be used
 */
export function createReranker(embeddingModel: string = 'gte-small') {
  // Return an object that will check feature flag at runtime
  return {
    async rerank(query: string, results: SearchResult[], topK: number, supabase?: any): Promise<SearchResult[]> {
      // Check feature flag if supabase client provided
      if (supabase) {
        const { getFeatureFlagService } = await import('./services/feature-flags.ts')
        const featureFlags = getFeatureFlagService(supabase)
        const useCrossEncoder = await featureFlags.isEnabled('cross_encoder_reranking')

        if (useCrossEncoder) {
          const maxCandidates = config.search.reranker.crossEncoder.maxCandidates || 50
          const reranker = new CrossEncoderReranker(embeddingModel, maxCandidates)
          return reranker.rerank(query, results, topK)
        }
      }

      // Default: use RRF scores directly (no reranking)
      const reranker = new PassThroughReranker()
      return reranker.rerank(query, results, topK)
    }
  }
}
