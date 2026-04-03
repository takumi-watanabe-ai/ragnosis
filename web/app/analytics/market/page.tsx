"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getLanguageCategoryMatrix,
  getAuthorConcentration,
  getTaskAnalysis,
  getTopicAnalysis,
  getModelCompetitivePosition,
  getTechStackPatterns,
  type LanguageCategoryMatrix,
  type AuthorConcentration,
  type TaskAnalysis,
  type TopicAnalysis,
  type ModelCompetitivePosition,
  type TechStackPattern,
} from "@/lib/market-analysis";
import {
  getTrendsTimeSeries,
  type TrendsTimeSeries,
} from "@/lib/trends-analysis";
import { Section } from "./components/Section";
import { TrendsChart } from "./components/TrendsChart";
import { OpportunityAnalysis } from "./components/OpportunityAnalysis";
import { ModelPositionChart } from "./components/ModelPositionChart";
import { LanguageCategoryHeatmap } from "./components/LanguageCategoryHeatmap";
import { AuthorMarketControlChart } from "./components/AuthorMarketControlChart";
import { TechStackPatternsChart } from "./components/TechStackPatternsChart";

export default function MarketAnalyticsPage() {
  const [langMatrix, setLangMatrix] = useState<LanguageCategoryMatrix[]>([]);
  const [authors, setAuthors] = useState<AuthorConcentration[]>([]);
  const [tasks, setTasks] = useState<TaskAnalysis[]>([]);
  const [topics, setTopics] = useState<TopicAnalysis[]>([]);
  const [modelPositions, setModelPositions] = useState<
    ModelCompetitivePosition[]
  >([]);
  const [stackPatterns, setStackPatterns] = useState<TechStackPattern[]>([]);
  const [trendsData, setTrendsData] = useState<TrendsTimeSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // Detect touch device
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);

    async function loadData() {
      try {
        const [
          matrixData,
          authorData,
          taskData,
          topicData,
          modelPosData,
          stackData,
          trendsData,
        ] = await Promise.all([
          getLanguageCategoryMatrix(),
          getAuthorConcentration(),
          getTaskAnalysis(),
          getTopicAnalysis(),
          getModelCompetitivePosition(),
          getTechStackPatterns(),
          getTrendsTimeSeries(),
        ]);

        setLangMatrix(matrixData);
        setAuthors(authorData);
        setTasks(taskData);
        setTopics(topicData);
        setModelPositions(modelPosData);
        setStackPatterns(stackData);
        setTrendsData(trendsData);
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
      <main className="px-2 sm:px-12 py-8 sm:py-12">
        <div className="w-full">
          {/* Title */}
          <div className="mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl font-medium tracking-tight text-charcoal mb-3 uppercase">
              RAG Ecosystem Market Structure
            </h1>
            <p className="text-sm sm:text-base text-stone font-light">
              Deep analysis of concentration, competition, and opportunities
            </p>
          </div>

          {/* Google Trends - All Keywords */}
          {trendsData.length > 0 && (
            <Section
              title="Market Interest Over Time"
              subtitle="Google Trends search interest by keyword - tracking RAG ecosystem momentum"
            >
              <TrendsChart trendsData={trendsData} />
            </Section>
          )}

          {/* Opportunity Analysis */}
          <Section
            title="Opportunity Analysis"
            subtitle="Multi-dimensional scoring: market size, competition, concentration, success rate"
          >
            <OpportunityAnalysis
              tasks={tasks}
              topics={topics}
              isTouchDevice={isTouchDevice}
            />
          </Section>

          {/* Model Competitive Position Map */}
          <Section
            title="Model Competitive Position Map"
            subtitle="Quality Score (engagement ratio) vs Popularity (downloads). Bubble size = Likes."
          >
            <ModelPositionChart
              modelPositions={modelPositions}
              isTouchDevice={isTouchDevice}
            />
          </Section>

          {/* Language × Category Matrix */}
          <Section
            title="Language × Category Matrix"
            subtitle="Which languages dominate which categories?"
          >
            <LanguageCategoryHeatmap langMatrix={langMatrix} />
          </Section>

          {/* Author Market Control */}
          <Section
            title="Author Market Control"
            subtitle="Top 10 authors by market share - concentration risk analysis"
          >
            <AuthorMarketControlChart authors={authors} />
          </Section>

          {/* Technology Stack Patterns */}
          <Section
            title="Technology Stack Patterns"
            subtitle="Which technologies are commonly used together? (Top topic pairs)"
          >
            <TechStackPatternsChart stackPatterns={stackPatterns} />
          </Section>
        </div>
      </main>
    </div>
  );
}
