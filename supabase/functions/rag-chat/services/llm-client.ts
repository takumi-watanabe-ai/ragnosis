/**
 * Centralized LLM client service
 * Supports both OpenRouter (production) and Ollama (local development)
 */

import { config } from "../config.ts";
import { parseJsonFromLLM } from "../utils/json-parser.ts";
import { LOG_PREFIX } from "../utils/constants.ts";

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  format?: "json" | "text";
}

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateResult {
  content: string;
  usage?: TokenUsage;
}

type LLMProvider = "openrouter" | "ollama";

interface ProviderConfig {
  provider: LLMProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/**
 * Detect and configure LLM provider based on environment
 * Reusable across different contexts
 */
function getProviderConfig(): ProviderConfig {
  const apiKey = config.llm.openrouter.apiKey;
  const openRouterModel = config.llm.openrouter.model;

  // Detect if running in production (Supabase edge functions set SUPABASE_URL)
  const isProduction = Deno.env.get("SUPABASE_URL")?.includes("supabase.co");

  // Check if OpenRouter is fully configured
  const isPlaceholder =
    apiKey?.toLowerCase().includes("your_") ||
    apiKey?.toLowerCase().includes("placeholder");
  const hasOpenRouterConfig =
    apiKey &&
    apiKey.length > 0 &&
    !isPlaceholder &&
    openRouterModel &&
    openRouterModel.length > 0;

  // In production, REQUIRE OpenRouter - don't fall back to Ollama
  if (isProduction && !hasOpenRouterConfig) {
    throw new Error(
      "Production environment requires OPENROUTER_API_KEY and OPENROUTER_MODEL env vars. " +
        "Ollama is only available for local development.",
    );
  }

  // Return provider configuration
  if (hasOpenRouterConfig) {
    return {
      provider: "openrouter",
      baseUrl: config.llm.openrouter.baseUrl,
      model: openRouterModel,
      apiKey: apiKey,
    };
  } else {
    return {
      provider: "ollama",
      baseUrl: config.llm.ollama.url,
      model: config.llm.ollama.model,
    };
  }
}

/**
 * Check if an error is retryable (rate limits, timeouts, etc.)
 */
function isRetryableError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();
  return (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("429") ||
    errorMessage.includes("503") ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("overloaded") ||
    errorMessage.includes("temporarily unavailable")
  );
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  onRetry?: (attempt: number, waitSeconds: number) => void,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt >= maxAttempts || !isRetryableError(lastError)) {
        throw lastError;
      }

      const waitSeconds = 5 * attempt; // 5s, 10s, 15s
      console.warn(
        `${LOG_PREFIX.WARN} Retrying after error (attempt ${attempt}/${maxAttempts}): ${lastError.message}`,
      );

      if (onRetry) {
        onRetry(attempt, waitSeconds);
      }

      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    }
  }

  throw lastError;
}

/**
 * LLM Client for interacting with OpenRouter (production) or Ollama (local)
 * Auto-detects provider based on OPENROUTER_API_KEY presence
 */
export class LLMClient {
  private provider: LLMProvider;
  private baseUrl: string;
  private model: string;
  private apiKey?: string;

  constructor() {
    // Use reusable provider configuration
    const providerConfig = getProviderConfig();

    this.provider = providerConfig.provider;
    this.baseUrl = providerConfig.baseUrl;
    this.model = providerConfig.model;
    this.apiKey = providerConfig.apiKey;

    console.log(
      `${LOG_PREFIX.INFO} LLM Client initialized: ${this.provider} (${this.model})`,
    );
  }

  /**
   * Chat API call (for structured JSON outputs)
   */
  async chat(prompt: string, options: ChatOptions = {}): Promise<string> {
    const {
      temperature = config.llm.planning.temperature,
      maxTokens = config.llm.planning.maxTokens,
      format = "json",
    } = options;

    try {
      if (this.provider === "openrouter") {
        return await this.chatOpenRouter(
          prompt,
          temperature,
          maxTokens,
          format,
        );
      } else {
        return await this.chatOllama(prompt, temperature, maxTokens, format);
      }
    } catch (error) {
      console.error(`${LOG_PREFIX.ERROR} LLM chat failed:`, error);
      throw error;
    }
  }

