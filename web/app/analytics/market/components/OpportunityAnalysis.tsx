"use client";

import { useState } from "react";
import type { TaskAnalysis, TopicAnalysis } from "@/lib/market-analysis";
import { TaskOpportunityChart } from "./TaskOpportunityChart";
import { TopicOpportunityChart } from "./TopicOpportunityChart";

interface OpportunityAnalysisProps {
  tasks: TaskAnalysis[];
  topics: TopicAnalysis[];
  isTouchDevice: boolean;
}

type Tab = "model" | "repo";

export function OpportunityAnalysis({
  tasks,
  topics,
  isTouchDevice,
}: OpportunityAnalysisProps) {
  const [activeTab, setActiveTab] = useState<Tab>("model");

  return (
    <div>
      <div className="flex items-center gap-6 mb-6">
        <button
          onClick={() => setActiveTab("model")}
          className={`text-sm font-medium tracking-wide uppercase transition-colors ${
            activeTab === "model"
              ? "text-charcoal"
              : "text-stone hover:text-charcoal"
          }`}
        >
          <span className="flex items-center gap-2">
            {activeTab === "model" && (
              <span className="w-2 h-2 rounded-full bg-charcoal" />
            )}
            Model
          </span>
        </button>
        <button
          onClick={() => setActiveTab("repo")}
          className={`text-sm font-medium tracking-wide uppercase transition-colors ${
            activeTab === "repo"
              ? "text-charcoal"
              : "text-stone hover:text-charcoal"
          }`}
        >
          <span className="flex items-center gap-2">
            {activeTab === "repo" && (
              <span className="w-2 h-2 rounded-full bg-charcoal" />
            )}
            Repo
          </span>
        </button>
      </div>

      {activeTab === "model" ? (
        <TaskOpportunityChart tasks={tasks} isTouchDevice={isTouchDevice} />
      ) : (
        <TopicOpportunityChart topics={topics} isTouchDevice={isTouchDevice} />
      )}
    </div>
  );
}
