/**
 * Search Logger - Tracks queries for abuse prevention and quality improvement
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface SearchLogData {
  query: string;
  session_id?: string;
  user_ip?: string;
  intent?: string;
  num_sources?: number;
  response_time_ms?: number;
  success?: boolean;
  error_message?: string;
}

/**
 * Extract session ID from request body (no custom headers = no CORS issues)
 */
export function extractSessionId(body: any): string | undefined {
  return body.session_id;
}

/**
 * Extract user IP from request
 */
export function extractUserIp(req: Request): string | undefined {
  // Cloudflare/proxy headers
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    undefined
  );
}

/**
 * Check if request exceeds rate limit
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  sessionId?: string,
  userIp?: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_session_id: sessionId,
      p_user_ip: userIp,
    });

    if (error) {
      console.error("Rate limit check error:", error);
      // On error, allow the request (fail open)
      return { allowed: true };
    }

    if (data === false) {
      return {
        allowed: false,
        reason: "Rate limit exceeded. Please try again later.",
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Rate limit check failed:", error);
    // Fail open on error
    return { allowed: true };
  }
}

/**
 * Log search query to database
 */
export async function logSearch(
  supabase: SupabaseClient,
  logData: SearchLogData,
): Promise<void> {
  try {
    console.log("[SEARCH-LOG] Attempting to log search:", {
      query: logData.query?.substring(0, 50),
      session_id: logData.session_id,
      success: logData.success
    });

    const { error } = await supabase.from("search_logs").insert({
      query: logData.query,
      session_id: logData.session_id,
      user_ip: logData.user_ip,
      intent: logData.intent,
      num_sources: logData.num_sources,
      response_time_ms: logData.response_time_ms,
      success: logData.success ?? true,
      error_message: logData.error_message,
    });

    if (error) {
      // Don't throw - logging failures shouldn't break user requests
      console.error("[SEARCH-LOG] Failed to log search:", error);
    } else {
      console.log("[SEARCH-LOG] Successfully logged search");
    }
  } catch (error) {
    console.error("[SEARCH-LOG] Search logging error:", error);
  }
}
