"use client";

import { useState } from "react";
import type { TaskAnalysis, TopicAnalysis } from "@/lib/market-analysis";
import { TaskOpportunityChart } from "./TaskOpportunityChart";
import { TopicOpportunityChart } from "./TopicOpportunityChart";
import { TabSwitch } from "./TabSwitch";

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
  const [activeTab, setActiveTab] = useState<Tab>("repo");

  return (
    <div>
      <TabSwitch activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "model" ? (
        <TaskOpportunityChart tasks={tasks} isTouchDevice={isTouchDevice} />
      ) : (
        <TopicOpportunityChart topics={topics} isTouchDevice={isTouchDevice} />
      )}
    </div>
  );
}
