/**
 * Answer Generator - Step 3: Synthesize answer from data sources
 * Single LLM call to generate final answer
 */

import type { SearchResult, QueryIntent } from "./types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { config } from "./config.ts";
import { getLLMClient } from "./services/llm-client.ts";
import { PATTERNS, RESPONSE_MESSAGES, LOG_PREFIX } from "./utils/constants.ts";
import { cleanPartSuffix, markdownLink, truncate } from "./utils/formatters.ts";

/**
 * Generate answer from search results
 */
export async function generateAnswer(
  query: string,
  results: SearchResult[],
  intent: QueryIntent,
  supabase?: SupabaseClient,
): Promise<string> {
  // For market intelligence list queries, use LLM with strict grounding
  const isListQuery = PATTERNS.LIST_QUERY.test(query);
  if (intent === "market_intelligence" && isListQuery && results.length > 0) {
    // Use LLM for context, but with strict anti-hallucination rules
    const prompt = buildMarketIntelligencePrompt(query, results);
    return await generateWithLLM(prompt);
  }

  // Otherwise use LLM to synthesize answer
  const prompt = buildAnswerPrompt(query, results, intent);

  try {
    const llmClient = getLLMClient();
    const answer = await llmClient.generate(prompt);

    return answer;
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer generation failed:`, error);
    return RESPONSE_MESSAGES.GENERATION_ERROR;
  }
}

/**
 * Generate answer from search results with streaming support
 */
export async function* generateAnswerStream(
  query: string,
  results: SearchResult[],
  intent: QueryIntent,
  supabase?: SupabaseClient,
): AsyncIterableIterator<string> {
  // For market intelligence list queries, use LLM with strict grounding
  const isListQuery = PATTERNS.LIST_QUERY.test(query);
  if (intent === "market_intelligence" && isListQuery && results.length > 0) {
    const prompt = buildMarketIntelligencePrompt(query, results);
    yield* generateWithLLMStream(prompt);
    return;
  }

  // Otherwise use LLM to synthesize answer
  const prompt = buildAnswerPrompt(query, results, intent);

  try {
    yield* generateWithLLMStream(prompt);
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer generation failed:`, error);
    yield RESPONSE_MESSAGES.GENERATION_ERROR;
  }
}

/**
 * Collect full answer from stream (for internal iteration)
 */
async function collectStreamedAnswer(
  query: string,
  results: SearchResult[],
  intent: QueryIntent,
  supabase?: SupabaseClient,
): Promise<string> {
  let fullAnswer = '';
  
  for await (const chunk of generateAnswerStream(query, results, intent, supabase)) {
    fullAnswer += chunk;
  }
  
  return fullAnswer;
}

/**
 * Generate improved answer based on evaluation feedback
 * Adapted from iterative RAG improvement patterns
 */
