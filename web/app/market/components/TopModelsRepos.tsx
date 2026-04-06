"use client";

import { useState } from "react";
import { HorizontalBarChart } from "@/app/components/charts/HorizontalBarChart";
import { RagFlowTabSwitch } from "./RagFlowTabSwitch";
import type { ModelData, RepoData } from "@/lib/analytics";

interface TopModelsReposProps {
  topModels: ModelData[];
  topRepos: RepoData[];
}

export function TopModelsRepos({ topModels, topRepos }: TopModelsReposProps) {
  const [activeTab, setActiveTab] = useState<"model" | "repo">("repo");

  if (topModels.length === 0 && topRepos.length === 0) {
    return null;
  }

  return (
    <div>
      <RagFlowTabSwitch activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "repo" ? (
        <HorizontalBarChart
          data={topRepos}
          dataKey="stars"
          labelKey="repo_name"
          barColor="#666666"
          height={400}
        />
      ) : (
        <HorizontalBarChart
          data={topModels}
          dataKey="downloads"
          labelKey="model_name"
          barColor="#999999"
          height={400}
        />
      )}
    </div>
  );
}
