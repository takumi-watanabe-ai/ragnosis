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
   * Rerank results using semantic similarity
   * This is a lightweight reranking using embedding similarity
   * For true cross-encoder, we'd need a different model
   */
  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 15
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results

    console.log(`🔀 Reranking ${results.length} results...`)

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

      const scoredResults = results.map((result, index) => {
        const contentEmbedding = queryEmbedding[index];
        const similarity = this.cosineSimilarity(queryEmbedding, contentEmbedding);
        const combinedScore = (similarity * 0.7) + ((result.rerank_score || 0) * 0.3);

        return {
          ...result,
          rerank_score: combinedScore,
          similarity: combinedScore
        };
      });

      // Sort by combined score and return top K
      const reranked = scoredResults
        .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
        .slice(0, topK)

      console.log(`✅ Reranking complete, returning top ${reranked.length}`)

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
