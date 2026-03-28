/**
 * Unified data source interface
 * All queries in one place - no LLM calls here, just data fetching
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { DataSourceQuery, SearchResult } from './types.ts'
import { config } from './config.ts'

// Supabase.ai is globally available in edge runtime
declare const Supabase: any

const supabase = createClient(
  config.database.url,
  config.database.serviceRoleKey
)

let aiSession: any = null

// BM25-like reranking with doc_type weighting
function rerankResults(query: string, results: SearchResult[], limit: number): SearchResult[] {
  if (results.length <= 3) return results

  const stopWords = new Set(['what', 'how', 'why', 'when', 'where', 'which', 'who', 'is', 'are', 'the', 'a', 'an', 'for', 'to', 'in', 'on', 'at', 'do', 'does'])
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t))

  const scored = results.map(r => {
    const text = `${r.name} ${r.description || ''}`.toLowerCase()
    let termScore = 0, matchedTerms = 0

    queryTerms.forEach(term => {
      const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*\\b`, 'gi')
      const matches = text.match(regex)
      if (matches) {
        matchedTerms++
        termScore += matches.length + (r.name.toLowerCase().includes(term) ? 10 : 0)
      }
    })

    const completenessRatio = matchedTerms / Math.max(queryTerms.length, 1)
    const normalizedTermScore = Math.min(termScore / (queryTerms.length * 6), 1.0)
    const baseScore = ((r.similarity || 0) * 0.4) + (normalizedTermScore * 0.6)

    // Moderate boost for repos/models over blog articles (1.5x = 50% boost)
    const docTypeBoost = (r.doc_type === 'hf_model' || r.doc_type === 'github_repo') ? 1.5 : 1.0
    const rerank_score = baseScore * completenessRatio * completenessRatio * docTypeBoost

    return { ...r, rerank_score }
  })

  return scored.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0)).slice(0, limit)
}

/**
 * Execute a single data source query
 */
export async function executeDataSource(
  query: DataSourceQuery
): Promise<SearchResult[]> {
  const limit = query.params?.limit || 5

  switch (query.source) {
    case 'top_models_by_downloads':
      return await topModelsByDownloads(limit, query.params)

    case 'top_repos_by_stars':
      return await topReposByStars(limit, query.params)

    case 'search_trends':
      return await searchTrends(limit)

    case 'vector_search_unified':
      return await vectorSearchUnified(query.params?.query || '', limit)

    default:
      console.error(`Unknown data source: ${query.source}`)
      return []
  }
}

/**
 * Get top models by downloads using optimized market query
 */
async function topModelsByDownloads(
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`📊 Top models by downloads (using market query)`)

  const hasFilters = (params?.categories && params.categories.length > 0) ||
                     (params?.authors && params.authors.length > 0)

  // Try with filters first if specified
  if (hasFilters) {
    let query = supabase.from('documents').select('*').eq('doc_type', 'hf_model')

    if (params?.categories && params.categories.length > 0) {
      query = query.in('rag_category', params.categories)
    }

    if (params?.authors && params.authors.length > 0) {
      query = query.in('author', params.authors)
    }

    const { data, error } = await query
      .not('downloads', 'is', null)
      .order('downloads', { ascending: false })
      .limit(limit)

    if (!error && data && data.length > 0) {
      return data.map(m => ({
        id: m.id,
        name: m.name,
        description: m.description || '',
        url: m.url,
        doc_type: 'hf_model' as const,
        similarity: 1.0,
        rerank_score: 1.0,
        downloads: m.downloads,
        likes: m.likes,
        ranking_position: m.ranking_position,
        author: m.author,
        task: m.task,
        rag_category: m.rag_category
      }))
    }

    console.log(`⚠️  No results with filters, falling back to unfiltered query`)
  }

  // Fall back to unfiltered query
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('doc_type', 'hf_model')
    .not('downloads', 'is', null)
    .order('downloads', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('❌ Top models query failed:', error)
    return []
  }

  return (data || []).map(m => ({
    id: m.id,
    name: m.name,
    description: m.description || '',
    url: m.url,
    doc_type: 'hf_model' as const,
    similarity: 1.0,
    rerank_score: 1.0,
    downloads: m.downloads,
    likes: m.likes,
    ranking_position: m.ranking_position,
    author: m.author,
    task: m.task,
    rag_category: m.rag_category
  }))
}

/**
 * Get top repos by stars using optimized market query
 */
