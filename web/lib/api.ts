export interface SearchResult {
  position: number;
  name: string;
  url: string;
  metadata: {
    title: string;
    url: string;
    [key: string]: unknown;
  };
}

export interface ChatResponse {
  answer: string;
  sources: SearchResult[];
  metadata?: {
    intent?: string;
  };
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
    body: JSON.stringify({ query, top_k: topK }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Edge function returned status ${response.status}: ${errorText}`,
    );
  }

  return response.json();
}
