interface RagFlowTabSwitchProps {
  activeTab: "model" | "repo";
  onTabChange: (tab: "model" | "repo") => void;
}

export function RagFlowTabSwitch({
  activeTab,
  onTabChange,
}: RagFlowTabSwitchProps) {
  return (
    <div className="inline-flex items-center bg-white border border-stone-border mb-6">
      <button
        onClick={() => onTabChange("repo")}
        className={`px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-all ${
          activeTab === "repo"
            ? "bg-charcoal text-cream"
            : "bg-transparent text-stone hover:text-charcoal"
        }`}
      >
        Repo
      </button>
      <button
        onClick={() => onTabChange("model")}
        className={`px-4 py-1.5 text-xs font-medium tracking-wide uppercase transition-all ${
          activeTab === "model"
            ? "bg-charcoal text-cream"
            : "bg-transparent text-stone hover:text-charcoal"
        }`}
      >
        Model
      </button>
    </div>
  );
}
