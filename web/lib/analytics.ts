import { supabase } from "./supabase";

export interface CategoryData {
  category: string;
  count: number;
  total_downloads: number;
  avg_likes: number;
}

export interface ModelData {
  model_name: string;
  author: string;
  downloads: number;
  likes: number;
  task_type: string;
  ranking_position: number;
}

export interface RepoData {
  repo_name: string;
  owner: string;
  stars: number;
  forks: number;
  language: string;
  ranking_position: number;
}

export interface LanguageData {
  language: string;
  count: number;
  total_stars: number;
  avg_forks: number;
}

export interface AuthorData {
  author: string;
  model_count: number;
  total_downloads: number;
  total_likes: number;
  avg_downloads: number;
}

export interface TagData {
  tag: string;
  count: number;
}

export interface EcosystemOverview {
  total_models: string;
  total_repos: string;
  total_authors: string;
  total_owners: string;
  total_downloads: string;
  total_stars: string;
  avg_model_downloads: string;
  avg_repo_stars: string;
}

export async function getCategoryDistribution(): Promise<CategoryData[]> {
  const { data, error } = await supabase.rpc("get_category_distribution");
  if (error) throw error;
  return data || [];
}

export async function getTopModels(
  limit: number = 10,
  task?: string,
): Promise<ModelData[]> {
  const { data, error } = await supabase.rpc("get_top_models_analytics", {
    p_limit: limit,
    p_task: task || null,
  });
  if (error) throw error;
  return data || [];
}

export async function getTopRepos(
  limit: number = 10,
  language?: string,
): Promise<RepoData[]> {
  const { data, error } = await supabase.rpc("get_top_repos_analytics", {
    p_limit: limit,
    p_language: language || null,
  });
  if (error) throw error;
  return data || [];
}

export async function getLanguageDistribution(): Promise<LanguageData[]> {
  const { data, error } = await supabase.rpc("get_language_distribution");
  if (error) throw error;
  return data || [];
}

export async function getAuthorLeaderboard(
  limit: number = 10,
): Promise<AuthorData[]> {
  const { data, error } = await supabase.rpc("get_author_leaderboard", {
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function getEcosystemOverview(): Promise<EcosystemOverview> {
  const { data, error } = await supabase.rpc("get_ecosystem_overview");
  if (error) throw error;
  return data || {};
}

export async function getPopularTags(limit: number = 20): Promise<TagData[]> {
  const { data, error } = await supabase.rpc("get_popular_tags", {
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}

export async function getPopularTopics(limit: number = 20): Promise<TagData[]> {
  const { data, error } = await supabase.rpc("get_popular_topics", {
    p_limit: limit,
  });
  if (error) throw error;
  return data || [];
}
