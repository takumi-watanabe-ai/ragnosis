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

// BM25-like reranking from original
function rerankResults(query: string, results: SearchResult[]): SearchResult[] {
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
    const rerank_score = baseScore * completenessRatio * completenessRatio

    return { ...r, rerank_score }
  })

  return scored.sort((a, b) => (b.rerank_score || 0) - (a.rerank_score || 0)).slice(0, 5)
}

/**
 * Execute a single data source query
 */
export async function executeDataSource(
  query: DataSourceQuery
): Promise<SearchResult[]> {
  const limit = query.params?.limit || 5

  switch (query.source) {
    case 'keyword_search_models':
      return await keywordSearchModels(query.params?.query || '', limit, query.params)

    case 'keyword_search_repos':
      return await keywordSearchRepos(query.params?.query || '', limit, query.params)

    case 'top_models_by_downloads':
      return await topModelsByDownloads(limit, query.params)

    case 'top_repos_by_stars':
      return await topReposByStars(limit, query.params)

    case 'search_trends':
      return await searchTrends(limit)

    case 'vector_search_blogs':
      return await vectorSearchBlogs(query.params?.query || '', limit)

    default:
      console.error(`Unknown data source: ${query.source}`)
      return []
  }
}

/**
 * Keyword search for models using PostgreSQL full-text search
 */
async function keywordSearchModels(
  searchQuery: string,
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`🔍 Keyword search models: "${searchQuery}"`)

  const { data, error } = await supabase.rpc('keyword_search_models', {
    search_query: searchQuery,
    query_limit: limit
  })

  if (error) {
    console.error('❌ Keyword search models failed:', JSON.stringify(error, null, 2))
    return []
  }

  // Parse JSONB response - keyword search functions return wrapped structure
  const results = data?.results || []
  console.log(`✅ Keyword search models returned ${results.length} results`)

  return results.map((m: any) => ({
    id: m.id,
    name: m.name,
    description: m.description || '',
    url: m.url,
    doc_type: 'hf_model' as const,
    similarity: m.similarity || 1.0,
    rerank_score: 1.0,
    downloads: m.downloads,
    likes: m.likes,
    author: m.author,
    rag_category: m.rag_category
  }))
}

/**
 * Keyword search for repos using PostgreSQL full-text search
 */
async function keywordSearchRepos(
  searchQuery: string,
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`🔍 Keyword search repos: "${searchQuery}"`)

  const { data, error } = await supabase.rpc('keyword_search_repos', {
    search_query: searchQuery,
    query_limit: limit
  })

  if (error) {
    console.error('❌ Keyword search repos failed:', JSON.stringify(error, null, 2))
    return []
  }

  // Parse JSONB response - keyword search functions return wrapped structure
  const results = data?.results || []
  console.log(`✅ Keyword search repos returned ${results.length} results`)

  return results.map((r: any) => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    url: r.url,
    doc_type: 'github_repo' as const,
    similarity: r.similarity || 1.0,
    rerank_score: 1.0,
    stars: r.stars,
    forks: r.forks,
    owner: r.author,
    language: r.language,
    rag_category: r.rag_category
  }))
}

/**
 * Get top models by downloads (simple ranking)
 */
async function topModelsByDownloads(
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`📊 Top models by downloads`)

  let query = supabase.from('hf_models').select('*')

  // Filter by category if specified
  if (params?.categories && params.categories.length > 0) {
    query = query.in('rag_category', params.categories)
  }

  // Filter by author if specified
  if (params?.authors && params.authors.length > 0) {
    query = query.in('author', params.authors)
  }

  const { data, error } = await query
    .order('snapshot_date', { ascending: false })
    .order('downloads', { ascending: false })
    .limit(limit * 4)

  if (error) {
    console.error('❌ Top models query failed:', error)
    return []
  }

  // Deduplicate by model_name, keep latest snapshot
  const seen = new Map()
  const deduped = (data || []).filter(m => {
    if (seen.has(m.model_name)) return false
    seen.set(m.model_name, true)
    return true
  })

  return deduped.slice(0, limit).map(m => ({
    id: m.id,
    name: m.model_name,
    description: m.description || '',
    url: m.url,
    doc_type: 'hf_model' as const,
    similarity: 1.0,
    rerank_score: 1.0,
    downloads: m.downloads,
    likes: m.likes,
    ranking_position: m.ranking_position,
    author: m.author,
    rag_category: m.rag_category
  }))
}