export async function* generateAnswerStreamWithFeedback(
  query: string,
  results: SearchResult[],
  intent: QueryIntent,
  previousIssues: string[],
  evaluation: any,
  supabase?: SupabaseClient,
): AsyncIterableIterator<string> {
  const isListQuery = PATTERNS.LIST_QUERY.test(query);

  let prompt: string;
  if (intent === "market_intelligence" && isListQuery && results.length > 0) {
    prompt = buildMarketIntelligencePrompt(query, results);
  } else {
    prompt = buildAnswerPrompt(query, results, intent);
  }

  // Build focused improvement instructions based on weakest dimension
  let criticalFix = '';
  if (evaluation.accuracy < 7) {
    criticalFix = `
⚠️ CRITICAL: Previous answer had ZERO inline citations!
You MUST add [1], [2], [3] citations after EVERY claim.
Example: "RAG uses vector search [1]. LangChain provides embeddings [2]."
DO NOT write ANY sentence without a citation number.`;
  } else if (evaluation.clarity < 7) {
    criticalFix = `
⚠️ CRITICAL: Previous answer had NO structure!
You MUST use headers and bullets:
## Overview
## Key Points
- First point [1]
- Second point [2]`;
  } else if (evaluation.specificity < 7) {
    criticalFix = `
⚠️ CRITICAL: Previous answer was too vague!
Include SPECIFIC numbers, versions, tool names from sources.
Replace vague phrases with concrete facts.`;
  } else if (evaluation.completeness < 7) {
    criticalFix = `
⚠️ CRITICAL: Previous answer was too brief!
Expand to at least 400 words with comprehensive coverage.
Add examples and detailed explanations.`;
  }

  const improvementGuidance = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  PREVIOUS ANSWER WAS REJECTED - REGENERATE WITH FIXES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${criticalFix}

Issues found:
${previousIssues.slice(0, 3).map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Score: ${evaluation.score}/100 (Target: 85+)
- Completeness: ${evaluation.completeness}/10
- Accuracy: ${evaluation.accuracy}/10
- Clarity: ${evaluation.clarity}/10
- Specificity: ${evaluation.specificity}/10

Generate a COMPLETE REWRITE that fixes ALL issues above. Follow the format requirements strictly.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  const improvedPrompt = prompt + improvementGuidance;

  try {
    yield* generateWithLLMStream(improvedPrompt);
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer generation with feedback failed:`, error);
    yield RESPONSE_MESSAGES.GENERATION_ERROR;
  }
}

/**
 * Build prompt for market intelligence queries with strict grounding
 */
function buildMarketIntelligencePrompt(query: string, results: SearchResult[]): string {
  const docType = results[0]?.doc_type;
  let context = "TOP RESULTS:\n\n";

  results.forEach((item, i) => {
    const num = i + 1;
    const cleanName = cleanPartSuffix(item.name);

    context += `${num}. ${cleanName}\n`;
    context += `   URL: ${item.url}\n`;

    if (docType === "hf_model") {
      if (item.downloads) context += `   Downloads: ${item.downloads.toLocaleString()}\n`;
      if (item.likes) context += `   Likes: ${item.likes.toLocaleString()}\n`;
      if (item.author) context += `   Author: ${item.author}\n`;
      if (item.task) context += `   Task: ${item.task}\n`;
      if (item.description) context += `   Description: ${truncate(cleanPartSuffix(item.description), 200)}\n`;
    } else if (docType === "github_repo") {
      if (item.stars) context += `   Stars: ${item.stars.toLocaleString()}\n`;
      if (item.forks) context += `   Forks: ${item.forks.toLocaleString()}\n`;
      if (item.owner) context += `   Owner: ${item.owner}\n`;
      if (item.language) context += `   Language: ${item.language}\n`;
      if (item.description) context += `   Description: ${truncate(cleanPartSuffix(item.description), 200)}\n`;
    }
    context += "\n";
  });

  return `${context}

Question: ${query}

ANSWER REQUIREMENTS:

1. For EACH item, provide:
   - Name as clickable link: **[Name](URL)**
   - CORRECT metrics based on type:
     * HuggingFace models → Downloads (ALWAYS in data)
     * GitHub repos → Stars (ALWAYS in data)
   - What it's good for (from description/task)
   - When to use it (based on description)

2. After the list, add "Choosing the Right One":
   - Quick decision guide based on use cases from descriptions above
   - Only use information explicitly in the data above

3. STRICT RULES:
   - NEVER mention items not in the list above
   - NEVER invent features or capabilities
   - NEVER say "Not specified" for downloads/stars - they're ALWAYS present
   - NEVER mix model metrics with repo metrics
   - Base ALL context on the descriptions provided

Answer format for HuggingFace models:
## Top Models

1. **[Name](URL)** - Downloads: [exact number from data]
   - **What**: [From description]
   - **Best for**: [From task/description]

Answer format for GitHub repos:
## Top Repos

1. **[Name](URL)** - Stars: [exact number from data]
   - **What**: [From description]
   - **Best for**: [From description]

## Choosing the Right One
- [Decision guide from data above only]

Answer:`;
}

/**
 * Generate answer with LLM (includes token tracking)
 */
async function generateWithLLM(prompt: string): Promise<string> {
  try {
    const llmClient = getLLMClient();
    const result = await llmClient.generateWithUsage(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    if (result.usage) {
      console.log(`${LOG_PREFIX.SUCCESS} Generation complete - Used ${result.usage.totalTokens} tokens`)
    }

    return result.content;
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} LLM generation failed:`, error);
    return RESPONSE_MESSAGES.GENERATION_ERROR;
  }
}

/**
 * Generate answer with LLM using streaming (includes retry logic)
 */
