export interface SearchResult {
  position: number;
  name: string;
  url: string;
  metadata: {
    title: string;
    url: string;
    [key: string]: unknown;
  };
  doc_type?: "hf_model" | "github_repo" | "google_trend" | "knowledge_base";

  // Citation support
  marker?: string;
  chunk_text?: string;
  chunk_id?: string;
  char_offset?: number;
  chunk_length?: number;

  // Additional metadata for better display
  description?: string;
  content?: string;
  author?: string;
  owner?: string;
  downloads?: number;
  stars?: number;
}

export interface ChatResponse {
  answer: string;
  sources: SearchResult[];
  metadata?: {
    intent?: string;
  };
}

export interface ProgressStep {
  step: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface StreamEvent {
  type: "metadata" | "chunk" | "error" | "progress";
  sources?: SearchResult[];
  metadata?: { intent?: string; data_sources_used?: string[] };
  content?: string;
  message?: string;
  step?: string;
  data?: Record<string, unknown>;
}

export async function sendChatMessage(
  query: string,
  topK: number = 5,
): Promise<ChatResponse> {
  const edgeFunctionUrl =
    process.env.NEXT_PUBLIC_EDGE_FUNCTION_URL ||
    "http://localhost:54321/functions/v1/rag-chat";

  // Use anon key directly as JWT (no sign-in needed)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  };

  const response = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, top_k: topK, stream: false }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Edge function returned status ${response.status}: ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Stream chat message with real-time updates
 */
export async function* sendChatMessageStream(
  query: string,
  topK: number = 5,
): AsyncIterableIterator<StreamEvent> {
  const edgeFunctionUrl =
    process.env.NEXT_PUBLIC_EDGE_FUNCTION_URL ||
    "http://localhost:54321/functions/v1/rag-chat";

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  };

  const response = await fetch(edgeFunctionUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, top_k: topK, stream: true }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Edge function returned status ${response.status}: ${errorText}`,
    );
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim().startsWith("data: ")) {
          const data = line.slice(6).trim();

          if (data === "[DONE]") {
            return;
          }

          if (!data) continue;

          try {
            const event = JSON.parse(data) as StreamEvent;
            yield event;
          } catch (e) {
            console.error("Failed to parse SSE event:", data, e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export interface EcosystemStats {
  total_models: number;
  total_repos: number;
  total_articles: number;
}

export async function getEcosystemStats(): Promise<EcosystemStats> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:54321";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
  };

  const response = await fetch(
    `${supabaseUrl}/rest/v1/rpc/get_ecosystem_overview`,
    {
      method: "POST",
      headers,
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch ecosystem stats: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    total_models: parseInt(data.total_models || "0"),
    total_repos: parseInt(data.total_repos || "0"),
    total_articles: parseInt(data.total_articles || "0"),
  };
}
