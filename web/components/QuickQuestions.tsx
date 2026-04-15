"use client";

import { useState } from "react";
import { quickQuestions, categories } from "@/lib/quick-questions";
import { ChevronDown } from "lucide-react";

interface QuickQuestionsProps {
  onSelectQuestion: (question: string) => void;
}

export function QuickQuestions({ onSelectQuestion }: QuickQuestionsProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toggleCategory = (categoryId: string) => {
    setActiveCategory(activeCategory === categoryId ? null : categoryId);
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="text-xs font-normal text-stone mb-4 uppercase tracking-[0.15em]">
        Quick Questions
      </div>
      {categories.map((category) => {
        const categoryQuestions = quickQuestions.filter(
          (q) => q.category === category.id,
        );
        const isActive = activeCategory === category.id;

        return (
          <div
            key={category.id}
            className="border-b border-stone-border last:border-0 pb-2"
          >
            <button
              onClick={() => toggleCategory(category.id)}
              className="flex items-center justify-between w-full py-2.5 px-2 text-left text-[11px] font-normal text-charcoal hover:bg-cream transition-colors uppercase tracking-wide"
            >
              <span className="flex items-center gap-2">
                <category.icon className="h-4 w-4 text-charcoal" />
                <span>{category.label}</span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 text-stone transition-transform ${
                  isActive ? "rotate-180" : ""
                }`}
              />
            </button>
            {isActive && (
              <div className="pt-2 pb-3 space-y-1.5">
                {categoryQuestions.map((question) => (
                  <button
                    key={question.id}
                    onClick={() => onSelectQuestion(question.text)}
                    className="block w-full text-left px-3 py-2.5 text-xs text-charcoal hover:bg-charcoal hover:text-cream transition-all leading-relaxed font-light"
                  >
                    {question.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
