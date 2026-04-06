import { supabase } from "./supabase";

export interface LanguageTopicMatrix {
  language: string;
  topic: string;
  repo_count: number;
  total_stars: number;
}

export interface TaskAnalysis {
  task: string;
  model_count: number;
  total_downloads: number;
  avg_downloads: number;
  top3_downloads: number;
  top3_share: number;
  median_downloads: number;
  opportunity_score: number;
}

export interface TopicAnalysis {
  topic: string;
  repo_count: number;
  total_stars: number;
  avg_stars: number;
  top3_stars: number;
  top3_share: number;
  median_stars: number;
  opportunity_score: number;
}

export interface ModelCompetitivePosition {
  model_name: string;
  author: string;
  category: string;
  downloads: number;
  likes: number;
  last_updated: string | null;
  days_since_update: number | null;
  ranking_position: number;
  market_share: number;
}

export interface RepoCompetitivePosition {
  repo_name: string;
  owner: string;
  category: string;
  stars: number;
  forks: number;
  updated_at: string | null;
  created_at: string | null;
  months_old: number | null;
  days_since_update: number | null;
  ranking_position: number;
  market_share: number;
}

export interface TechStackPattern {
  topic1: string;
  topic2: string;
  co_occurrence_count: number;
  topic1_total: number;
  topic2_total: number;
  correlation_strength: number;
}

export interface CommonTechStack {
  stack_topics: string[];
  repo_count: number;
  avg_stars: number;
  example_repos: string[];
}

export interface RagTechStackSankeyFlow {
  source: string;
  target: string;
  value: number;
  source_type: string;
  target_type: string;
}

export async function getLanguageTopicMatrix(): Promise<LanguageTopicMatrix[]> {
  const { data, error } = await supabase.rpc("get_language_topic_matrix");
  if (error) throw error;
  return data || [];
}

export async function getTaskAnalysis(): Promise<TaskAnalysis[]> {
  const { data, error } = await supabase.rpc("get_task_analysis");
  if (error) throw error;
  return data || [];
}

export async function getTopicAnalysis(): Promise<TopicAnalysis[]> {
  const { data, error } = await supabase.rpc("get_topic_analysis");
  if (error) throw error;
  return data || [];
}

export async function getModelCompetitivePosition(): Promise<
  ModelCompetitivePosition[]
> {
  const { data, error } = await supabase.rpc("get_model_competitive_position");
  if (error) throw error;
  return data || [];
}

export async function getRepoCompetitivePosition(): Promise<
  RepoCompetitivePosition[]
> {
  const { data, error } = await supabase.rpc("get_repo_competitive_position");
  if (error) throw error;
  return data || [];
}

export async function getTechStackPatterns(): Promise<TechStackPattern[]> {
  const { data, error } = await supabase.rpc("get_tech_stack_patterns");
  if (error) throw error;
  return data || [];
}

export async function getCommonTechStacks(): Promise<CommonTechStack[]> {
  const { data, error } = await supabase.rpc("get_common_tech_stacks");
  if (error) throw error;
  return data || [];
}

export async function getRagTechStackSankey(): Promise<
  RagTechStackSankeyFlow[]
> {
  const { data, error } = await supabase.rpc("get_rag_tech_stack_sankey");
  if (error) throw error;
  return data || [];
}
