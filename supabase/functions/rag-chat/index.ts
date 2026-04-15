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
import {
  generateAnswer,
  generateAnswerStream,
  generateAnswerStreamWithFeedback,
} from "./answer-generator.ts";
import { evaluateAnswer } from "./answer-evaluator.ts";
import type { SearchResult, ProgressEmitter } from "./types.ts";
import { RESPONSE_MESSAGES, SEPARATOR, LOG_PREFIX } from "./utils/constants.ts";
import { cleanPartSuffix } from "./utils/formatters.ts";
import { logger } from "./utils/logger.ts";
import { getFeatureFlagService } from "./services/feature-flags.ts";

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
      return new Response(
        JSON.stringify({ error: RESPONSE_MESSAGES.NO_QUERY }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
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
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "progress", step, message })}\n\n`,
                  ),
                );
              },
            };

            // Helper function to generate source breakdown
            const generateSourceBreakdown = (
              sources: SearchResult[],
            ): string => {
              const docTypeCounts = sources.reduce(
                (acc, r) => {
                  const type = r.doc_type || "unknown";
                  acc[type] = (acc[type] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>,
              );

              return Object.entries(docTypeCounts)
                .map(([type, count]) => {
                  const typeLabel =
                    type === "hf_model"
                      ? "Hugging Face model" + (count > 1 ? "s" : "")
                      : type === "github_repo"
                        ? "GitHub repositor" + (count > 1 ? "ies" : "y")
                        : type === "knowledge_base"
                          ? "knowledge base article" + (count > 1 ? "s" : "")
                          : type === "google_trend"
                            ? "Google Trends"
                            : type;
                  return `• ${count} ${typeLabel}`;
                })
                .join("\n");
            };

            // Step 1: Starting analysis
            progressEmitter.emit("start", "Starting analysis...");

            // Step 2: Query planning
            progressEmitter.emit(
              "query_planner",
              config.features.queryPlanner.enabled
                ? "Analyzing question with LLM Query Planner..."
                : "Analyzing question and planning research...",
            );

            const plan = await createQueryPlan(
              query,
              finalResultCount,
              supabase,
            );

            if (!plan.is_valid) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "error",
                    message: plan.reason,
                  })}\n\n`,
                ),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              return;
            }

            // Capitalize the intent for display
            const displayIntent = plan.intent.charAt(0).toUpperCase() + plan.intent.slice(1);

            // Show descriptive message based on query type
            const sourceMessage = {
              "conceptual": "Searching articles database",
              "market_intelligence": "Searching models, repos, and trending tools",
              "implementation": "Searching code repositories and documentation",
              "troubleshooting": "Searching technical resources",
              "comparison": "Searching comprehensive sources"
            }[plan.intent] || "Searching knowledge base";

            progressEmitter.emit(
              "query_planner",
              `Query classified as "${displayIntent}". ${sourceMessage}.`,
            );

            // Show query insights (keywords, strategy)
            if (plan.insight) {
              // Show extracted keywords for BM25 boosting (optional, only if highly relevant)
              if (
                plan.insight.nouns &&
                plan.insight.nouns.length > 0 &&
                plan.insight.nouns.length <= 3
              ) {
                progressEmitter.emit(
                  "query_planner",
                  `Extracting key terms from query: ${plan.insight.nouns.join(", ")}`,
                );
              }
            }

            // Step 3: Execute data sources (this will emit its own progress)
            logger.execute(
              `Executing ${plan.data_sources.length} data source(s) in parallel...`,
            );

            const allResults = await Promise.all(
              plan.data_sources.map((ds) =>
                executeDataSource(ds, supabase, progressEmitter),
              ),
            );

            // Extract primary results and duplicates for potential refinement
            const allPrimary = allResults.flatMap((r) => r.primary);
            const allDuplicates = allResults.flatMap((r) => r.duplicates);
            const results: SearchResult[] = allPrimary.slice(
              0,
              finalResultCount,
            );

            logger.success(
              `Retrieved ${allPrimary.length} results → returning top ${results.length}`,
            );

            if (results.length === 0) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "error",
                    message: RESPONSE_MESSAGES.NO_RESULTS,
                  })}\n\n`,
                ),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              return;
            }

            // Add citation markers to results
            results.forEach((item, i) => {
              const citationNum = i + 1;
              item.marker = `[${citationNum}]`;

              if (item.doc_type === "knowledge_base" && item.content) {
                const excerptLength =
                  i < 2
                    ? config.search.context.primaryExcerpt
                    : config.search.context.secondaryExcerpt;
                item.chunk_text = item.content.substring(0, excerptLength);
                item.chunk_id = `kb-${item.id}`;
              } else if (item.description) {
                item.chunk_text = item.description.substring(
                  0,
                  config.search.context.descriptionMax,
                );
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
                ...(r.char_offset !== undefined && {
                  char_offset: r.char_offset,
                }),
                ...(r.chunk_length && { chunk_length: r.chunk_length }),
                // Additional metadata
                ...(r.description && { description: r.description }),
                ...(r.content && { content: r.content }),
                ...(r.author && { author: r.author }),
                ...(r.owner && { owner: r.owner }),
                ...(r.downloads && { downloads: r.downloads }),
                ...(r.stars && { stars: r.stars }),
                ...(r.current_interest && {
                  current_interest: r.current_interest,
                }),
              };
            });

            // Show search results breakdown as indented bullets
            const breakdown = generateSourceBreakdown(results);

            progressEmitter.emit(
              "search_engine",
              `Retrieved ${results.length} sources:\n${breakdown}`,
            );

            // Send metadata
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "metadata",
                  sources,
                  metadata: {
                    intent: plan.intent,
                    data_sources_used: plan.data_sources.map((ds) => ds.source),
                  },
                })}\n\n`,
              ),
            );

            // Send synthesis start
            progressEmitter.emit("answer_generator", "Generating answer...");

            // Iterative improvement loop with duplicate chunk expansion
            let fullAnswer = "";
            let iteration = 0;

            // Get evaluation config from feature flags
            const featureFlags = getFeatureFlagService(supabase);
            const evalConfig = await featureFlags.getConfig<{
              min_score_for_iteration: number;
              max_iterations: number;
            }>("answer_evaluator");
            const MAX_ITERATIONS = evalConfig.max_iterations;

            let currentResults = results;
            let availableDuplicates = allDuplicates; // Saved duplicate chunks for refinement
            let previousScore = 0; // Track score improvement
            let previousEvaluation: any = null; // Track evaluation for feedback
            let previousFailReasons: string[] = []; // Track issues for feedback

            while (iteration < MAX_ITERATIONS) {
              iteration++;

              // Generate complete answer (internally, not streamed yet)
              // On first iteration, generate normally. On subsequent iterations, use feedback from previous evaluation.
              fullAnswer = "";
              let answerStream;
              if (iteration === 1 || !previousEvaluation) {
                answerStream = generateAnswerStream(
                  query,
                  currentResults,
                  plan.intent,
                  supabase,
                );
              } else {
                // Use feedback-aware generation for refinement iterations
                answerStream = generateAnswerStreamWithFeedback(
                  query,
                  currentResults,
                  plan.intent,
                  previousFailReasons,
                  previousEvaluation,
                  supabase,
                );
              }

              for await (const chunk of answerStream) {
                fullAnswer += chunk;
              }

              // Skip evaluation for comparison queries - they already have proper citations
              // and benefit from having the right sources upfront, not iteration
              if (plan.intent === "comparison") {
                logger.info(
                  `Skipping evaluation for comparison query - using answer as-is`,
                );
                break;
              }

              // Evaluate answer quality
              const evaluation = await evaluateAnswer(
                query,
                fullAnswer,
                currentResults.length,
                supabase,
              );

              // If no evaluation, stop
              if (!evaluation) {
                break;
              }

              // Check if answer meets quality threshold (composite score)
              const passesQualityThreshold =
                evaluation.score >= evalConfig.min_score_for_iteration;

              if (passesQualityThreshold) {
                logger.metrics(
                  `Answer quality: ${evaluation.score}/100 (${evaluation.confidence}) - ` +
                    `Relevancy: ${evaluation.relevancy}/10, Accuracy: ${evaluation.accuracy}/10, ` +
                    `Clarity: ${evaluation.clarity}/10, Specificity: ${evaluation.specificity}/10 - APPROVED`,
                );
                break;
              }

              // Quality needs improvement - use LLM-provided issues
              const failReasons: string[] = [
                `Score ${evaluation.score}/100 < ${evalConfig.min_score_for_iteration}`,
              ];

              logger.metrics(
                `Answer quality: ${evaluation.score}/100 - NEEDS IMPROVEMENT - ` +
                  `Relevancy: ${evaluation.relevancy}/10, Accuracy: ${evaluation.accuracy}/10, ` +
                  `Clarity: ${evaluation.clarity}/10, Specificity: ${evaluation.specificity}/10 - ` +
                  `Failed: ${failReasons.join(", ")}`,
              );

              // Save evaluation and issues for next iteration's feedback
              previousEvaluation = evaluation;
              previousFailReasons = failReasons;

              // If this is the last iteration, use what we have
              if (iteration >= MAX_ITERATIONS) {
                logger.warn(`Max iterations reached. Using current answer.`);
                break;
              }

              // Don't iterate if no more sources available - regenerating with same sources is wasteful
              if (availableDuplicates.length === 0) {
                logger.warn(
                  `No more alternative sources available - using current answer`,
                );
                break;
              }

              // Use top duplicate chunks from initial search
              if (availableDuplicates.length > 0) {
                // Build user-friendly insight based on weakest dimension
                let qualityIssue = "";
                let whatWeNeed = "";

                // Identify weakest dimension to guide refinement
                const scores = [
                  { name: 'accuracy', value: evaluation.accuracy, issue: 'Answer needs more inline citations', need: 'specific citations and examples' },
                  { name: 'clarity', value: evaluation.clarity, issue: 'Answer needs better structure', need: 'organized sections and clearer flow' },
                  { name: 'specificity', value: evaluation.specificity, issue: 'Answer needs more technical depth', need: 'specific examples and technical details' },
                  { name: 'relevancy', value: evaluation.relevancy, issue: 'Answer needs better focus', need: 'more relevant information' },
                ];

                const weakest = scores.reduce((min, curr) => curr.value < min.value ? curr : min);
                qualityIssue = weakest.issue;
                whatWeNeed = weakest.need;

                progressEmitter.emit("quality_checker", qualityIssue);

                // Pick top 5 duplicates (already sorted by similarity in data-sources.ts)
                const chunkLimit = 5;
                const selectedDuplicates = availableDuplicates.slice(
                  0,
                  chunkLimit,
                );
                availableDuplicates = availableDuplicates.slice(chunkLimit); // Remove used chunks

                // Show which specific sources we're analyzing deeper
                const sourcesBeingAnalyzed = selectedDuplicates
                  .map((s) => s.name.split(" (part")[0])
                  .filter((name, idx, arr) => arr.indexOf(name) === idx)
                  .slice(0, 2); // Show up to 2 source names

                const sourceCount = sourcesBeingAnalyzed.length;
                const sourcePreview =
                  sourceCount > 0
                    ? sourceCount === 1
                      ? ` in "${sourcesBeingAnalyzed[0]}"`
                      : ` in "${sourcesBeingAnalyzed[0]}" and ${sourceCount - 1} other source${sourceCount > 2 ? "s" : ""}`
                    : "";

                progressEmitter.emit(
                  "search_engine",
                  `Reading deeper${sourcePreview} to find ${whatWeNeed}...`,
                );

                // Add citation markers to the new chunks
                selectedDuplicates.forEach((item, i) => {
                  const citationNum = currentResults.length + i + 1;
                  item.marker = `[${citationNum}]`;

                  if (item.doc_type === "knowledge_base" && item.content) {
                    item.chunk_text = item.content.substring(
                      0,
                      config.search.context.secondaryExcerpt,
                    );
                    item.chunk_id = `kb-${item.id}-alt`;
                  } else if (item.description) {
                    item.chunk_text = item.description.substring(
                      0,
                      config.search.context.descriptionMax,
                    );
                    item.chunk_id = `${item.doc_type}-${item.id}-alt`;
                  }
                });

                currentResults = [...currentResults, ...selectedDuplicates];

                logger.success(
                  `Added ${selectedDuplicates.length} sources (now ${currentResults.length} total sources, ${availableDuplicates.length} available)`,
                );

                // Format and send updated sources to frontend
                const updatedSources = currentResults.map((r, i) => {
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
                    ...(r.char_offset !== undefined && {
                      char_offset: r.char_offset,
                    }),
                    ...(r.chunk_length && { chunk_length: r.chunk_length }),
                    ...(r.description && { description: r.description }),
                    ...(r.content && { content: r.content }),
                    ...(r.author && { author: r.author }),
                    ...(r.owner && { owner: r.owner }),
                    ...(r.downloads && { downloads: r.downloads }),
                    ...(r.stars && { stars: r.stars }),
                    ...(r.current_interest && {
                      current_interest: r.current_interest,
                    }),
                  };
                });

                // Send updated metadata with new sources
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: "metadata",
                      sources: updatedSources,
                      metadata: {
                        intent: plan.intent,
                        data_sources_used: plan.data_sources.map(
                          (ds) => ds.source,
                        ),
                      },
                    })}\n\n`,
                  ),
                );

                // Update user with new source count
                const addedSourcesBreakdown =
                  generateSourceBreakdown(selectedDuplicates);
                progressEmitter.emit(
                  "search_engine",
                  `Added ${selectedDuplicates.length} more source${selectedDuplicates.length > 1 ? "s" : ""} (now analyzing ${currentResults.length} total):\n${addedSourcesBreakdown}`,
                );

                progressEmitter.emit(
                  "answer_generator",
                  `Regenerating with enhanced source coverage...`,
                );
              }
            }

            // Stream word-by-word for visible typing effect
            const words = fullAnswer.split(/(\s+)/); // Split on whitespace but keep it
            for (const word of words) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "chunk", content: word })}\n\n`,
                ),
              );
              // Small delay between words for visible streaming
              if (word.trim()) { // Only delay on actual words, not whitespace
                await new Promise((resolve) => setTimeout(resolve, 30));
              }
            }

            // Send completion marker
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));

            logger.success(
              `Answer streamed successfully (${iteration} iteration(s))`,
            );
            console.log(`${SEPARATOR.SECTION}\n`);
          } catch (error) {
            console.error(`${LOG_PREFIX.ERROR} Streaming error:`, error);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message:
                    error instanceof Error ? error.message : "Streaming error",
                })}\n\n`,
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
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

      logger.execute(
        `Executing ${plan.data_sources.length} data source(s) in parallel...`,
      );

      const allResults = await Promise.all(
        plan.data_sources.map((ds) => executeDataSource(ds, supabase)),
      );

      const allPrimary = allResults.flatMap((r) => r.primary);
      const results: SearchResult[] = allPrimary.slice(0, finalResultCount);

      logger.success(
        `Retrieved ${allPrimary.length} results → returning top ${results.length}`,
      );

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
          const excerptLength =
            i < 2
              ? config.search.context.primaryExcerpt
              : config.search.context.secondaryExcerpt;
          item.chunk_text = item.content.substring(0, excerptLength);
          item.chunk_id = `kb-${item.id}`;
        } else if (item.description) {
          item.chunk_text = item.description.substring(
            0,
            config.search.context.descriptionMax,
          );
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
      const answer = await generateAnswer(
        query,
        results,
        plan.intent,
        supabase,
      );

      // Evaluate answer quality
      const evaluation = await evaluateAnswer(
        query,
        answer,
        results.length,
        supabase,
      );
      if (evaluation) {
        logger.metrics(
          `Answer quality: ${evaluation.score}/100 (${evaluation.confidence}) - ` +
            `Relevancy: ${evaluation.relevancy}/10, Accuracy: ${evaluation.accuracy}/10, ` +
            `Clarity: ${evaluation.clarity}/10, Specificity: ${evaluation.specificity}/10`,
        );
        if (
          evaluation.issues.length > 0 &&
          evaluation.issues[0] !==
            "Excellent - answer meets all quality standards"
        ) {
          logger.debug(`Issues: ${evaluation.issues.join("; ")}`);
        }
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

      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
