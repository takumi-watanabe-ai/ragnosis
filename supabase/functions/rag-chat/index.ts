/**
 * RAGnosis Query API - Agentic 2-Step Architecture
 *
 * Step 1: Plan (query-planner) - Analyze + decide data sources
 * Step 2: Execute (data-sources) - Fetch data in parallel
 * Step 3: Synthesize (answer-generator) - Generate answer
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { config } from "./config.ts";
import { createQueryPlan } from "./llm-query-planner.ts";
import { executeDataSource } from "./data-sources.ts";
import { generateAnswer, generateAnswerStream } from "./answer-generator.ts";
import { evaluateAnswer } from "./answer-evaluator.ts";
import type { SearchResult } from "./types.ts";
import { RESPONSE_MESSAGES, SEPARATOR, LOG_PREFIX } from "./utils/constants.ts";
import { cleanPartSuffix } from "./utils/formatters.ts";
import { logger } from "./utils/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": config.cors.allowOrigin,
  "Access-Control-Allow-Headers": config.cors.allowHeaders,
};

// Create Supabase client
const supabase = createClient(
  config.database.url,
  config.database.serviceRoleKey,
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, top_k = 5, stream = true } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: RESPONSE_MESSAGES.NO_QUERY }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`\n${SEPARATOR.SECTION}`);
    logger.query(`Query: "${query}" (stream: ${stream})`);
    console.log(`${SEPARATOR.SECTION}`);

    // Step 1: Plan (1 LLM call)
    const plan = await createQueryPlan(query, top_k, supabase);

    if (!plan.is_valid) {
      return new Response(
        JSON.stringify({
          answer: plan.reason,
          sources: [],
          metadata: { intent: plan.intent },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Execute (no LLM - parallel data fetching)
    logger.execute(`Executing ${plan.data_sources.length} data source(s) in parallel...`);

    const allResults = await Promise.all(
      plan.data_sources.map((ds) => executeDataSource(ds, supabase)),
    );

    // Flatten and limit to top_k (when multiple sources are used)
    const allFlattened = allResults.flat();
    const results: SearchResult[] = allFlattened.slice(0, top_k);

    logger.success(`Retrieved ${allFlattened.length} results → returning top ${results.length}`);

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          answer: RESPONSE_MESSAGES.NO_RESULTS,
          sources: [],
          metadata: { intent: plan.intent },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Format sources for response
    const sources = results.map((r, i) => {
      const cleanName = cleanPartSuffix(r.name);
      return {
        position: i + 1,
        name: cleanName,
        url: r.url,
        type: r.doc_type,
        similarity: r.similarity,
        metadata: {
          title: cleanName,
          url: r.url,
          doc_type: r.doc_type,
        },
        ...(r.downloads && { downloads: r.downloads }),
        ...(r.stars && { stars: r.stars }),
        ...(r.current_interest && { current_interest: r.current_interest }),
      };
    });

    // Step 3: Synthesize answer (streaming or non-streaming)
    if (stream) {
      // Stream the response using Server-Sent Events
      const encoder = new TextEncoder();
      const answerStream = generateAnswerStream(query, results, plan.intent, supabase);

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Send metadata first
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'metadata',
                sources,
                metadata: {
                  intent: plan.intent,
                  data_sources_used: plan.data_sources.map((ds) => ds.source),
                }
              })}\n\n`
            ));

            // Stream answer chunks
            for await (const chunk of answerStream) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`
              ));
            }

            // Send completion marker
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));

            logger.success(`Answer streamed successfully`);
            console.log(`${SEPARATOR.SECTION}\n`);
          } catch (error) {
            console.error(`${LOG_PREFIX.ERROR} Streaming error:`, error);
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({
                type: 'error',
                message: error instanceof Error ? error.message : 'Streaming error'
              })}\n\n`
            ));
          } finally {
            controller.close();
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    } else {
      // Non-streaming: Generate complete answer
      const answer = await generateAnswer(query, results, plan.intent, supabase);

      // Step 4: Evaluate answer quality (fast heuristics, no LLM call)
      const evaluation = await evaluateAnswer(query, answer, results.length, supabase);
      if (evaluation) {
        logger.metrics(`Answer quality: ${evaluation.score}/100 (${evaluation.confidence})`);
        logger.debug(`Issues: ${evaluation.issues.join(', ')}`);
      }

      const responseData = {
        answer,
        sources,
        metadata: {
          intent: plan.intent,
          data_sources_used: plan.data_sources.map((ds) => ds.source),
        },
      };

      // Response caching removed

      logger.success(`Answer generated successfully`);
      console.log(`${SEPARATOR.SECTION}\n`);

      return new Response(
        JSON.stringify(responseData),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Error:`, error);

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