async function* generateWithLLMStream(prompt: string): AsyncIterableIterator<string> {
  try {
    const llmClient = getLLMClient();

    // Retry callback for logging
    const onRetry = (attempt: number, waitSeconds: number) => {
      console.log(`${LOG_PREFIX.WARN} Retrying LLM request (${attempt}/3) after ${waitSeconds}s...`)
    }

    yield* llmClient.generateStream(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    }, onRetry);
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} LLM streaming generation failed:`, error);
    yield RESPONSE_MESSAGES.GENERATION_ERROR;
  }
}

/**
 * Build LLM prompt for answer synthesis (cost-optimized)
 */
function buildAnswerPrompt(
  query: string,
  results: SearchResult[],
  intent: QueryIntent,
): string {
  // Build context from results with smart sizing
  // Note: Citation markers are already added in index.ts
  let context = "SOURCES:\n";

  results.forEach((item, i) => {
    const citationNum = i + 1;
    // Clean both name and title to remove (Part X/Y)
    const cleanName = cleanPartSuffix(item.name);
    const cleanTitle = item.metadata?.title
      ? cleanPartSuffix(item.metadata.title)
      : cleanName;
    const sourceLink = markdownLink(cleanTitle, item.url);

    context += `\n[${citationNum}] ${sourceLink}`;

    // Add type indicator
    if (item.doc_type === "hf_model") context += ` (Type: HuggingFace Model)`;
    else if (item.doc_type === "github_repo")
      context += ` (Type: GitHub Repository)`;
    else if (item.doc_type === "knowledge_base")
      context += ` (Type: Knowledge Base Article)`;
    else if (item.doc_type === "google_trend")
      context += ` (Type: Google Trend)`;

    context += "\n";

    // Add metrics
    if (item.doc_type === "hf_model") {
      if (item.downloads)
        context += `   Downloads: ${item.downloads.toLocaleString()}\n`;
      if (item.likes) context += `   Likes: ${item.likes.toLocaleString()}\n`;
      if (item.author) context += `   Author: ${item.author}\n`;
    } else if (item.doc_type === "github_repo") {
      if (item.stars) context += `   Stars: ${item.stars.toLocaleString()}\n`;
      if (item.forks) context += `   Forks: ${item.forks.toLocaleString()}\n`;
      if (item.owner) context += `   Owner: ${item.owner}\n`;
      if (item.language) context += `   Language: ${item.language}\n`;
    } else if (item.doc_type === "google_trend") {
      if (item.current_interest)
        context += `   Current Interest: ${item.current_interest}%\n`;
      if (item.avg_interest)
        context += `   Average Interest: ${item.avg_interest.toFixed(1)}%\n`;
      if (item.peak_interest)
        context += `   Peak Interest: ${item.peak_interest}%\n`;
    } else if (item.doc_type === "knowledge_base") {
      // Smart context allocation: top 2 sources get more context
      if (item.content) {
        const excerptLength =
          i < 2
            ? config.search.context.primaryExcerpt
            : config.search.context.secondaryExcerpt;
        const excerpt = truncate(
          cleanPartSuffix(item.content),
          excerptLength
        );
        context += `   ${excerpt}\n`;
      }
    }

    // Add description for models/repos (optimized length)
    if (item.description && item.doc_type !== "knowledge_base") {
      const desc = truncate(
        cleanPartSuffix(item.description),
        config.search.context.descriptionMax
      );
      context += `   ${desc}\n`;
    }
  });

  // Build intent-specific instructions
  const instructions = getInstructionsByIntent(intent);

  // Put instructions BEFORE question so LLM reads them first
  return `${instructions}

${context}

USER QUESTION: ${query}

