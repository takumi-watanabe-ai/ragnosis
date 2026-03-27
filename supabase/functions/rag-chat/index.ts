/**
 * RAGnosis Query API - With LLM-Based Query Analysis
 *
 * Uses Ollama (qwen2.5:3b) for intelligent query preprocessing
 * Inspired by finance-agent's best practices
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { smartSearch } from './db.ts'
import { generateAnswer } from './llm.ts'
import { config } from './config.ts'
import { analyzeQuery, getRoutingExplanation } from './query-analyzer.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': config.cors.allowOrigin,
  'Access-Control-Allow-Headers': config.cors.allowHeaders,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, top_k = 5 } = await req.json()

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(config.database.url, config.database.serviceRoleKey)
    console.log(`📝 Query: "${query}"`)

    // Analyze query with LLM (validate, classify intent, extract entities, determine routing)
    const analysis = await analyzeQuery(query)
    console.log(`🎯 Intent: ${analysis.intent} | Source: ${analysis.source} | Mode: ${analysis.answer_mode} | Confidence: ${(analysis.confidence * 100).toFixed(0)}%`)
    console.log(`🔍 ${getRoutingExplanation(analysis)}`)

    // Reject invalid queries early
    if (!analysis.is_valid) {
      return new Response(
        JSON.stringify({
          answer: analysis.reason || 'Invalid query',
          sources: [],
          confidence: 'low',
          count: 0,
          suggestions: analysis.suggestions || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use enhanced query if available, otherwise original
    const searchQuery = analysis.enhanced_query || query

    // Smart routing based on analysis (pass entities for SQL searches)
    let results = await smartSearch(supabase, searchQuery, top_k, analysis.source, analysis.entities)

    // Filter: only pass high-quality results to LLM
    // For list queries ("top N"), be more lenient
    const qualityThreshold = 0.15
    const highQualityResults = results.filter(r => r.rerank_score && r.rerank_score > qualityThreshold)

    // Ensure we have at least 3 results for list queries
    if (highQualityResults.length >= 3) {
      results = highQualityResults
    } else if (highQualityResults.length > 0) {
      // Keep top results even if below threshold for better coverage
      results = results.slice(0, Math.max(5, highQualityResults.length))
    }

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          answer: `No results found for "${query}". Try rephrasing or being more specific.`,
          sources: [],
          confidence: 'low',
          count: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate answer with intent-specific formatting
    const answer = await generateAnswer(query, results, analysis.intent, analysis.answer_mode)

    // Format sources
    const sources = results.map((r: any, i: number) => ({
      text: r.description || r.name || '',
      score: r.similarity || (1.0 - i * 0.05),
      type: r.doc_type,
      metadata: {
        title: r.name?.replace(/\s*\(part\s+\d+\/\d+\)\s*$/i, '').trim(),
        company: r.author || r.owner || 'N/A',
        url: r.url,
        downloads: r.downloads,
        stars: r.stars,
        likes: r.likes
      }
    }))

    return new Response(
      JSON.stringify({ answer, sources, confidence: 'high', count: results.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
