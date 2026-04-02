"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import {
  getCategoryConcentration,
  getLanguageCategoryMatrix,
  getAuthorConcentration,
  getTaskAnalysis,
  getRepoLanguageConcentration,
  getModelCompetitivePosition,
  getTechStackPatterns,
  type CategoryConcentration,
  type LanguageCategoryMatrix,
  type AuthorConcentration,
  type TaskAnalysis,
  type RepoLanguageConcentration,
  type ModelCompetitivePosition,
  type TechStackPattern,
} from "@/lib/market-analysis";

function getTaskColor(task: TaskAnalysis): string {
  // Classify based on position: competition vs success
  const highCompetition = task.model_count > 30;
  const highSuccess = task.avg_downloads > 500000;

  if (!highCompetition && highSuccess) return "#2e8b57"; // Low competition, high success = opportunity (green)
  if (highCompetition && highSuccess) return "#4682b4"; // High competition, high success = healthy market (blue)
  if (highCompetition && !highSuccess) return "#8b0000"; // High competition, low success = saturated (red)
  return "#d2691e"; // Low competition, low success = emerging (orange)
}

export default function MarketAnalyticsPage() {
  const [concentration, setConcentration] = useState<CategoryConcentration[]>(
    [],
  );
  const [langMatrix, setLangMatrix] = useState<LanguageCategoryMatrix[]>([]);
  const [authors, setAuthors] = useState<AuthorConcentration[]>([]);
  const [tasks, setTasks] = useState<TaskAnalysis[]>([]);
  const [repoLangConc, setRepoLangConc] = useState<RepoLanguageConcentration[]>(
    [],
  );
  const [modelPositions, setModelPositions] = useState<
    ModelCompetitivePosition[]
  >([]);
  const [stackPatterns, setStackPatterns] = useState<TechStackPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [
          concData,
          matrixData,
          authorData,
          taskData,
          repoLangData,
          modelPosData,
          stackData,
        ] = await Promise.all([
          getCategoryConcentration(),
          getLanguageCategoryMatrix(),
          getAuthorConcentration(),
          getTaskAnalysis(),
          getRepoLanguageConcentration(),
          getModelCompetitivePosition(),
          getTechStackPatterns(),
        ]);

        setConcentration(concData);
        setLangMatrix(matrixData);
        setAuthors(authorData);
        setTasks(taskData);
        setRepoLangConc(repoLangData);
        setModelPositions(modelPosData);
        setStackPatterns(stackData);
      } catch (err) {
        console.error("Error loading market analysis:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load market data",
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
          Loading market analysis...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="text-charcoal text-sm tracking-wide mb-4 uppercase">
            Error
          </div>
          <div className="text-stone text-xs font-light">{error}</div>
        </div>
      </div>
    );
  }

  // Prepare data for visualizations
  const langCategoryHeatmap = prepareLangCategoryHeatmap(langMatrix);
  const authorMarketData = authors.slice(0, 10);

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
                className="text-xs sm:text-sm font-medium tracking-wide text-stone hover:opacity-70 transition-opacity uppercase"
              >
                Basic
              </Link>
              <Link
                href="/analytics/market"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase border-b-2 border-charcoal"
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
              RAG Ecosystem Market Structure
            </h1>
            <p className="text-sm sm:text-base text-stone font-light">
              Deep analysis of concentration, competition, and opportunities
            </p>
          </div>

          {/* Market Concentration Overview */}
          <Section
            title="Category Market Concentration"
            subtitle="How dominated is each category? Higher % = winner-takes-all market"
          >
            <div className="space-y-6">
              {concentration.map((cat) => (
                <ConcentrationBar
                  key={cat.category}
                  category={cat.category}
                  top3Share={cat.top3_share}
                  top10Share={cat.top10_share}
                  totalModels={cat.total_models}
                />
              ))}
            </div>
            <div className="mt-8 p-4 border border-stone-border bg-white">
              <div className="text-xs text-charcoal font-light leading-relaxed">
                <span className="font-medium">Insight:</span> Embedding shows
                moderate concentration (top 3 = {concentration[0]?.top3_share}
                %), suggesting room for innovation. Reranking is more
                concentrated (
                {
                  concentration.find((c) => c.category === "reranking")
                    ?.top3_share
                }
                %), indicating established winners.
              </div>
            </div>
          </Section>

          {/* Task Opportunity Analysis */}
          <Section
            title="Task Opportunity Analysis"
            subtitle="Multi-dimensional scoring: market size, competition, concentration, success rate"
          >
            <ResponsiveContainer width="100%" height={450}>
              <ScatterChart
                margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  type="number"
                  dataKey="model_count"
                  name="Competition"
                  stroke="#666666"
                  label={{
                    value: "Number of Models (Competition) →",
                    position: "bottom",
                    offset: 40,
                    style: { fontSize: 12, fill: "#666666" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="avg_downloads"
                  name="Avg Success"
                  stroke="#666666"
                  domain={[
                    0,
                    (dataMax: number) => Math.ceil(dataMax / 10) * 10,
                  ]}
                  tickFormatter={(value) =>
                    value >= 1000000
                      ? `${(value / 1000000).toFixed(0)}M`
                      : value >= 1000
                        ? `${(value / 1000).toFixed(0)}K`
                        : value.toString()
                  }
                  label={{
                    value: "Avg Downloads per Model →",
                    angle: -90,
                    position: "insideLeft",
                    offset: -10,
                    style: {
                      fontSize: 12,
                      fill: "#666666",
                      textAnchor: "middle",
                    },
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="total_downloads"
                  range={[100, 2000]}
                  name="Market Size"
                />
                <Tooltip
                  content={<TaskTooltip />}
                  cursor={{ strokeDasharray: "3 3" }}
                  wrapperStyle={{ pointerEvents: "auto" }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  animationDuration={0}
                />
                <Scatter data={tasks} fill="#222222">
                  {tasks.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getTaskColor(entry)}
                      opacity={0.7}
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-stone-border bg-white">
                <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
                  Opportunity Score Factors
                </div>
                <div className="text-xs text-stone font-light space-y-1">
                  <div>• Market Size (35%): Total downloads</div>
                  <div>• Low Competition (25%): Fewer models</div>
                  <div>• Avg Success (25%): Downloads per model</div>
                  <div>• Low Concentration (15%): Fair distribution</div>
                </div>
              </div>
              <div className="p-4 border border-stone-border bg-white">
                <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
                  Color Guide
                </div>
                <div className="text-xs text-stone font-light space-y-1">
                  <div>
                    •{" "}
                    <span style={{ color: "#2e8b57" }} className="font-medium">
                      Green
                    </span>
                    : Low competition + High success = Opportunity
                  </div>
                  <div>
                    •{" "}
                    <span style={{ color: "#4682b4" }} className="font-medium">
                      Blue
                    </span>
                    : High competition + High success = Healthy market
                  </div>
                  <div>
                    •{" "}
                    <span style={{ color: "#8b0000" }} className="font-medium">
                      Red
                    </span>
                    : High competition + Low success = Saturated
                  </div>
                  <div>
                    •{" "}
                    <span style={{ color: "#d2691e" }} className="font-medium">
                      Orange
                    </span>
                    : Low competition + Low success = Emerging/Niche
                  </div>
                  <div className="pt-1">
                    • Bubble size = Market size (total downloads)
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Model Competitive Position Map */}
          <Section
            title="Model Competitive Position Map"
            subtitle="Quality Score (engagement ratio) vs Popularity (downloads). Bubble size = Likes."
          >
            <ResponsiveContainer width="100%" height={500}>
              <ScatterChart
                margin={{ top: 20, right: 30, bottom: 60, left: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  type="number"
                  dataKey="downloads"
                  name="Downloads"
                  scale="log"
                  domain={["dataMin", "dataMax"]}
                  stroke="#666666"
                  tickFormatter={(value) =>
                    value >= 1000000
                      ? `${(value / 1000000).toFixed(0)}M`
                      : `${(value / 1000).toFixed(0)}K`
                  }
                  label={{
                    value: "Downloads (Popularity) →",
                    position: "bottom",
                    offset: 40,
                    style: { fontSize: 12, fill: "#666666" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="quality_ratio"
                  name="Quality"
                  stroke="#666666"
                  domain={[
                    0,
                    (dataMax: number) => Math.ceil(dataMax / 10) * 10,
                  ]}
                  label={{
                    value: "Quality Score (log-scaled engagement) →",
                    angle: -90,
                    position: "insideLeft",
                    offset: -10,
                    style: {
                      fontSize: 12,
                      fill: "#666666",
                      textAnchor: "middle",
                    },
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="likes"
                  range={[80, 500]}
                  name="Likes"
                />
                <Tooltip
                  content={<ModelPositionTooltip />}
                  cursor={{ strokeDasharray: "3 3" }}
                  wrapperStyle={{ pointerEvents: "auto" }}
                  allowEscapeViewBox={{ x: true, y: true }}
                  animationDuration={0}
                />
                <Scatter data={modelPositions} fill="#222222">
                  {modelPositions.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={getCategoryColor(entry.category)}
                      opacity={0.7}
                      stroke="transparent"
                      strokeWidth={10}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-stone-border bg-white">
                <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
                  Quadrants
                </div>
                <div className="text-xs text-stone font-light space-y-1">
                  <div>
                    <span className="font-medium">Top-right:</span> Quality
                    Leaders - Popular + High engagement
                  </div>
                  <div>
                    <span className="font-medium">Bottom-right:</span> Popular
                    Mainstream - Scale without exceptional quality
                  </div>
                  <div>
                    <span className="font-medium">Top-left:</span> Hidden Gems -
                    High quality, underrated
                  </div>
                  <div>
                    <span className="font-medium">Bottom-left:</span> Emerging -
                    New or struggling
                  </div>
                </div>
              </div>
              <div className="p-4 border border-stone-border bg-white">
                <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
                  Task Categories
                </div>
                <div className="text-xs text-stone font-light space-y-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3"
                      style={{ backgroundColor: "#2e8b57" }}
                    />
                    <span>Embedding</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3"
                      style={{ backgroundColor: "#4682b4" }}
                    />
                    <span>Reranking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3"
                      style={{ backgroundColor: "#d2691e" }}
                    />
                    <span>Generation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3"
                      style={{ backgroundColor: "#c75b9b" }}
                    />
                    <span>Classification</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3"
                      style={{ backgroundColor: "#999999" }}
                    />
                    <span>Other</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* Language-Category Matrix */}
          <Section
            title="Language × Category Matrix"
            subtitle="Which languages dominate which categories?"
          >
            <LanguageCategoryHeatmap data={langCategoryHeatmap} />
          </Section>

          {/* Author Market Control */}
          <Section
            title="Author Market Control"
            subtitle="Top 10 authors by market share - concentration risk analysis"
          >
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={authorMarketData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis
                  type="number"
                  stroke="#666666"
                  label={{
                    value: "Market Share %",
                    position: "bottom",
                    style: { fontSize: 12, fill: "#666666" },
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="author"
                  stroke="#666666"
                  tick={{ fontSize: 11 }}
                  width={110}
                />
                <Tooltip content={<AuthorTooltip />} />
                <Bar dataKey="market_share" fill="#222222" />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-6 p-4 border border-stone-border bg-white">
              <div className="text-xs text-charcoal font-light leading-relaxed">
                <span className="font-medium">Concentration Risk:</span> Top 10
                authors control{" "}
                {authors
                  .slice(0, 10)
                  .reduce((sum, a) => sum + a.market_share, 0)
                  .toFixed(1)}
                % of total downloads. Ecosystem health depends on these key
                players.
              </div>
            </div>
          </Section>

          {/* Technology Stack Patterns */}
          <Section
            title="Technology Stack Patterns"
            subtitle="Which technologies are commonly used together? (Top topic pairs)"
          >
            <div className="space-y-3">
              {stackPatterns.slice(0, 15).map((pattern, idx) => (
                <div
                  key={`${pattern.topic1}-${pattern.topic2}`}
                  className="flex items-center justify-between p-3 border border-stone-border bg-white"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="text-xs text-stone font-light">
                      #{idx + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-charcoal font-medium">
                        {pattern.topic1}
                      </span>
                      <span className="text-stone">+</span>
                      <span className="text-sm text-charcoal font-medium">
                        {pattern.topic2}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-stone font-light">
                    <div>
                      <span className="font-medium text-charcoal">
                        {pattern.co_occurrence_count}
                      </span>{" "}
                      repos
                    </div>
                    <div>
                      <span className="font-medium text-charcoal">
                        {pattern.correlation_strength.toFixed(1)}%
                      </span>{" "}
                      correlation
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 border border-stone-border bg-white">
              <div className="text-xs text-charcoal font-light leading-relaxed">
                <span className="font-medium">Insight:</span> Most common
                pairing is{" "}
                <span className="font-medium">
                  {stackPatterns[0]?.topic1} + {stackPatterns[0]?.topic2}
                </span>{" "}
                ({stackPatterns[0]?.co_occurrence_count} repos). High
                correlation = technologies that work well together.
              </div>
            </div>
          </Section>

          {/* Repo Language Concentration */}
          <Section
            title="Repository Language Concentration"
            subtitle="Which languages show winner-takes-all dynamics?"
          >
            <div className="space-y-4">
              {repoLangConc.slice(0, 8).map((lang) => (
                <LanguageConcentrationBar
                  key={lang.language}
                  language={lang.language}
                  top3Share={lang.top3_share}
                  totalRepos={lang.total_repos}
                  totalStars={lang.total_stars}
                />
              ))}
            </div>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-12 border border-stone-border bg-white p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-sm sm:text-base font-normal text-charcoal uppercase tracking-[0.15em] mb-2">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-stone font-light">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ConcentrationBar({
  category,
  top3Share,
  top10Share,
  totalModels,
}: {
  category: string;
  top3Share: number;
  top10Share: number;
  totalModels: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-charcoal uppercase tracking-wide">
          {category}
        </span>
        <span className="text-xs text-stone font-light">
          {totalModels} models
        </span>
      </div>
      <div className="relative h-8 bg-stone-border/20">
        <div
          className="absolute inset-y-0 left-0 bg-charcoal/80"
          style={{ width: `${top10Share}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-charcoal"
          style={{ width: `${top3Share}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <span className="text-xs text-cream font-medium z-10">
            Top 3: {top3Share.toFixed(1)}%
          </span>
          <span className="text-xs text-charcoal font-light">
            Top 10: {top10Share.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function LanguageConcentrationBar({
  language,
  top3Share,
  totalRepos,
  totalStars,
}: {
  language: string;
  top3Share: number;
  totalRepos: number;
  totalStars: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-charcoal uppercase tracking-wide">
          {language}
        </span>
        <span className="text-xs text-stone font-light">
          {totalRepos} repos • {(totalStars / 1000).toFixed(0)}K stars
        </span>
      </div>
      <div className="relative h-6 bg-stone-border/20">
        <div
          className="absolute inset-y-0 left-0 bg-stone"
          style={{ width: `${top3Share}%` }}
        />
        <div className="absolute inset-0 flex items-center px-3">
          <span className="text-xs text-cream font-medium">
            Top 3 repos: {top3Share.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function LanguageCategoryHeatmap({
  data,
}: {
  data: Array<{
    language: string;
    categories: Array<{ name: string; count: number }>;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {data.map((lang) => (
          <div key={lang.language} className="mb-4">
            <div className="text-xs text-charcoal uppercase tracking-wide mb-2">
              {lang.language}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {lang.categories.map((cat) => (
                <div
                  key={cat.name}
                  className="p-3 border border-stone-border text-center flex-shrink-0"
                  style={{
                    width: "140px",
                    backgroundColor: `rgba(34, 34, 34, ${Math.min(cat.count / 50, 1) * 0.8})`,
                  }}
                >
                  <div
                    className="text-xs uppercase tracking-wide"
                    style={{
                      color: cat.count > 25 ? "#ffffff" : "#222222",
                    }}
                  >
                    {cat.name}
                  </div>
                  <div
                    className="text-xs font-light"
                    style={{
                      color: cat.count > 25 ? "#ffffff" : "#666666",
                    }}
                  >
                    {cat.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TooltipPayload {
  payload: TaskAnalysis;
}

function TaskTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.task}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Models: {data.model_count}</div>
          <div>
            Market Size: {(data.total_downloads / 1000000).toFixed(1)}M
            downloads
          </div>
          <div>Avg per Model: {(data.avg_downloads / 1000).toFixed(0)}K</div>
          <div>Median: {(data.median_downloads / 1000).toFixed(0)}K</div>
          <div>Top 3 Control: {data.top3_share.toFixed(1)}%</div>
          <div
            className="pt-1 font-medium"
            style={{ color: getTaskColor(data) }}
          >
            Opportunity Score: {data.opportunity_score.toFixed(1)}
          </div>
        </div>
      </div>
    );
  }
  return null;
}

interface AuthorTooltipPayload {
  payload: AuthorConcentration;
}

function AuthorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: AuthorTooltipPayload[];
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.author}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Models: {data.model_count}</div>
          <div>Downloads: {data.total_downloads.toLocaleString()}</div>
          <div>Market Share: {data.market_share}%</div>
          <div>Categories: {data.categories.join(", ")}</div>
        </div>
      </div>
    );
  }
  return null;
}

function prepareLangCategoryHeatmap(matrix: LanguageCategoryMatrix[]) {
  const categories = Array.from(new Set(matrix.map((m) => m.category)));

  // Build language data with categories
  const languages = Array.from(new Set(matrix.map((m) => m.language)));
  const langData = languages.map((lang) => {
    const langCategories = categories
      .map((cat) => {
        const entry = matrix.find(
          (m) => m.language === lang && m.category === cat,
        );
        return {
          name: cat,
          count: entry?.repo_count || 0,
        };
      })
      .filter((cat) => cat.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      language: lang,
      categories: langCategories,
      topCategoryCount: langCategories[0]?.count || 0,
    };
  });

  // Sort by top category count (highest first)
  return langData
    .sort((a, b) => b.topCategoryCount - a.topCategoryCount)
    .map(({ language, categories }) => ({ language, categories }));
}

function getCategoryColor(category: string): string {
  if (!category) return "#999999";

  const cat = category.toLowerCase();

  // Embedding models
  if (
    cat.includes("feature-extraction") ||
    cat.includes("sentence-similarity") ||
    cat.includes("embedding")
  ) {
    return "#2e8b57"; // Green
  }

  // Reranking models
  if (
    cat.includes("rerank") ||
    cat.includes("text-ranking") ||
    cat.includes("cross-encoder")
  ) {
    return "#4682b4"; // Blue
  }

  // Generation models
  if (
    cat.includes("text-generation") ||
    cat.includes("text2text") ||
    cat.includes("summarization") ||
    cat.includes("translation")
  ) {
    return "#d2691e"; // Orange
  }

  // Question Answering
  if (cat.includes("question-answering") || cat.includes("qa")) {
    return "#8b4789"; // Purple
  }

  // Fill mask / Masked LM
  if (cat.includes("fill-mask") || cat.includes("masked")) {
    return "#c77e3c"; // Light brown
  }

  // Zero-shot / Classification
  if (cat.includes("zero-shot") || cat.includes("classification")) {
    return "#c75b9b"; // Magenta
  }

  // Token classification / NER
  if (cat.includes("token-classification") || cat.includes("ner")) {
    return "#8fbc8f"; // Light green
  }

  // Other / Unknown
  return "#999999"; // Gray
}

interface ModelPositionTooltipPayload {
  payload: ModelCompetitivePosition;
}

function ModelPositionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ModelPositionTooltipPayload[];
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal uppercase tracking-wide mb-2 font-medium">
          {data.model_name}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div>Category: {data.category}</div>
          <div>Author: {data.author}</div>
          <div>Downloads: {(data.downloads / 1000000).toFixed(1)}M</div>
          <div>Likes: {data.likes.toLocaleString()}</div>
          <div>Quality Score: {data.quality_ratio.toFixed(1)}</div>
          <div>Market Share: {data.market_share.toFixed(1)}%</div>
          <div>Rank: #{data.ranking_position}</div>
        </div>
      </div>
    );
  }
  return null;
}
