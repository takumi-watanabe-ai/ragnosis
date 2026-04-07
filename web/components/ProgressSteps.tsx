"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ProgressStep {
  step: string;
  message: string;
  data?: Record<string, unknown>;
}

interface ProgressStepsProps {
  steps: ProgressStep[];
  isStreaming?: boolean;
}

export function ProgressSteps({ steps, isStreaming }: ProgressStepsProps) {
  const [expanded, setExpanded] = useState(true);

  if (!steps || steps.length === 0) return null;

  const totalSteps = steps.length + (isStreaming ? 1 : 0);

  return (
    <div className="mb-4 border border-stone-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-normal text-charcoal">
            Thought Process
          </span>
          <span className="text-xs text-stone/60 font-mono">
            {totalSteps} {totalSteps === 1 ? "step" : "steps"}
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-stone" />
        ) : (
          <ChevronDown className="w-4 h-4 text-stone" />
        )}
      </button>

      {/* Steps */}
      {expanded && (
        <div className="px-4 py-3 space-y-2.5 text-xs bg-white">
          {steps.map((step, index) => {
            // Check if message contains newlines (multi-line content like query variations)
            const hasMultipleLines = step.message.includes("\n");

            return (
              <div key={index} className="flex items-start gap-2">
                {/* Step indicator */}
                <span className="text-stone-400 mt-0.5 flex-shrink-0">→</span>

                {/* Step content */}
                <div className="flex-1 min-w-0">
                  {hasMultipleLines ? (
                    // Multi-line content (like query variations)
                    <div className="space-y-1">
                      {step.message.split("\n").map((line, lineIndex) => {
                        // First line is the main message
                        if (lineIndex === 0) {
                          return (
                            <div
                              key={lineIndex}
                              className="text-stone-700 font-normal"
                            >
                              {line}
                            </div>
                          );
                        }
                        // Subsequent lines are indented details
                        return (
                          <div
                            key={lineIndex}
                            className="pl-3 text-stone-600 font-mono text-[11px] leading-relaxed"
                          >
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Single-line content
                    <div className="text-stone-700 font-light leading-relaxed">
                      {step.message}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isStreaming && (
            <div className="flex items-start gap-2">
              <span className="text-stone-400 mt-0.5 flex-shrink-0">→</span>
              <div className="flex-1 text-stone-500 font-light leading-relaxed animate-pulse">
                Streaming response...
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