async function topReposByStars(
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`📊 Top repos by stars (using market query)`)

  const hasFilters = (params?.categories && params.categories.length > 0) ||
                     (params?.owners && params.owners.length > 0)

  // Try with filters first
  if (hasFilters) {
    let query = supabase.from('documents').select('*').eq('doc_type', 'github_repo')

    if (params?.categories && params.categories.length > 0) {
      query = query.in('rag_category', params.categories)
    }

    if (params?.owners && params.owners.length > 0) {
      query = query.in('owner', params.owners)
    }

    const { data, error } = await query
      .not('stars', 'is', null)
      .order('stars', { ascending: false })
      .limit(limit)

    if (!error && data && data.length > 0) {
      return data.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        url: r.url,
        doc_type: 'github_repo' as const,
        similarity: 1.0,
        rerank_score: 1.0,
        stars: r.stars,
        forks: r.forks,
        owner: r.owner,
        language: r.language,
        rag_category: r.rag_category
      }))
    }

    console.log(`⚠️  No repos with filters, falling back to unfiltered`)
  }

  // Fallback: unfiltered
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('doc_type', 'github_repo')
    .not('stars', 'is', null)
    .order('stars', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('❌ Top repos query failed:', JSON.stringify(error, null, 2))
    return []
  }

  return (data || []).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    url: r.url,
    doc_type: 'github_repo' as const,
    similarity: 1.0,
    rerank_score: 1.0,
    stars: r.stars,
    forks: r.forks,
    owner: r.owner,
    language: r.language,
    rag_category: r.rag_category
  }))
}

/**
 * Search Google Trends data
 */
async function searchTrends(limit: number): Promise<SearchResult[]> {
  console.log(`📈 Search trends`)

  const { data, error } = await supabase
    .from('google_trends')
    .select('*')
    .order('current_interest', { ascending: false })
    .limit(limit)


  if (error) {
    console.error('❌ Trends search failed:', JSON.stringify(error, null, 2))
    return []
  }

  if (!data || data.length === 0) {
    return []
  }

  return data.map(t => ({
    id: t.id,
    name: t.keyword,
    description: `Search interest: ${t.current_interest}% (avg: ${t.avg_interest?.toFixed(1)}%, peak: ${t.peak_interest}%)`,
    url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(t.keyword)}`,
    doc_type: 'google_trend' as const,
    similarity: 1.0,
    rerank_score: 1.0,
    current_interest: t.current_interest,
    avg_interest: t.avg_interest,
    peak_interest: t.peak_interest
  }))
}

/**
 * Unified vector search - single documents table with all metadata
 * NO enrichment needed - metadata is already in the table!
 */
async function vectorSearchUnified(
  searchQuery: string,
  limit: number
): Promise<SearchResult[]> {
  console.log(`🔍 Unified vector search: "${searchQuery}"`)

  // Generate embedding
  let embedding: number[]
  try {
    if (!aiSession) {
      console.log(`🤖 Initializing AI session with model: ${config.embedding.model}`)
      // @ts-ignore
      aiSession = new Supabase.ai.Session(config.embedding.model)
      console.log(`✅ AI session initialized`)
    }

    embedding = await aiSession.run(searchQuery, { mean_pool: true, normalize: true })
    console.log(`✅ Embedding generated (${embedding.length} dimensions)`)
  } catch (error) {
    console.error('❌ Embedding generation failed:', error)
    return []
  }

  // Search unified documents table - metadata included automatically!
  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: embedding,
    match_count: config.search.candidateCount,  // Always fetch 100 candidates
    filter_doc_type: null,
    filter_rag_category: null
  })

  if (error) {
    console.error('❌ Vector search failed:', JSON.stringify(error, null, 2))
    return []
  }

  const results = data || []
  console.log(`📊 Found ${results.length} candidates from unified table`)

  // Map results - all metadata is already here!
  let mapped: SearchResult[] = results.map((d: any) => ({
    id: d.id,
    name: d.name || '',
    description: d.description || d.text?.substring(0, config.search.context.descriptionMax) || '',
    url: d.url,
    doc_type: d.doc_type,
    similarity: d.similarity || 0,
    rerank_score: d.similarity || 0,
    rag_category: d.rag_category,
    content: d.text,
    // Metadata already included from documents table
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
  }))

  // Deduplicate by URL (keep highest similarity)
  const urlMap = new Map<string, SearchResult>()
  mapped.forEach(r => {
    if (!urlMap.has(r.url) || (r.similarity || 0) > (urlMap.get(r.url)!.similarity || 0)) {
      urlMap.set(r.url, r)
    }
  })
  mapped = Array.from(urlMap.values()).sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

  // Rerank with BM25 keyword matching and return top limit results
  const reranked = rerankResults(searchQuery, mapped, limit)

  console.log(`✅ Unified search complete: ${reranked.length} results from ${config.search.candidateCount} candidates`)

  return reranked
}
