/**
 * Answer Generator - Step 3: Synthesize answer from data sources
 * Single LLM call to generate final answer
 */

import type { SearchResult, QueryIntent } from "./types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { config } from "./config.ts";
import { verifyAnswer } from "./answer-verifier.ts";
import { getLLMClient } from "./services/llm-client.ts";
import { getFeatureFlagService } from "./services/feature-flags.ts";
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
    let answer = await llmClient.generate(prompt);

    // Answer verification if enabled (from database)
    if (supabase) {
      const featureFlags = getFeatureFlagService(supabase);
      const verificationEnabled = await featureFlags.isEnabled('answer_verification');

      if (verificationEnabled) {
        const verification = await verifyAnswer(answer, results);

      // Only use verified answer if faithfulness is acceptable
      if (
        verification.faithfulnessScore >=
        config.features.answerVerification.minFaithfulness
      ) {
        answer = verification.verifiedAnswer;
        console.log(
          `${LOG_PREFIX.SUCCESS} Using verified answer (faithfulness: ${verification.faithfulnessScore.toFixed(2)})`,
        );
      } else {
        console.log(
          `${LOG_PREFIX.WARNING} Verification faithfulness too low (${verification.faithfulnessScore.toFixed(2)}), using original`,
        );
      }
      }
    }

    return answer;
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} Answer generation failed:`, error);
    return RESPONSE_MESSAGES.GENERATION_ERROR;
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

1. For EACH model/repo, provide:
   - Name as clickable link: **[Name](URL)**
   - Key metrics (downloads/stars/likes)
   - What it's good for (from description/task)
   - When to use it (based on description)

2. After the list, add "Choosing the Right One":
   - Quick decision guide based on use cases from descriptions above
   - Only use information explicitly in the data above

3. STRICT RULES:
   - NEVER mention items not in the list above
   - NEVER invent features or capabilities
   - Base ALL context on the descriptions provided

Answer format:
## Top [Models/Repos]

1. **[Name](URL)** - [Downloads/Stars]
   - **What**: [From description]
   - **Best for**: [From task/description]

## Choosing the Right One
- [Decision guide from data above only]

Answer:`;
}

/**
 * Generate answer with LLM
 */
async function generateWithLLM(prompt: string): Promise<string> {
  try {
    const llmClient = getLLMClient();
    return await llmClient.generate(prompt, {
      temperature: 0.3,
      maxTokens: 1000,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX.ERROR} LLM generation failed:`, error);
    return RESPONSE_MESSAGES.GENERATION_ERROR;
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
  let context = "SOURCES:\n";

  results.forEach((item, i) => {
    // Clean both name and title to remove (Part X/Y)
    const cleanName = cleanPartSuffix(item.name);
    const cleanTitle = item.metadata?.title
      ? cleanPartSuffix(item.metadata.title)
      : cleanName;
    const sourceLink = markdownLink(cleanTitle, item.url);

    context += `\n- ${sourceLink}`;

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

  return `${context}

Question: ${query}

${instructions}

Answer:`;
}

/**
 * Get instructions based on query intent
 */
function getInstructionsByIntent(intent: QueryIntent): string {
  const baseRules = `You are a RAG/ML expert assistant. Answer STRICTLY using ONLY the sources provided above.

**CRITICAL ANTI-HALLUCINATION RULES:**
1. ONLY use information EXPLICITLY stated in the provided SOURCES
2. DO NOT invent, guess, or use external knowledge — not even well-known facts
3. NEVER cite sources that don't exist in the provided context

LENGTH: Answer can never exceed ${config.llm.answer.targetWords} words. Be complete but concise.

FORMATTING:
- ALWAYS reference sources inline as clickable links: **[Name](url)**
- Use bullet points for lists
- For structured/multi-section responses, use markdown headers (## for sections, ### for subsections)
- Structure with line breaks for readability`;

  switch (intent) {
    case "market_intelligence":
      return `${baseRules}

ANSWER APPROACH:
- FIRST: Directly answer the user's specific question
- Then provide supporting details from sources

Requirements:
- Match source types (models → HuggingFace, repos → GitHub)
- Include ALL metrics (downloads/likes/stars/forks) from sources only
- Use bullet points for multiple items`;

    case "implementation":
      return `${baseRules}

ANSWER APPROACH:
- FIRST: Directly answer the user's specific question
- Then provide step-by-step implementation from sources

Requirements:
- Step-by-step guidance with parameters from sources only
- Explain what to do AND why based on sources
- Use bullet points for steps`;

    case "troubleshooting":
      return `${baseRules}

ANSWER APPROACH:
- FIRST: Directly answer what's causing the issue
- Then provide solutions from sources

Requirements:
- Explain root causes based only on sources
- List ALL solutions found in sources
- Use bullet points for multiple solutions`;

    case "comparison":
      return `${baseRules}

ANSWER APPROACH:
- FIRST: Directly state the key differences
- Then elaborate with details from sources

Requirements:
- Compare using only features/use cases from sources
- Use table for 3+ items, bullets for 2 items`;

    case "conceptual":
    default:
      return `You are a RAG/ML expert assistant. Answer using the sources provided, synthesizing general concepts.

**CONCEPTUAL ANSWER RULES:**
1. Synthesize GENERAL concepts from the sources (abstract away tool-specific details)
2. When sources mention specific tools (Pinecone, LangChain, etc.), extract the UNDERLYING CONCEPT
3. Provide a beginner-friendly explanation of how things work in general
4. Use source examples to ILLUSTRATE concepts, not to define them
5. If multiple sources describe similar concepts with different tools, unify the explanation

LENGTH: Answer can never exceed ${config.llm.answer.targetWords} words. Be complete but concise.

FORMATTING:
- Use bullet points for lists
- Use markdown headers (## for sections, ### for subsections)
- Structure with line breaks for readability

Requirements:
- FIRST: Directly answer the user's specific question with general concepts
- Cover what, why, and how (synthesized from sources)
- Use bullet points to organize key concepts
- Abstract tool-specific details into general patterns`;
  }
}
