/**
 * Semantic Reranker - Rerank results using existing embeddings
 * Uses preserved vector similarity scores (already semantic!)
 * No new embedding generation - reuses DB embeddings
 * Tag filtering is done at SQL level for efficiency
 */

import type { SearchResult } from './types.ts'

export class CrossEncoderReranker {
  /**
   * Rerank results using semantic similarity + BM25
   * Leverages existing vector similarity scores from DB
   * No embedding generation needed!
   */
  async rerank(
    query: string,
    results: SearchResult[],
    topK: number = 15
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results

    console.log(`🔀 Reranking ${results.length} results with semantic scoring...`)

    // Score each result using semantic similarity as primary signal
    const scored = results.map(result => {
      // Start with semantic similarity from vector search (0-1 range typically)
      // This is the MAIN signal - already computed with DB embeddings!
      let score = (result.vector_similarity || 0) * 10 // Scale to 0-10 range

      // Add BM25 signal for keyword matching (scaled down)
      if (result.bm25_rank) {
        score += result.bm25_rank * 0.5  // BM25 as secondary signal
      }

      return {
        ...result,
        rerank_score: score,
        similarity: score
      }
    })

    // Sort by combined score and return top K
    const reranked = scored
      .sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0))
      .slice(0, topK)

    console.log(`✅ Semantic reranking complete, returning top ${reranked.length}`)
    if (reranked.length > 0) {
      console.log(`   Top result: "${reranked[0].name.substring(0, 60)}..." (score: ${reranked[0].rerank_score?.toFixed(2)})`)
    }
    return reranked
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
      if (result.author) parts.push(`Author: ${result.author}`)
      if (result.owner) parts.push(`Owner: ${result.owner}`)
    }

    if (result.content) {
      // Use first 500 chars of content
      parts.push(result.content.substring(0, 500))
    }

    return parts.join(' ').substring(0, 1000)
  }

}