  /**
   * OpenRouter chat implementation (OpenAI-compatible API)
   */
  private async chatOpenRouter(
    prompt: string,
    temperature: number,
    maxTokens: number,
    format: "json" | "text",
  ): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": "https://ragnosis.com", // Optional: for rankings
      "X-Title": "RAGnosis", // Optional: for rankings
    };

    const body: any = {
      model: this.model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    };

    // OpenRouter supports response_format for JSON mode
    if (format === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API request failed: ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  /**
   * Ollama chat implementation
   */
  private async chatOllama(
    prompt: string,
    temperature: number,
    maxTokens: number,
    format: "json" | "text",
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        format,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama chat request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message.content.trim();
  }

  /**
   * Generate API call (for text generation)
   * Returns content only for backwards compatibility
   */
  async generate(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<string> {
    const result = await this.generateWithUsage(prompt, options);
    return result.content;
  }

  /**
   * Generate API call with token usage tracking
   */
  async generateWithUsage(
    prompt: string,
    options: GenerateOptions = {},
    onRetry?: (attempt: number, waitSeconds: number) => void,
  ): Promise<GenerateResult> {
    const {
      temperature = config.llm.answer.temperature,
      maxTokens = config.llm.answer.maxTokens,
    } = options;

    try {
      return await retryWithBackoff(
        async () => {
          if (this.provider === "openrouter") {
            return await this.generateOpenRouterWithUsage(
              prompt,
              temperature,
              maxTokens,
            );
          } else {
            return await this.generateOllamaWithUsage(
              prompt,
              temperature,
              maxTokens,
            );
          }
        },
        3,
        onRetry,
      );
    } catch (error) {
      console.error(`${LOG_PREFIX.ERROR} LLM generate failed:`, error);
      throw error;
    }
  }

  /**
   * OpenRouter generate implementation (using chat completions API)
   */
  private async generateOpenRouter(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const result = await this.generateOpenRouterWithUsage(
      prompt,
      temperature,
      maxTokens,
    );
    return result.content;
  }

  /**
   * OpenRouter generate with token usage tracking
   */
  private async generateOpenRouterWithUsage(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<GenerateResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": "https://ragnosis.com",
      "X-Title": "RAGnosis",
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API request failed: ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Extract token usage if available
    let usage: TokenUsage | undefined;
    if (data.usage) {
      usage = {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      };
      console.log(
        `${LOG_PREFIX.INFO} Token usage: ${usage.totalTokens} total (${usage.promptTokens} prompt + ${usage.completionTokens} completion)`,
      );
    }

    return { content, usage };
  }

  /**
   * Ollama generate implementation
   */
  private async generateOllama(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const result = await this.generateOllamaWithUsage(
      prompt,
      temperature,
      maxTokens,
    );
    return result.content;
  }

  /**
   * Ollama generate with token usage tracking
   */
  private async generateOllamaWithUsage(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): Promise<GenerateResult> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    });

    if (!response.ok) {
      throw new Error(`Ollama generate request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.response.trim();

    // Ollama returns token counts differently
    let usage: TokenUsage | undefined;
    if (data.prompt_eval_count || data.eval_count) {
      usage = {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      };
      console.log(
        `${LOG_PREFIX.INFO} Token usage: ${usage.totalTokens} total (${usage.promptTokens} prompt + ${usage.completionTokens} completion)`,
      );
    }

    return { content, usage };
  }

  /**
   * Generate API call with streaming support (for text generation)
   */
  async *generateStream(
    prompt: string,
    options: GenerateOptions = {},
    onRetry?: (attempt: number, waitSeconds: number) => void,
  ): AsyncIterableIterator<string> {
    const {
      temperature = config.llm.answer.temperature,
      maxTokens = config.llm.answer.maxTokens,
    } = options;

    // Retry the initial connection, then stream
    let attempt = 0;
    const maxAttempts = 3;

    while (true) {
      attempt++;
      try {
        if (this.provider === "openrouter") {
          yield* this.generateStreamOpenRouter(prompt, temperature, maxTokens);
        } else {
          yield* this.generateStreamOllama(prompt, temperature, maxTokens);
        }
        break; // Success, exit retry loop
      } catch (error) {
        const err = error as Error;

        if (attempt >= maxAttempts || !isRetryableError(err)) {
          console.error(
            `${LOG_PREFIX.ERROR} LLM streaming generate failed:`,
            error,
          );
          throw error;
        }

        const waitSeconds = 5 * attempt;
        console.warn(
          `${LOG_PREFIX.WARN} Streaming retry (attempt ${attempt}/${maxAttempts}): ${err.message}`,
        );

        if (onRetry) {
          onRetry(attempt, waitSeconds);
        }

        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      }
    }
  }

  /**
   * OpenRouter streaming generate implementation
   */
  private async *generateStreamOpenRouter(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): AsyncIterableIterator<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": "https://ragnosis.com",
      "X-Title": "RAGnosis",
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
        stream: true, // Enable streaming
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API request failed: ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = ""; // Buffer for incomplete lines

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split by newlines but keep the last incomplete line in buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep last (possibly incomplete) line in buffer

        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;

          const data = line.replace(/^data: /, "").trim();
          if (data === "[DONE]") continue;
          if (!data) continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            // Skip malformed JSON chunks
            console.warn(`${LOG_PREFIX.WARN} Failed to parse SSE chunk:`, data);
          }
        }
      }

      // Process any remaining buffered line
      if (buffer.trim().startsWith("data: ")) {
        const data = buffer.replace(/^data: /, "").trim();
        if (data && data !== "[DONE]") {
          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch (e) {
            console.warn(
              `${LOG_PREFIX.WARN} Failed to parse final SSE chunk:`,
              data,
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Ollama streaming generate implementation
   */
  private async *generateStreamOllama(
    prompt: string,
    temperature: number,
    maxTokens: number,
  ): AsyncIterableIterator<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: true, // Enable streaming
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama streaming generate request failed: ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = ""; // Buffer for incomplete lines

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Split by newlines but keep the last incomplete line in buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep last (possibly incomplete) line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            if (json.response) {
              yield json.response;
            }
          } catch (e) {
            // Skip malformed JSON chunks
            console.warn(
              `${LOG_PREFIX.WARN} Failed to parse Ollama chunk:`,
              line,
            );
          }
        }
      }

      // Process any remaining buffered line
      if (buffer.trim()) {
        try {
          const json = JSON.parse(buffer);
          if (json.response) {
            yield json.response;
          }
        } catch (e) {
          console.warn(
            `${LOG_PREFIX.WARN} Failed to parse final Ollama chunk:`,
            buffer,
          );
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Chat with automatic JSON parsing
   */
  async chatJson<T = any>(
    prompt: string,
    options: ChatOptions = {},
  ): Promise<T | null> {
    const content = await this.chat(prompt, { ...options, format: "json" });
    console.log(
      `${LOG_PREFIX.LLM} Raw LLM response:`,
      content.substring(0, 300),
    );
    return parseJsonFromLLM<T>(content);
  }

  /**
   * Generate with custom model
   */
  async generateWithModel(
    prompt: string,
    model: string,
    options: GenerateOptions = {},
  ): Promise<string> {
    const originalModel = this.model;
    this.model = model;
    try {
      return await this.generate(prompt, options);
    } finally {
      this.model = originalModel;
    }
  }
}

// Singleton instance
let llmClient: LLMClient | null = null;

/**
 * Get or create LLM client instance
 */
export function getLLMClient(): LLMClient {
  if (!llmClient) {
    llmClient = new LLMClient();
  }
  return llmClient;
}
