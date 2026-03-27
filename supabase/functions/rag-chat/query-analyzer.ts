/**
 * LLM-Based Query Analyzer
 *
 * Inspired by finance-agent's question_analyzer.py
 * Uses Ollama (qwen2.5:3b) to analyze queries with high accuracy
 */

import { config } from './config.ts'

export type QueryIntent =
  | 'market_intelligence'  // Top models, popular frameworks, trending
  | 'implementation'       // How-to guides, tutorials, setup
  | 'troubleshooting'      // Fix errors, solve problems
  | 'comparison'           // Compare X vs Y
  | 'conceptual'           // Explain, what is, understand
  | 'invalid'              // Off-topic

export type DataSource = 'sql_models' | 'sql_repos' | 'blog' | 'fallback'

export type AnswerMode = 'direct' | 'standard' | 'detailed'

export interface ExtractedEntities {
  frameworks?: string[]      // LangChain, LlamaIndex, Haystack
  vector_dbs?: string[]      // Pinecone, Weaviate, Qdrant
  models?: string[]          // all-MiniLM-L6-v2, gte-small
  companies?: string[]       // Supabase, OpenAI, Anthropic
  concepts?: string[]        // chunking, embeddings, retrieval
}

export interface QueryAnalysis {
  original: string
  intent: QueryIntent
  source: DataSource
  answer_mode: AnswerMode
  entities: ExtractedEntities
  topic: string
  is_valid: boolean
  confidence: number
  reason?: string
  suggestions?: string[]
  enhanced_query?: string
}

// ============================================================================
// LLM Analysis System Prompt (Inspired by finance-agent)
// ============================================================================

const SYSTEM_PROMPT = `You are a JSON-only response assistant for RAG/ML/AI query analysis.
You analyze questions about RAG (Retrieval Augmented Generation), embeddings, vector databases,
and ML frameworks.

RESPOND WITH VALID JSON ONLY. NO EXPLANATIONS OR ADDITIONAL TEXT.

Classify queries into these intents:
- market_intelligence: "top embedding models", "most popular frameworks", "trending tools"
- implementation: "how to set up", "tutorial for", "guide to"
- troubleshooting: "fix errors", "why is X failing", "solve problem"
- comparison: "compare LangChain vs LlamaIndex", "X versus Y"
- conceptual: "what is chunking", "explain reranking"
- invalid: off-topic (weather, sports, non-RAG/ML topics)

Extract entities:
- frameworks: LangChain, LlamaIndex, Haystack, etc.
- vector_dbs: Pinecone, Weaviate, Qdrant, Chroma, pgvector, etc.
- models: all-MiniLM-L6-v2, gte-small, BGE, sentence-transformers, etc.
- companies: Supabase, OpenAI, Anthropic, Cohere, etc.
- concepts: chunking, embeddings, retrieval, reranking, etc.

Determine answer_mode:
- direct: Simple lookups ("What is download count for X?")
- standard: Moderate questions ("How to set up Pinecone?")
- detailed: Complex questions ("Compare frameworks for production", "Analyze X")

NO EXPLANATIONS. ONLY JSON.`

// ============================================================================
// Analysis Prompt Builder
// ============================================================================

