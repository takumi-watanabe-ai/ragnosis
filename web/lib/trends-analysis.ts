import { supabase } from "./supabase";

export interface TrendsTimeSeries {
  keyword: string;
  category: string;
  date: string;
  interest: number;
  cumulative_interest: number;
}

export interface AggregatedTrends {
  date: string;
  total_interest: number;
  cumulative_interest: number;
  keyword_count: number;
}

export interface TopTrendingKeyword {
  keyword: string;
  category: string;
  current_interest: number;
  avg_interest: number;
  peak_interest: number;
  trend_direction: "rising" | "declining" | "stable";
}

export async function getTrendsTimeSeries(): Promise<TrendsTimeSeries[]> {
  const { data, error } = await supabase.rpc("get_trends_time_series");
  if (error) throw error;
  return data || [];
}

export async function getAggregatedTrends(): Promise<AggregatedTrends[]> {
  const { data, error } = await supabase.rpc("get_aggregated_trends");
  if (error) throw error;
  return data || [];
}

export async function getTopTrendingKeywords(
  limit = 10,
): Promise<TopTrendingKeyword[]> {
  const { data, error } = await supabase.rpc("get_top_trending_keywords", {
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}
