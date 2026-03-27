/**
 * RAGnosis Query API - Agentic 2-Step Architecture
 *
 * Step 1: Plan (query-planner) - Analyze + decide data sources
 * Step 2: Execute (data-sources) - Fetch data in parallel
 * Step 3: Synthesize (answer-generator) - Generate answer
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { config } from './config.ts'
import { createQueryPlan } from './query-planner.ts'
import { executeDataSource } from './data-sources.ts'
import { generateAnswer } from './answer-generator.ts'
import type { SearchResult } from './types.ts'

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

    console.log(`\n${'='.repeat(60)}`)
    console.log(`📥 Query: "${query}"`)
    console.log(`${'='.repeat(60)}`)

    // Step 1: Plan (1 LLM call)
    const plan = await createQueryPlan(query, top_k)

    if (!plan.is_valid) {
      return new Response(
        JSON.stringify({
          answer: plan.reason,
          sources: [],
          metadata: { intent: plan.intent, confidence: plan.confidence }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: Execute (no LLM - parallel data fetching)
    console.log(`⚡ Executing ${plan.data_sources.length} data source(s) in parallel...`)

    const allResults = await Promise.all(
      plan.data_sources.map(ds => executeDataSource(ds))
    )

    // Flatten and limit to top_k (when multiple sources are used)
    const allFlattened = allResults.flat()
    const results: SearchResult[] = allFlattened.slice(0, top_k)

    console.log(`✅ Retrieved ${allFlattened.length} results, returning top ${results.length}`)

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          answer: 'No relevant sources found for your query. Try rephrasing or broadening your question.',
          sources: [],
          metadata: { intent: plan.intent, confidence: plan.confidence }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 3: Synthesize (1 LLM call)
    const answer = await generateAnswer(query, results, plan.intent)

    // Format sources for response
    const sources = results.map((r, i) => {
      const cleanName = r.name.replace(/\s*\(part\s+\d+\/\d+\)\s*$/i, '').trim()
      return {
        position: i + 1,
        name: cleanName,
        url: r.url,
        type: r.doc_type,
        similarity: r.similarity,
        metadata: {
          title: cleanName,
          url: r.url,
          doc_type: r.doc_type
        },
        ...(r.downloads && { downloads: r.downloads }),
        ...(r.stars && { stars: r.stars }),
        ...(r.current_interest && { current_interest: r.current_interest })
      }
    })

    console.log(`✅ Answer generated successfully`)
    console.log(`${'='.repeat(60)}\n`)

    return new Response(
      JSON.stringify({
        answer,
        sources,
        metadata: {
          intent: plan.intent,
          confidence: plan.confidence,
          data_sources_used: plan.data_sources.map(ds => ds.source)
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