function buildAnalysisPrompt(query: string): string {
  return `Analyze this RAG/ML/AI question and extract key information. Respond with valid JSON only.

QUESTION: "${query}"

REQUIRED JSON STRUCTURE:
{
  "is_valid": true,
  "reason": "Brief explanation",
  "intent": "market_intelligence|implementation|troubleshooting|comparison|conceptual|invalid",
  "entities": {
    "frameworks": ["LangChain"],
    "vector_dbs": ["Pinecone"],
    "models": ["gte-small"],
    "companies": ["Supabase"],
    "concepts": ["embeddings"]
  },
  "topic": "what the question is about",
  "answer_mode": "direct|standard|detailed",
  "confidence": 0.95
}

VALIDATION RULES:
- Mark is_valid=false for: gibberish, greetings, non-RAG/ML topics (weather, sports, etc.)
- For invalid queries, provide helpful suggestions about RAG/ML topics
- Extract ALL relevant entities (frameworks, models, companies, concepts)
- Set confidence based on query clarity (0.0-1.0)

EXAMPLES:

QUESTION: "What are the top embedding models?"
OUTPUT: {"is_valid": true, "reason": "Valid market intelligence query", "intent": "market_intelligence", "entities": {"concepts": ["embedding models"]}, "topic": "top embedding models", "answer_mode": "standard", "confidence": 0.95}

QUESTION: "How to improve retrieval accuracy?"
OUTPUT: {"is_valid": true, "reason": "Valid implementation question", "intent": "implementation", "entities": {"concepts": ["retrieval", "accuracy"]}, "topic": "improving retrieval accuracy", "answer_mode": "detailed", "confidence": 0.90}

QUESTION: "Compare LangChain vs LlamaIndex"
OUTPUT: {"is_valid": true, "reason": "Valid comparison question", "intent": "comparison", "entities": {"frameworks": ["LangChain", "LlamaIndex"]}, "topic": "framework comparison", "answer_mode": "detailed", "confidence": 0.95}

QUESTION: "What embedding model does Supabase use?"
OUTPUT: {"is_valid": true, "reason": "Valid market intelligence query about specific company", "intent": "market_intelligence", "entities": {"companies": ["Supabase"], "concepts": ["embedding model"]}, "topic": "Supabase embedding model", "answer_mode": "direct", "confidence": 0.90}

QUESTION: "Fix chunking errors"
OUTPUT: {"is_valid": true, "reason": "Valid troubleshooting question", "intent": "troubleshooting", "entities": {"concepts": ["chunking", "errors"]}, "topic": "chunking errors", "answer_mode": "standard", "confidence": 0.85}

QUESTION: "What's the weather today?"
OUTPUT: {"is_valid": false, "reason": "I specialize in RAG/ML topics. I can't help with weather.", "intent": "invalid", "entities": {}, "topic": "", "answer_mode": "direct", "confidence": 0.0, "suggestions": ["How to improve retrieval accuracy?", "What are the top embedding models?", "Compare LangChain vs LlamaIndex"]}

RESPOND WITH VALID JSON ONLY.`
}

// ============================================================================
// LLM Call to Ollama
// ============================================================================

async function callOllama(prompt: string): Promise<string> {
  const { url: ollamaUrl, model: ollamaModel } = config.llm

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      prompt: `${SYSTEM_PROMPT}\n\n${prompt}`,
      stream: false,
      options: {
        temperature: 0.1,  // Low temperature for consistent JSON
        num_predict: 500,  // Max tokens for response
      }
    })
  })

  if (!response.ok) {
    throw new Error(`Ollama failed: ${response.statusText}`)
  }

  const data = await response.json()
  return data.response.trim()
}

// ============================================================================
// JSON Parsing with Cleanup
// ============================================================================

function parseJSON(text: string): any {
  // Remove markdown code blocks if present
  let cleaned = text
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }

  cleaned = cleaned.trim()
  return JSON.parse(cleaned)
}

// ============================================================================
// Determine Data Source from Intent + Entities
// ============================================================================

function determineDataSource(intent: QueryIntent, entities: ExtractedEntities): DataSource {
  // Market intelligence → SQL
  if (intent === 'market_intelligence') {
    // Check if asking about models or repos
    const hasModels = entities.models && entities.models.length > 0
    const hasFrameworks = entities.frameworks && entities.frameworks.length > 0
    const hasConcepts = entities.concepts && entities.concepts.some(c =>
      /model|embedding|transformer|encoder/i.test(c)
    )

    if (hasModels || hasConcepts) {
      return 'sql_models'
    }
    if (hasFrameworks) {
      return 'sql_repos'
    }
    return 'sql_models'  // Default for market intelligence
  }

  // Implementation, troubleshooting, comparison, conceptual → Blog
  if (['implementation', 'troubleshooting', 'comparison', 'conceptual'].includes(intent)) {
    return 'blog'
  }

  return 'fallback'
}

