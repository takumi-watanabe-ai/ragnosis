"use client";

import { useState } from "react";
import type {
  ModelCompetitivePosition,
  RepoCompetitivePosition,
} from "@/lib/market-analysis";
import { ModelPositionChart } from "./ModelPositionChart";
import { RepoPositionChart } from "./RepoPositionChart";
import { TabSwitch } from "./TabSwitch";

interface CompetitivePositionAnalysisProps {
  modelPositions: ModelCompetitivePosition[];
  repoPositions: RepoCompetitivePosition[];
  isTouchDevice: boolean;
}

type Tab = "model" | "repo";

export function CompetitivePositionAnalysis({
  modelPositions,
  repoPositions,
  isTouchDevice,
}: CompetitivePositionAnalysisProps) {
  const [activeTab, setActiveTab] = useState<Tab>("repo");

  return (
    <div>
      <TabSwitch activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "model" ? (
        <ModelPositionChart
          modelPositions={modelPositions}
          isTouchDevice={isTouchDevice}
        />
      ) : (
        <RepoPositionChart
          repoPositions={repoPositions}
          isTouchDevice={isTouchDevice}
        />
      )}
    </div>
  );
}
