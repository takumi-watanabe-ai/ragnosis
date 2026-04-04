"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  getTrendsTimeSeries,
  type TrendsTimeSeries,
} from "@/lib/trends-analysis";
import {
  getTaskAnalysis,
  getTopicAnalysis,
  type TaskAnalysis,
  type TopicAnalysis,
} from "@/lib/market-analysis";
import { TrendsChart } from "@/app/market/components/TrendsChart";
import { OpportunityAnalysis } from "@/app/market/components/OpportunityAnalysis";

export default function Home() {
  const [trendsData, setTrendsData] = useState<TrendsTimeSeries[]>([]);
  const [tasks, setTasks] = useState<TaskAnalysis[]>([]);
  const [topics, setTopics] = useState<TopicAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [showHero, setShowHero] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const trendsRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<HTMLDivElement>(null);
  const [trendsVisible, setTrendsVisible] = useState(false);
  const [positionVisible, setPositionVisible] = useState(false);

  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);

    // Staggered entrance animations
    setTimeout(() => setShowHero(true), 100);
    setTimeout(() => setShowQuestions(true), 600);

    async function loadData() {
      try {
        const [trendsData, taskData, topicData] = await Promise.all([
          getTrendsTimeSeries(),
          getTaskAnalysis(),
          getTopicAnalysis(),
        ]);
        setTrendsData(trendsData);
        setTasks(taskData);
        setTopics(topicData);
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Intersection observer for scroll-based animations
  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -100px 0px",
    };

    const trendsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setTrendsVisible(true);
        }
      });
    }, observerOptions);

    const positionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setPositionVisible(true);
        }
      });
    }, observerOptions);

    if (trendsRef.current) trendsObserver.observe(trendsRef.current);
    if (positionRef.current) positionObserver.observe(positionRef.current);

    return () => {
      trendsObserver.disconnect();
      positionObserver.disconnect();
    };
  }, [loading]);
  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="relative top-0 left-0 right-0 z-10 border-b border-stone-border bg-cream">
        <div className="px-6 sm:px-12 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="hover:opacity-70 transition-opacity">
              <span className="text-xs sm:text-sm font-light tracking-[0.2em] text-charcoal uppercase">
                RAGnosis
              </span>
            </Link>
            <div className="flex items-center gap-4 sm:gap-6">
              <Link
                href="/market"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase"
              >
                Market
              </Link>
              <Link
                href="/chat"
                className="text-xs sm:text-sm font-medium tracking-wide text-charcoal hover:opacity-70 transition-opacity uppercase"
              >
                Chat
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Logo */}
      <main className="relative px-6 sm:px-12">
        <div
          className={`py-16 sm:py-24 md:pb-16 md:pt-32 text-center transition-all duration-1000 ${
            showHero ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* Logo/Icon */}
          <div className="flex justify-center mb-8 sm:mb-12">
            <Image
              src="/logo.svg"
              alt="RAGnosis Logo"
              width={192}
              height={192}
              className="w-40 h-40 sm:w-48 sm:h-48 md:w-48 md:h-48"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="text-4xl font-medium tracking-tight text-charcoal mb-6 sm:mb-8 uppercase text-center">
            RAGnosis
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg md:text-xl text-charcoal mb-10 sm:mb-12 leading-relaxed max-w-2xl mx-auto font-light">
            Diagnose your RAG
          </p>

          {/* CTA */}
          <Link
            href="/chat"
            className="inline-block px-6 sm:px-8 py-3 text-xs sm:text-sm uppercase tracking-[0.15em] border-2 border-charcoal text-charcoal hover:bg-charcoal hover:text-cream transition-all font-normal"
          >
            Start Exploring
          </Link>
        </div>

        {/* Quick Examples */}
        <div
          className={`py-12 sm:py-16 border-t border-stone-border transition-all duration-700 ${
            showQuestions
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-12"
          }`}
        >
          <h2 className="text-sm sm:text-base font-normal text-center mb-8 sm:mb-10 text-charcoal uppercase tracking-[0.15em]">
            Start Diagnosing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ExampleQuestion text="What are the top embedding models?" />
            <ExampleQuestion text="Most popular RAG frameworks on GitHub?" />
            <ExampleQuestion text="LangChain vs LlamaIndex?" />
            <ExampleQuestion text="What are the best reranking models?" />
            <ExampleQuestion text="How does RAG work?" />
            <ExampleQuestion text="What's trending in RAG right now?" />
          </div>
        </div>

        {/* Market Interest Over Time */}
        {!loading && trendsData.length > 0 && (
          <div
            ref={trendsRef}
            className={`py-12 sm:py-16 border-t border-stone-border transition-all duration-700 ${
              trendsVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-12"
            }`}
          >
            <div className="mb-8">
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-charcoal mb-2 uppercase">
                Market Interest Over Time
              </h2>
              <p className="text-xs sm:text-sm text-stone font-light">
                Search interest trends across RAG ecosystem keywords
              </p>
            </div>
            <TrendsChart
              trendsData={trendsData}
              isTouchDevice={isTouchDevice}
              maxTableRows={8}
            />
          </div>
        )}

        {/* Opportunity Analysis */}
        {!loading && tasks.length > 0 && topics.length > 0 && (
          <div
            ref={positionRef}
            className={`py-12 sm:py-16 border-t border-stone-border transition-all duration-700 ${
              positionVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-12"
            }`}
          >
            <div className="mb-8">
              <h2 className="text-xl sm:text-2xl font-medium tracking-tight text-charcoal mb-2 uppercase">
                Opportunity Analysis
              </h2>
              <p className="text-xs sm:text-sm text-stone font-light">
                Multi-dimensional scoring: market size, competition,
                concentration, success rate. Bubble size = Market size.
              </p>
            </div>
            <OpportunityAnalysis
              tasks={tasks}
              topics={topics}
              isTouchDevice={isTouchDevice}
            />
          </div>
        )}
      </main>

      {/* Subtle CTA */}
      <div className="text-center py-12 border-t border-stone-border/50 mt-12 sm:mt-20">
        <Link
          href="/market"
          className="inline-block px-8 py-3 border border-charcoal text-charcoal hover:bg-charcoal hover:text-cream transition-all text-sm font-semibold uppercase tracking-wider"
        >
          View Full Analysis
        </Link>
      </div>

      {/* Footer */}
      <footer className="relative border-t border-stone-border bg-cream">
        <div className="px-6 sm:px-12 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 sm:gap-8">
              <Link
                href="/market"
                className="text-xs uppercase tracking-wider text-charcoal hover:opacity-60 transition-opacity"
              >
                Market
              </Link>
              <Link
                href="/chat"
                className="text-xs uppercase tracking-wider text-charcoal hover:opacity-60 transition-opacity"
              >
                Chat
              </Link>
            </div>
            <div className="flex items-center gap-6 sm:gap-8">
              <a
                href="https://github.com/yourusername"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-wider text-charcoal hover:opacity-60 transition-opacity"
              >
                GitHub
              </a>
              <a
                href="https://linkedin.com/in/yourusername"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs uppercase tracking-wider text-charcoal hover:opacity-60 transition-opacity"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ExampleQuestion({ text }: { text: string }) {
  return (
    <Link
      href={`/chat?q=${encodeURIComponent(text)}`}
      className="block p-3 sm:p-4 border border-stone-border bg-white hover:bg-charcoal hover:text-cream hover:border-charcoal transition-all text-xs sm:text-sm text-charcoal font-light"
    >
      {text}
    </Link>
  );
}