// ============================================================================
// Query Enhancement
// ============================================================================

function enhanceQuery(original: string, intent: QueryIntent, entities: ExtractedEntities): string {
  let enhanced = original

  // Market intelligence: add ranking context
  if (intent === 'market_intelligence') {
    if (!/\b(top|popular|best|trending|downloads|stars)\b/i.test(enhanced)) {
      enhanced = `${enhanced} by popularity`
    }
  }

  // Add entity context if available
  const allEntities = [
    ...(entities.frameworks || []),
    ...(entities.vector_dbs || []),
    ...(entities.models || []),
    ...(entities.companies || [])
  ]

  if (allEntities.length > 0 && enhanced === original) {
    enhanced = `${enhanced} (${allEntities.join(', ')})`
  }

  return enhanced !== original ? enhanced : undefined
}

// ============================================================================
// Main API
// ============================================================================

export async function analyzeQuery(query: string): Promise<QueryAnalysis> {
  const startTime = Date.now()

  try {
    console.log(`🤖 Analyzing query with LLM: "${query}"`)

    // Build prompt
    const prompt = buildAnalysisPrompt(query)

    // Call Ollama
    const response = await callOllama(prompt)
    const analysisTime = Date.now() - startTime
    console.log(`⏱️  LLM analysis took ${analysisTime}ms`)

    // Parse JSON
    const parsed = parseJSON(response)
    console.log(`📊 LLM result: intent=${parsed.intent}, confidence=${parsed.confidence}`)

    // Handle invalid queries
    if (!parsed.is_valid) {
      return {
        original: query,
        intent: 'invalid',
        source: 'fallback',
        answer_mode: 'direct',
        entities: {},
        topic: '',
        is_valid: false,
        confidence: 0.0,
        reason: parsed.reason,
        suggestions: parsed.suggestions || []
      }
    }

    // Determine data source
    const source = determineDataSource(parsed.intent, parsed.entities || {})

    // Enhance query
    const enhanced_query = enhanceQuery(query, parsed.intent, parsed.entities || {})

    return {
      original: query,
      intent: parsed.intent,
      source,
      answer_mode: parsed.answer_mode || 'standard',
      entities: parsed.entities || {},
      topic: parsed.topic || '',
      is_valid: true,
      confidence: parsed.confidence || 0.7,
      enhanced_query
    }

  } catch (error) {
    console.error('❌ LLM analysis failed:', error)

    // Fallback to simple classification on error
    return {
      original: query,
      intent: 'conceptual',
      source: 'blog',
      answer_mode: 'standard',
      entities: {},
      topic: query,
      is_valid: true,
      confidence: 0.5,
      reason: 'LLM analysis failed, using fallback'
    }
  }
}

// ============================================================================
// Helper: Get routing explanation
// ============================================================================

export function getRoutingExplanation(analysis: QueryAnalysis): string {
  const { intent, source, entities, topic } = analysis

  const entityList = [
    ...(entities.frameworks || []),
    ...(entities.vector_dbs || []),
    ...(entities.models || []),
    ...(entities.companies || [])
  ].join(', ')

  const explanations: Record<string, string> = {
    market_intelligence: `Market intelligence: "${topic}"${entityList ? ` (${entityList})` : ''} → ${source}`,
    implementation: `Implementation guide: "${topic}" → ${source}`,
    troubleshooting: `Troubleshooting: "${topic}" → ${source}`,
    comparison: `Comparison: "${topic}" → ${source}`,
    conceptual: `Conceptual: "${topic}" → ${source}`,
    invalid: 'Invalid query'
  }

  return explanations[intent] || `Query about "${topic}" → ${source}`
}
