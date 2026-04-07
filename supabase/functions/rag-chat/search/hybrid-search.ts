/**
 * Hybrid search - combines vector (k-NN) + full-text (BM25) search
 * Uses Reciprocal Rank Fusion (RRF) to merge results
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SearchResult } from '../types.ts'
import { createReranker } from '../reranker.ts'
import { config } from '../config.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

interface SearchConfig {
  candidateCount: number
  finalResultCount: number
  descriptionMax: number
}

export interface SearchFilters {
  doc_type?: 'hf_model' | 'github_repo' | 'knowledge_base'
  category?: string
  author?: string
  owner?: string
  nouns?: string[]  // Key nouns for BM25 filtering
  doc_type_weights?: {
    knowledge_base: number
    hf_model: number
    github_repo: number
  }
}

export class HybridSearch {
  private aiSession: any = null
  private reranker: ReturnType<typeof createReranker>

  constructor(
    private supabase: ReturnType<typeof createClient>,
    private config: SearchConfig,
    private embeddingModel: string
  ) {
    this.reranker = createReranker(embeddingModel)
  }

  /**
   * Rerank a set of results (public method for post-processing)
   */
  async rerankResults(
    query: string,
    results: SearchResult[],
    limit: number
  ): Promise<SearchResult[]> {
    return await this.reranker.rerank(query, results, limit, this.supabase)
  }

  /**
   * Perform hybrid search combining vector and text search
   */
  async search(
    query: string,
    limit: number,
    filters?: SearchFilters,
    verbose: boolean = true,
    skipFinalReranking: boolean = false
  ): Promise<SearchResult[]> {
    if (verbose) {
      console.log(`🔍 Hybrid search (k-NN + BM25): "${query}"`)
      if (filters?.nouns?.length) {
        console.log(`🎯 BM25 noun filtering enabled:`, filters.nouns)
      }
    }

    // Run both searches in parallel
    const [vectorResults, textResults] = await Promise.all([
      this.performVectorSearch(query, filters, verbose),
      this.performTextSearch(query, filters, verbose)
    ])

    if (verbose) {
      console.log(`📊 Vector search: ${vectorResults.length} results`)
      console.log(`📊 Text search: ${textResults.length} results`)
    }

    // AUGMENTATION: If doc_type weights show strong preference for models/repos,
    // fetch top-ranked items to ensure good candidates in the pool
    let augmentedVectorResults = vectorResults
    let augmentedTextResults = textResults
    
    if (filters?.doc_type_weights) {
      const weights = filters.doc_type_weights
      const augmentationThreshold = 0.6
      
      // Count existing results by doc_type
      const countByType = (results: SearchResult[]) => {
        const counts: Record<string, number> = {}
        results.forEach(r => {
          counts[r.doc_type] = (counts[r.doc_type] || 0) + 1
        })
        return counts
      }
      
      const combinedCounts = countByType([...vectorResults, ...textResults])
      
      // Augment with top models if: high weight AND few existing models
      if (weights.hf_model >= augmentationThreshold && (combinedCounts.hf_model || 0) < 10) {
        const topModels = await this.fetchTopModels(query, 20, filters?.author)
        if (topModels.length > 0) {
          augmentedVectorResults = [...augmentedVectorResults, ...topModels]
          if (verbose) {
            console.log(`🔝 Augmented with ${topModels.length} top HF models (weight: ${weights.hf_model})`)
          }
        }
      }
      
      // Augment with top repos if: high weight AND few existing repos
      if (weights.github_repo >= augmentationThreshold && (combinedCounts.github_repo || 0) < 10) {
        const topRepos = await this.fetchTopRepos(query, 20, filters?.owner)
        if (topRepos.length > 0) {
          augmentedTextResults = [...augmentedTextResults, ...topRepos]
          if (verbose) {
            console.log(`🔝 Augmented with ${topRepos.length} top GitHub repos (weight: ${weights.github_repo})`)
          }
        }
      }
    }

    // Merge with Reciprocal Rank Fusion (RRF) - fair fusion first
    let merged = this.mergeWithRRF(augmentedVectorResults, augmentedTextResults, this.config.candidateCount * 2, filters, verbose)
    if (verbose) {
      console.log(`📊 Merged: ${merged.length} unique results`)
    }

    // Apply doc_type weights AFTER RRF, BEFORE reranking
    // This boosts preferred doc types in the merged candidate pool
    if (filters?.doc_type_weights) {
      const weights = filters.doc_type_weights
      if (verbose) {
        console.log('🎯 Applying doc_type weights to RRF scores:', weights)
      }
      
      merged = merged.map(r => ({
        ...r,
        similarity: (r.similarity || 0) * (weights[r.doc_type] || 0.5),
        rerank_score: (r.rerank_score || 0) * (weights[r.doc_type] || 0.5)
      }))
      
      // Re-sort by weighted scores
      merged.sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
      
      if (verbose) {
        console.log(`✅ Re-sorted ${merged.length} results by weighted scores`)
      }
    }

    // Skip reranking if requested (e.g., for query expansion where we rerank later)
    if (skipFinalReranking) {
      if (verbose) {
        console.log(`⏭️  Skipping reranking, returning ${merged.length} merged candidates`)
      }
      return merged
    }

    // Rerank merged results (checks feature flag for cross-encoder)
    const reranked = await this.reranker.rerank(query, merged, this.config.finalResultCount, this.supabase)
    if (verbose) {
      console.log(`✅ Hybrid search complete: ${reranked.length} results after reranking`)
    }

    return reranked
  }

  /**
   * Fetch top models by downloads for augmentation
   */
  private async fetchTopModels(
    query: string,
    limit: number,
    author?: string
  ): Promise<SearchResult[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_top_models', {
        match_limit: limit,
        filter_author: author || null
      })

      if (error) {
        console.error(`❌ Failed to fetch top models:`, error)
        return []
      }

      return (data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description || '',
        url: m.url,
        doc_type: 'hf_model' as const,
        similarity: 0.5, // Lower initial score so semantic matches can win
        rerank_score: 0.5,
        downloads: m.downloads,
        likes: m.likes,
        ranking_position: m.ranking_position,
        author: m.author,
        task: m.task
      }))
    } catch (err) {
      console.error(`❌ Exception fetching top models:`, err)
      return []
    }
  }

  /**
   * Fetch top repos by stars for augmentation
   */
  private async fetchTopRepos(
    query: string,
    limit: number,
    owner?: string
  ): Promise<SearchResult[]> {
    try {
      const { data, error } = await this.supabase.rpc('get_top_repos', {
        match_limit: limit,
        filter_owner: owner || null
      })

      if (error) {
        console.error(`❌ Failed to fetch top repos:`, error)
        return []
      }

      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        url: r.url,
        doc_type: 'github_repo' as const,
        similarity: 0.5, // Lower initial score so semantic matches can win
        rerank_score: 0.5,
        stars: r.stars,
        forks: r.forks,
        ranking_position: r.ranking_position,
        owner: r.owner,
        language: r.language
      }))
    } catch (err) {
      console.error(`❌ Exception fetching top repos:`, err)
      return []
    }
  }

  /**
   * Vector search using k-NN
   */
  private async performVectorSearch(query: string, filters?: SearchFilters, verbose: boolean = true): Promise<SearchResult[]> {
    // Generate embedding
    let embedding: number[]
    try {
      if (!this.aiSession) {
        if (verbose) {
          console.log(`🤖 Initializing AI session with model: ${this.embeddingModel}`)
        }
        // @ts-ignore
        this.aiSession = new Supabase.ai.Session(this.embeddingModel)
      }

      embedding = await this.aiSession.run(query, { mean_pool: true, normalize: true })
    } catch (error) {
      console.error('❌ Embedding generation failed:', error)
      return []
    }

    // Vector search params
    const rpcParams = {
      query_embedding: embedding,
      match_count: this.config.candidateCount,
      filter_doc_type: filters?.doc_type || null
    }

    const { data, error } = await this.supabase.rpc('match_documents', rpcParams)

    if (error) {
      console.error('❌ Vector search failed:', error)
      return []
    }

    const results = (data || []).map((d: any) => {
      const result = this.mapToSearchResult(d, d.similarity || 0)
      result.vector_similarity = d.similarity || 0  // Preserve original vector similarity
      return result
    })

    // Tag filtering now done in SQL for better performance
    return results
  }

  /**
   * Full-text search using BM25
   */
  private async performTextSearch(query: string, filters?: SearchFilters, verbose: boolean = true): Promise<SearchResult[]> {
    const rpcParams = {
      search_query: query,
      match_limit: this.config.candidateCount,
      filter_doc_type: filters?.doc_type || null,
      filter_nouns: filters?.nouns || null
    }
    if (verbose) {
      console.log('🔍 Text search RPC params:', JSON.stringify(rpcParams, null, 2))
    }

    const { data, error } = await this.supabase.rpc('text_search_documents', rpcParams)

    if (error) {
      console.error('❌ Text search failed:', error)
      return []
    }

    if (!data || !data.success) {
      console.error('❌ Text search returned error:', data?.error)
      return []
    }

    const results = (data.data?.results || []).map((d: any) => {
      const result = this.mapToSearchResult(d, d.rank || 0)
      result.bm25_rank = d.rank || 0  // Preserve original BM25 rank
      return result
    })

    // Tag filtering now done in SQL for better performance
    return results
  }

  /**
   * Merge results using weighted Reciprocal Rank Fusion (RRF)
   * RRF formula: score(d) = sum(weight * 1 / (k + rank(d))) for each ranking
   * Weights from config: 60% vector (semantic), 40% BM25 (keyword)
   * Doc_type_weights are applied AFTER this merge in the search() method
   * Note: BM25 results are pre-filtered by nouns at the query level
   */
  private mergeWithRRF(
    vectorResults: SearchResult[],
    textResults: SearchResult[],
    limit: number,
    filters?: SearchFilters,
    verbose: boolean = true
  ): SearchResult[] {
    const k = 60  // RRF constant (typical value)
    const vectorWeight = config.search.reranker.fusion.vectorWeight
    const keywordWeight = config.search.reranker.fusion.bm25Weight
    const scores = new Map<string, { result: SearchResult; score: number }>()

    // Add vector search scores (weighted by config)
    vectorResults.forEach((result, index) => {
      const rank = index + 1
      const score = vectorWeight * (1 / (k + rank))
      scores.set(result.id, { result, score })
    })

    // Add BM25 text search scores (weighted by config)
    textResults.forEach((result, index) => {
      const rank = index + 1
      const score = keywordWeight * (1 / (k + rank))

      if (scores.has(result.id)) {
        // Document appears in both - add weighted scores
        scores.get(result.id)!.score += score
      } else {
        scores.set(result.id, { result, score })
      }
    })

    // Sort by RRF score (no artificial weight multiplication)
    // Augmentation already ensured we have the right candidates
    // Let the reranker judge them fairly
    const sorted = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ result, score }) => ({
        ...result,
        rerank_score: score,
        similarity: score
      }))

    // Keep top N chunks per URL (for chunked documents)
    const maxChunks = config.search.maxChunksPerUrl
    if (verbose) {
      console.log(`🔗 Keeping up to ${maxChunks} chunks per URL`)
    }

    const urlMap = new Map<string, SearchResult[]>()
    sorted.forEach(r => {
      if (!urlMap.has(r.url)) {
        urlMap.set(r.url, [])
      }
      const chunks = urlMap.get(r.url)!
      if (chunks.length < maxChunks) {
        chunks.push(r)
      }
    })

    // Flatten back to array, maintaining sort order
    const deduplicated = Array.from(urlMap.values()).flat()

    if (verbose) {
      console.log(`📊 Fair RRF merge without artificial weight boosting`)
      console.log(`✅ Returning top ${Math.min(limit, deduplicated.length)} candidates for reranking`)
      if (deduplicated.length > 0) {
        const topResult = deduplicated[0]
        const cleanName = topResult.name.length > 50
          ? topResult.name.substring(0, 47) + '...'
          : topResult.name
        console.log(`   Top result: "${cleanName}" (RRF score: ${topResult.similarity?.toFixed(3)})`)
      }
    }

    return deduplicated.slice(0, limit)
  }

  /**
   * Map database result to SearchResult
   */
  private mapToSearchResult(d: any, score: number): SearchResult {
    return {
      id: d.id,
      name: d.name || '',
      description: d.description || d.text?.substring(0, this.config.descriptionMax) || '',
      url: d.url,
      doc_type: d.doc_type,
      similarity: score,
      rerank_score: score,
      topics: d.topics || [],  // Include topics for tag matching
      downloads: d.downloads,
      stars: d.stars,
      likes: d.likes,
      forks: d.forks,
      ranking_position: d.ranking_position,
      author: d.author,
      owner: d.owner,
      language: d.language,
      task: d.task,
      published_at: d.published_at,
      content_source: d.content_source,
      snapshot_date: d.snapshot_date
    }
  }
}