YOUR ANSWER:`;
}

/**
 * Get instructions based on query intent
 */
function getInstructionsByIntent(intent: QueryIntent): string {
  const baseRules = `You are an expert AI/ML assistant. Answer using ONLY the sources below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY REQUIREMENTS (YOUR ANSWER WILL BE REJECTED IF YOU DON'T FOLLOW):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. STRUCTURE: Use this exact format:
   ## Overview
   [2-3 sentences with [1] citations]

   ## Key Points
   - Point with specifics [1]
   - Point with metrics/numbers [2]

   ## Details
   [Comprehensive explanation]

2. CITATIONS: EVERY FACT needs inline [1], [2], [3]
   - Put [number] immediately after EACH claim
   - Use **[Source Name](url)** when mentioning by name
   - Example: "RAG uses vector search [1]. **[LangChain](url)** implements this [2]."

3. SPECIFICS: Include actual numbers, versions, tool names from sources
   - ✓ "GPT-4 has 1.76T parameters [1]"
   - ✗ "The model is large"

4. NO VAGUE LANGUAGE:
   - ✗ "according to sources", "the data shows", "generally", "it depends"
   - ✓ Specific claims with inline citations

**LENGTH:** Max ${config.llm.answer.targetWords} words. Be thorough but concise.

**GROUNDING:** ONLY use information from provided sources. NO external knowledge.`;

  switch (intent) {
    case "market_intelligence":
      return `${baseRules}

**HOW TO ANSWER:**
1. Start with a direct answer to the specific question asked
2. Provide supporting details from sources
3. Match source types (models → HuggingFace, repos → GitHub)
4. Include ALL metrics (downloads/likes/stars/forks) from sources only
5. Use bullet points for multiple items`;

    case "implementation":
      return `${baseRules}

**HOW TO ANSWER:**
1. Start with a direct answer to what the user needs to do
2. Provide step-by-step implementation guidance from sources
3. Explain what to do AND why (based on sources)
4. Use bullet points for sequential steps
5. Include code examples or parameters only if present in sources`;

    case "troubleshooting":
      return `${baseRules}

**HOW TO ANSWER:**
1. Start by directly stating what's causing the issue (if sources explain it)
2. Provide solutions found in sources
3. Explain root causes based only on sources
4. Use bullet points for multiple solutions
5. Prioritize solutions by effectiveness if sources indicate this`;

    case "comparison":
      return `${baseRules}

**HOW TO ANSWER - Follow this EXACT structure:**

1. **Opening:** Start with ONE clear sentence stating the core difference
2. **Key Differences:** Group by FEATURE (not by product), then compare both items using their ACTUAL NAMES
3. **When to Choose:** Provide use case guidance from sources

**CRITICAL - USE ACTUAL NAMES:**
- DO NOT use generic placeholders like "Item A" or "Item B"
- ALWAYS use the actual product/tool/concept names from the user's question
- Example: If comparing "LangChain vs LlamaIndex", use those exact names

**Example Structure:**
Opening sentence about core difference

## Key Differences

**Core Architecture:**
- **FirstTool**: [How it works from sources]
- **SecondTool**: [How it works from sources]

**Performance:**
- **FirstTool**: [Speed/efficiency from sources]
- **SecondTool**: [Speed/efficiency from sources]

## When to Choose
- **FirstTool**: [Use cases from sources]
- **SecondTool**: [Use cases from sources]

NOTE: Replace "FirstTool" and "SecondTool" with the ACTUAL names from the user's question.
Replace feature categories with SPECIFIC aspects (not generic like "Feature 1").

**FORMATTING RULES:**
- Use bullet points (-) ONLY, NO numbered lists
- Keep concise - compare 3-5 key features maximum
- Compare the SAME aspects for both items
- NEVER use "Item A" or "Item B" - always use the actual names`;

    case "conceptual":
    default:
      return `${baseRules}

**CONCEPTUAL QUESTION RULES:**
1. **Abstract away tool-specific details** - extract UNDERLYING CONCEPTS from sources
2. **When sources mention specific tools** (Pinecone, LangChain, Weaviate, OpenAI, etc.):
   - DON'T just repeat the tool names - extract the GENERAL CONCEPT they represent
   - Transform: "Pinecone for vector search" → "vector databases enable similarity-based retrieval"
   - Transform: "LangChain orchestrates RAG" → "RAG frameworks help coordinate retrieval and generation"
   - Transform: "OpenAI embeddings" → "embedding models convert text to vectors"
3. **Synthesize across sources** - if multiple sources describe the same concept with different tools, unify into one general explanation
4. **Focus on HOW and WHY** things work in general, not on specific implementations

**HOW TO ANSWER:**
1. Start with a 1-2 sentence direct definition of the concept
2. Explain HOW it works using general terms (e.g., "systems", "models", "databases" instead of brand names)
3. Explain WHY it's used (benefits/use cases from sources)
4. Use bullet points to organize key points
5. Keep concrete examples general and illustrative, not tool-specific`;
  }
}
