"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getCategoryDistribution,
  getTopModels,
  getTopRepos,
  getLanguageDistribution,
  getAuthorLeaderboard,
  getEcosystemOverview,
  getPopularTags,
  getPopularTopics,
  type CategoryData,
  type ModelData,
  type RepoData,
  type LanguageData,
  type AuthorData,
  type EcosystemOverview,
  type TagData,
} from "@/lib/analytics";

// Theme colors matching your design
const COLORS = {
  primary: ["#222222", "#333333", "#666666", "#999999", "#cccccc"],
  accent: ["#8b7355", "#a68a64", "#c4a57b", "#e0c097"],
};

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<EcosystemOverview | null>(null);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [topModels, setTopModels] = useState<ModelData[]>([]);
  const [topRepos, setTopRepos] = useState<RepoData[]>([]);
  const [languages, setLanguages] = useState<LanguageData[]>([]);
  const [authors, setAuthors] = useState<AuthorData[]>([]);
  const [tags, setTags] = useState<TagData[]>([]);
  const [topics, setTopics] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [
          overviewData,
          categoryData,
          modelData,
          repoData,
          languageData,
          authorData,
          tagData,
          topicData,
        ] = await Promise.all([
          getEcosystemOverview(),
          getCategoryDistribution(),
          getTopModels(10),
          getTopRepos(10),
          getLanguageDistribution(),
          getAuthorLeaderboard(10),
          getPopularTags(15),
          getPopularTopics(15),
        ]);

        setOverview(overviewData);
        setCategories(categoryData);
        setTopModels(modelData);
        setTopRepos(repoData);
        setLanguages(languageData);
        setAuthors(authorData);
        setTags(tagData);
        setTopics(topicData);
      } catch (err) {
        console.error("Error loading analytics:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load analytics data. Make sure SQL functions are deployed.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-charcoal text-sm tracking-wide">
          Loading analytics...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="text-charcoal text-sm tracking-wide mb-4 uppercase">
            Error Loading Analytics
          </div>
          <div className="text-stone text-xs font-light mb-6">{error}</div>
          <div className="text-xs text-stone font-light border border-stone-border p-4 bg-white">
            <p className="mb-2">Make sure you have:</p>
            <ol className="text-left list-decimal list-inside space-y-1">
              <li>Deployed the SQL functions to Supabase</li>
              <li>Set up environment variables in .env.local</li>
              <li>Started Supabase locally</li>
            </ol>
          </div>
          <Link
            href="/"
            className="inline-block mt-6 px-6 py-3 text-xs uppercase tracking-[0.15em] border-2 border-charcoal text-charcoal hover:bg-charcoal hover:text-cream transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="border-b border-stone-border bg-cream sticky top-0 z-10">
        <div className="px-6 sm:px-12 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              <span className="text-xs sm:text-sm font-light tracking-[0.2em] text-charcoal uppercase">
                RAGnosis
              </span>
            </Link>
            <div className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/chat"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase"
              >
                Chat
              </Link>
              <Link
                href="/analytics"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase border-b-2 border-charcoal"
              >
                Basic
              </Link>
              <Link
                href="/analytics/market"
                className="text-xs sm:text-sm font-medium tracking-wide text-stone hover:opacity-70 transition-opacity uppercase"
              >
                Market
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-6 sm:px-12 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          {/* Title */}
          <div className="mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-charcoal mb-3 uppercase">
              RAG Ecosystem Analytics
            </h1>
            <p className="text-sm sm:text-base text-stone font-light">
              Real-time insights from HuggingFace models and GitHub repositories
            </p>
          </div>

          {/* Overview Stats */}
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12">
              <StatCard
                label="Models"
                value={parseInt(overview.total_models).toLocaleString()}
              />
              <StatCard
                label="Repositories"
                value={parseInt(overview.total_repos).toLocaleString()}
              />
              <StatCard
                label="Total Downloads"
                value={formatLargeNumber(parseInt(overview.total_downloads))}
              />
              <StatCard
                label="Total Stars"
                value={formatLargeNumber(parseInt(overview.total_stars))}
              />
            </div>
          )}

          {/* Category Distribution */}
          <ChartSection title="Model Category Distribution">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categories}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderPieLabel}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {categories.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS.primary[index % COLORS.primary.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col justify-center space-y-3">
                {categories.map((cat, index) => (
                  <div
                    key={cat.category}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 border border-stone-border"
                        style={{
                          backgroundColor:
                            COLORS.primary[index % COLORS.primary.length],
                        }}
                      />
                      <span className="text-sm text-charcoal uppercase tracking-wide">
                        {cat.category}
                      </span>
                    </div>
                    <span className="text-sm text-stone font-light">
                      {cat.count} models
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartSection>

          {/* Top Models */}
          <ChartSection title="Top Models by Downloads">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={topModels}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis type="number" stroke="#666666" />
                <YAxis
                  type="category"
                  dataKey="model_name"
                  stroke="#666666"
                  tick={{ fontSize: 11 }}
                  width={140}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="downloads" fill="#222222" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Top Repos */}
          <ChartSection title="Top GitHub Repositories by Stars">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={topRepos}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis type="number" stroke="#666666" />
                <YAxis
                  type="category"
                  dataKey="repo_name"
                  stroke="#666666"
                  tick={{ fontSize: 11 }}
                  width={140}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="stars" fill="#333333" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Language Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            <ChartSection title="Repositories by Language">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={languages.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="language"
                    stroke="#666666"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis stroke="#666666" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Repository Count" fill="#666666" />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Total Stars by Language">
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={languages.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    dataKey="language"
                    stroke="#666666"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis stroke="#666666" />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="total_stars"
                    name="Total Stars"
                    fill="#999999"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          </div>

          {/* Author Leaderboard */}
          <ChartSection title="Top Authors by Total Downloads">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={authors}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  dataKey="author"
                  stroke="#666666"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis stroke="#666666" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total_downloads" fill="#222222" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>

          {/* Tags & Topics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ChartSection title="Popular Model Tags">
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, idx) => (
                  <span
                    key={`tag-${idx}-${tag.tag}`}
                    className="px-3 py-2 border border-stone-border bg-white text-xs text-charcoal tracking-wide"
                    style={{
                      fontSize: Math.max(10, Math.min(16, 10 + tag.count / 5)),
                    }}
                  >
                    {tag.tag} ({tag.count})
                  </span>
                ))}
              </div>
            </ChartSection>

            <ChartSection title="Popular Repo Topics">
              <div className="flex flex-wrap gap-2">
                {topics.map((topic, idx) => (
                  <span
                    key={`topic-${idx}-${topic.tag}`}
                    className="px-3 py-2 border border-stone-border bg-white text-xs text-charcoal tracking-wide"
                    style={{
                      fontSize: Math.max(
                        10,
                        Math.min(16, 10 + topic.count / 5),
                      ),
                    }}
                  >
                    {topic.tag} ({topic.count})
                  </span>
                ))}
              </div>
            </ChartSection>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-border mt-12 sm:mt-20 bg-cream">
        <div className="px-6 sm:px-12 py-8 sm:py-10">
          <div className="text-xs sm:text-sm text-stone font-light">
            <p className="mb-3">
              Analytics updated in real-time from curated RAG ecosystem data.
            </p>
            <p className="text-xs">© 2026 RAGnosis</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-border bg-white p-4 sm:p-6">
      <div className="text-xs sm:text-sm text-stone font-light uppercase tracking-wide mb-2">
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-medium text-charcoal tracking-tight">
        {value}
      </div>
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-12 border border-stone-border bg-white p-6 sm:p-8">
      <h2 className="text-sm sm:text-base font-normal text-charcoal uppercase tracking-[0.15em] mb-6">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number | string;
  }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm">
        {payload.map((entry, index: number) => (
          <div key={index} className="text-xs text-charcoal mb-1">
            <span className="font-medium">{entry.name}: </span>
            <span className="font-light">
              {typeof entry.value === "number"
                ? entry.value.toLocaleString()
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function renderPieLabel(entry: { category: string }) {
  return `${entry.category}`;
}

function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}
