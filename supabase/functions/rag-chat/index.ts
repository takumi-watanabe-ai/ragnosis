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
import type { SearchResult, ProgressEmitter } from "./types.ts";
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
    const { query, stream = true } = await req.json();

    if (!query) {
      return new Response(JSON.stringify({ error: RESPONSE_MESSAGES.NO_QUERY }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`\n${SEPARATOR.SECTION}`);
    logger.query(`Query: "${query}" (stream: ${stream})`);
    console.log(`${SEPARATOR.SECTION}`);

    // Always use finalResultCount from config (ignoring user top_k)
    const finalResultCount = config.search.finalResultCount;

    // Step 3: Synthesize answer (streaming or non-streaming)
    if (stream) {
      // Stream the response using Server-Sent Events
      const encoder = new TextEncoder();

      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // Create progress emitter that sends events to stream
            const progressEmitter: ProgressEmitter = {
              emit(step: string, message: string) {
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: 'progress', step, message })}\n\n`
                ));
              }
            };

            // Step 1: Starting analysis
            progressEmitter.emit('start', 'Starting analysis...');

            // Step 2: Query planning
            progressEmitter.emit('planning', config.features.queryPlanner.enabled
              ? 'Analyzing question with LLM Query Planner...'
              : 'Analyzing question and planning research...'
            );

            const plan = await createQueryPlan(query, finalResultCount, supabase);

            if (!plan.is_valid) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  message: plan.reason
                })}\n\n`
              ));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              return;
            }

            progressEmitter.emit('planning_complete',
              `Query classified as "${plan.intent}". Searching ${plan.data_sources.length} data source(s).`
            );

            // Show query insights (keywords, strategy)
            if (plan.insight) {
              // Show extracted keywords for BM25 boosting
              if (plan.insight.nouns && plan.insight.nouns.length > 0) {
                progressEmitter.emit('keywords_extracted',
                  `Boosting search with key terms: ${plan.insight.nouns.join(', ')}`
                );
              }

              // Show search strategy with reasoning based on doc_type weights
              if (plan.insight.doc_type_weights) {
                const weights = plan.insight.doc_type_weights;
                const intent = plan.insight.primary_intent;
                let strategyMsg = '';

                // Explain strategy based on intent and weights
                if (intent === 'learn' || intent === 'implement') {
                  if (weights.knowledge_base > 0.7) {
                    strategyMsg = 'Prioritizing educational content (detected learning intent)';
                  } else {
                    strategyMsg = 'Searching documentation and tutorials (learning-focused)';
                  }
                } else if (intent === 'find_tool') {
                  if (weights.hf_model > 0.7) {
                    strategyMsg = 'Focusing on ML models (tool discovery intent)';
                  } else if (weights.github_repo > 0.7) {
                    strategyMsg = 'Searching code repositories (tool discovery intent)';
                  } else {
                    strategyMsg = 'Searching models and repositories (tool discovery)';
                  }
                } else if (intent === 'compare') {
                  strategyMsg = 'Gathering comparative information from multiple sources';
                } else {
                  strategyMsg = 'Using balanced multi-source approach';
                }

                progressEmitter.emit('search_strategy', strategyMsg);
              }
            }

            // Step 3: Execute data sources (this will emit its own progress)
            logger.execute(`Executing ${plan.data_sources.length} data source(s) in parallel...`);

            const allResults = await Promise.all(
              plan.data_sources.map((ds) => executeDataSource(ds, supabase, progressEmitter)),
            );

            const allFlattened = allResults.flat();
            const results: SearchResult[] = allFlattened.slice(0, finalResultCount);

            logger.success(`Retrieved ${allFlattened.length} results → returning top ${results.length}`);

            if (results.length === 0) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({
                  type: 'error',
                  message: RESPONSE_MESSAGES.NO_RESULTS
                })}\n\n`
              ));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              return;
            }

            // Add citation markers to results
            results.forEach((item, i) => {
              const citationNum = i + 1;
              item.marker = `[${citationNum}]`;

              if (item.doc_type === "knowledge_base" && item.content) {
                const excerptLength = i < 2
                  ? config.search.context.primaryExcerpt
                  : config.search.context.secondaryExcerpt;
                item.chunk_text = item.content.substring(0, excerptLength);
                item.chunk_id = `kb-${item.id}`;
              } else if (item.description) {
                item.chunk_text = item.description.substring(0, config.search.context.descriptionMax);
                item.chunk_id = `${item.doc_type}-${item.id}`;
              }
            });

            // Format sources for response
            const sources = results.map((r, i) => {
              const cleanName = cleanPartSuffix(r.name);
              return {
                position: i + 1,
                name: cleanName,
                url: r.url,
                doc_type: r.doc_type,
                similarity: r.similarity,
                metadata: {
                  title: cleanName,
                  url: r.url,
                  doc_type: r.doc_type,
                },
                // Citation support fields
                ...(r.marker && { marker: r.marker }),
                ...(r.chunk_text && { chunk_text: r.chunk_text }),
                ...(r.chunk_id && { chunk_id: r.chunk_id }),
                ...(r.char_offset !== undefined && { char_offset: r.char_offset }),
                ...(r.chunk_length && { chunk_length: r.chunk_length }),
                // Additional metadata
                ...(r.description && { description: r.description }),
                ...(r.content && { content: r.content }),
                ...(r.author && { author: r.author }),
                ...(r.owner && { owner: r.owner }),
                ...(r.downloads && { downloads: r.downloads }),
                ...(r.stars && { stars: r.stars }),
                ...(r.current_interest && { current_interest: r.current_interest }),
              };
            });

            // Show search results breakdown as indented bullets
            const docTypeCounts = results.reduce((acc, r) => {
              const type = r.doc_type || 'unknown';
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {} as Record<string, number>);

            const breakdown = Object.entries(docTypeCounts)
              .map(([type, count]) => {
                const typeLabel = type === 'hf_model' ? 'HuggingFace model' + (count > 1 ? 's' : '')
                  : type === 'github_repo' ? 'GitHub repositor' + (count > 1 ? 'ies' : 'y')
                  : type === 'knowledge_base' ? 'knowledge base article' + (count > 1 ? 's' : '')
                  : type === 'google_trend' ? 'Google Trends'
                  : type;
                return `• ${count} ${typeLabel}`;
              })
              .join('\n');

            progressEmitter.emit('search_complete',
              `Final results (${results.length} sources):\n${breakdown}`
            );

            // Send metadata
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

            // Send synthesis start
            progressEmitter.emit('synthesis', 'Generating answer...');

            // Stream answer chunks
            const answerStream = generateAnswerStream(query, results, plan.intent, supabase);
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
      // Non-streaming: Execute all steps synchronously
      const plan = await createQueryPlan(query, finalResultCount, supabase);

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

      logger.execute(`Executing ${plan.data_sources.length} data source(s) in parallel...`);

      const allResults = await Promise.all(
        plan.data_sources.map((ds) => executeDataSource(ds, supabase)),
      );

      const allFlattened = allResults.flat();
      const results: SearchResult[] = allFlattened.slice(0, finalResultCount);

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

      // Add citation markers
      results.forEach((item, i) => {
        const citationNum = i + 1;
        item.marker = `[${citationNum}]`;

        if (item.doc_type === "knowledge_base" && item.content) {
          const excerptLength = i < 2
            ? config.search.context.primaryExcerpt
            : config.search.context.secondaryExcerpt;
          item.chunk_text = item.content.substring(0, excerptLength);
          item.chunk_id = `kb-${item.id}`;
        } else if (item.description) {
          item.chunk_text = item.description.substring(0, config.search.context.descriptionMax);
          item.chunk_id = `${item.doc_type}-${item.id}`;
        }
      });

      // Format sources
      const sources = results.map((r, i) => {
        const cleanName = cleanPartSuffix(r.name);
        return {
          position: i + 1,
          name: cleanName,
          url: r.url,
          doc_type: r.doc_type,
          similarity: r.similarity,
          metadata: {
            title: cleanName,
            url: r.url,
            doc_type: r.doc_type,
          },
          ...(r.marker && { marker: r.marker }),
          ...(r.chunk_text && { chunk_text: r.chunk_text }),
          ...(r.chunk_id && { chunk_id: r.chunk_id }),
          ...(r.char_offset !== undefined && { char_offset: r.char_offset }),
          ...(r.chunk_length && { chunk_length: r.chunk_length }),
          ...(r.description && { description: r.description }),
          ...(r.content && { content: r.content }),
          ...(r.author && { author: r.author }),
          ...(r.owner && { owner: r.owner }),
          ...(r.downloads && { downloads: r.downloads }),
          ...(r.stars && { stars: r.stars }),
          ...(r.current_interest && { current_interest: r.current_interest }),
        };
      });

      // Generate answer
      const answer = await generateAnswer(query, results, plan.intent, supabase);

      // Evaluate answer quality
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
