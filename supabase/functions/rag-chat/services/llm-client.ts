/**
 * Centralized LLM client service
 * Eliminates duplicate LLM calling code across the codebase
 */

import { config } from '../config.ts'
import { parseJsonFromLLM } from '../utils/json-parser.ts'
import { LOG_PREFIX } from '../utils/constants.ts'

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
  format?: 'json' | 'text'
}

export interface GenerateOptions {
  temperature?: number
  maxTokens?: number
}

/**
 * LLM Client for interacting with Ollama
 */
export class LLMClient {
  private baseUrl: string
  private model: string

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || config.llm.url
    this.model = model || config.llm.model
  }

  /**
   * Chat API call (for structured JSON outputs)
   */
  async chat(
    prompt: string,
    options: ChatOptions = {}
  ): Promise<string> {
    const {
      temperature = config.llm.planning.temperature,
      maxTokens = config.llm.planning.maxTokens,
      format = 'json'
    } = options

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          format,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM chat request failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.message.content.trim()
    } catch (error) {
      console.error(`${LOG_PREFIX.ERROR} LLM chat failed:`, error)
      throw error
    }
  }

  /**
   * Generate API call (for text generation)
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<string> {
    const {
      temperature = config.llm.answer.temperature,
      maxTokens = config.llm.answer.maxTokens,
    } = options

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM generate request failed: ${response.statusText}`)
      }

      const data = await response.json()
      return data.response.trim()
    } catch (error) {
      console.error(`${LOG_PREFIX.ERROR} LLM generate failed:`, error)
      throw error
    }
  }

  /**
   * Chat with automatic JSON parsing
   */
  async chatJson<T = any>(
    prompt: string,
    options: ChatOptions = {}
  ): Promise<T | null> {
    const content = await this.chat(prompt, { ...options, format: 'json' })
    console.log(`${LOG_PREFIX.LLM} Raw LLM response:`, content.substring(0, 300))
    return parseJsonFromLLM<T>(content)
  }

  /**
   * Generate with custom model
   */
  async generateWithModel(
    prompt: string,
    model: string,
    options: GenerateOptions = {}
  ): Promise<string> {
    const originalModel = this.model
    this.model = model
    try {
      return await this.generate(prompt, options)
    } finally {
      this.model = originalModel
    }
  }
}

// Singleton instance
let llmClient: LLMClient | null = null

/**
 * Get or create LLM client instance
 */
export function getLLMClient(): LLMClient {
  if (!llmClient) {
    llmClient = new LLMClient()
  }
  return llmClient
}