/**
 * Get top repos by stars (simple ranking)
 */
async function topReposByStars(
  limit: number,
  params?: any
): Promise<SearchResult[]> {
  console.log(`📊 Top repos by stars`)

  let query = supabase.from('github_repos').select('*')

  // Filter by category if specified
  if (params?.categories && params.categories.length > 0) {
    query = query.in('rag_category', params.categories)
  }

  // Filter by owner if specified
  if (params?.owners && params.owners.length > 0) {
    query = query.in('owner', params.owners)
  }

  const { data, error } = await query
    .order('snapshot_date', { ascending: false })
    .order('stars', { ascending: false })
    .limit(limit * 4)


  if (error) {
    console.error('❌ Top repos query failed:', JSON.stringify(error, null, 2))
    return []
  }

  if (!data || data.length === 0) {
    return []
  }


  // Deduplicate by repo_name, keep latest snapshot
  const seen = new Map()
  const deduped = (data || []).filter(r => {
    if (seen.has(r.repo_name)) return false
    seen.set(r.repo_name, true)
    return true
  })


  return deduped.slice(0, limit).map(r => ({
    id: r.id,
    name: r.repo_name,
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
    .order('snapshot_date', { ascending: false })
    .order('current_interest', { ascending: false })
    .limit(limit * 2)


  if (error) {
    console.error('❌ Trends search failed:', JSON.stringify(error, null, 2))
    return []
  }

  if (!data || data.length === 0) {
    return []
  }


  // Deduplicate by keyword, keep latest snapshot
  const seen = new Map()
  const deduped = (data || []).filter(t => {
    if (seen.has(t.keyword)) return false
    seen.set(t.keyword, true)
    return true
  })


  return deduped.slice(0, limit).map(t => ({
    id: t.id,
    name: t.keyword,
    description: `Search interest: ${t.current_interest}% (avg: ${t.avg_interest?.toFixed(1)}%), trending ${t.trend_direction || 'stable'}`,
    url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(t.keyword)}`,
    doc_type: 'google_trend' as const,
    similarity: 1.0,
    rerank_score: 1.0,
    current_interest: t.current_interest,
    avg_interest: t.avg_interest,
    peak_interest: t.peak_interest,
    trend_direction: t.trend_direction
  }))
}

/**
 * Vector search for blog articles
 */
async function vectorSearchBlogs(
  searchQuery: string,
  limit: number
): Promise<SearchResult[]> {
  console.log(`🔍 Vector search blogs: "${searchQuery}"`)

  // Generate embedding using Supabase AI Session
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

  // Use match_blog_docs (vector search only)
  const { data, error } = await supabase.rpc('match_blog_docs', {
    query_embedding: embedding,
    match_count: limit * 2,
    filter_rag_topic: null,
    filter_source: null
  })


  if (error) {
    console.error('❌ Blog search failed:', JSON.stringify(error, null, 2))
    return []
  }

  if (!data) {
    return []
  }

  // Handle wrapped response
  const results_array = Array.isArray(data) ? data : (data.results || [])

  let results: SearchResult[] = results_array.map((d: any) => ({
    id: d.id,
    name: d.title || d.name || '',
    description: d.content?.substring(0, 200) || d.description || '',
    url: d.url,
    doc_type: 'blog_article' as const,
    similarity: d.similarity || d.rank_score || 0,
    rerank_score: d.similarity || d.rank_score || 0,
    content: d.content || d.description
  }))

  // Deduplicate by URL (keep highest similarity)
  const urlMap = new Map<string, SearchResult>()
  results.forEach(r => {
    if (!urlMap.has(r.url) || (r.similarity || 0) > (urlMap.get(r.url)!.similarity || 0)) {
      urlMap.set(r.url, r)
    }
  })
  results = Array.from(urlMap.values()).sort((a, b) => (b.similarity || 0) - (a.similarity || 0))

  // Rerank with BM25 keyword matching
  results = rerankResults(searchQuery, results)

  console.log(`✅ Vector search: ${results.length} results after dedup+rerank`)

  // TODO: Enrich repos/models with SQL metadata if found

  return results.slice(0, limit)
}
