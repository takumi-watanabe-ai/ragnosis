import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { CategoryData } from "@/lib/analytics";

// Format category names from kebab-case to Title Case
function formatCategoryName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Muted, brand-aligned color palette
const COLORS = {
  primary: [
    "#222222", // dark charcoal
    "#444444", // dark gray
    "#666666", // medium gray
    "#888888", // gray
    "#aaaaaa", // light gray
    "#cccccc", // lighter gray
    "#333333", // charcoal
    "#555555", // medium dark gray
    "#999999", // medium light gray
  ],
};

/**
 * Group smaller categories into "Other" for cleaner pie charts
 * @param categories - Array of category data
 * @param topN - Number of top categories to keep (default: 8)
 * @returns Grouped categories with "Other" at the end if applicable
 */
function groupSmallCategories(
  categories: CategoryData[],
  topN: number = 8,
): CategoryData[] {
  // Merge all unknown/other variants into "Other"
  const mergedCategories = categories.reduce((acc, cat) => {
    const key =
      cat.category.toLowerCase() === "unknown" ||
      cat.category.toLowerCase() === "other"
        ? "Other"
        : cat.category;

    const existing = acc.find((c) => c.category === key);
    if (existing) {
      existing.count += cat.count;
      existing.total_downloads += cat.total_downloads;
    } else {
      acc.push({ ...cat, category: key });
    }
    return acc;
  }, [] as CategoryData[]);

  if (mergedCategories.length <= topN) return mergedCategories;

  // Sort by count descending
  const sorted = [...mergedCategories].sort((a, b) => b.count - a.count);

  // Separate "Other" if it exists
  const otherIndex = sorted.findIndex((c) => c.category === "Other");
  const otherCategory =
    otherIndex >= 0 ? sorted.splice(otherIndex, 1)[0] : null;

  // Take top N (excluding Other)
  const topCategories = sorted.slice(0, topN);

  // Add remaining to Other
  const remaining = sorted.slice(topN);
  if (remaining.length > 0 || otherCategory) {
    const otherCount = remaining.reduce(
      (sum, cat) => sum + cat.count,
      otherCategory?.count || 0,
    );
    const totalDownloads = remaining.reduce(
      (sum, cat) => sum + cat.total_downloads,
      otherCategory?.total_downloads || 0,
    );
    // Calculate weighted average of likes
    const totalWeightedLikes = remaining.reduce(
      (sum, cat) => sum + cat.avg_likes * cat.count,
      (otherCategory?.avg_likes || 0) * (otherCategory?.count || 0),
    );
    const avgLikes = otherCount > 0 ? totalWeightedLikes / otherCount : 0;

    topCategories.push({
      category: "Other",
      count: otherCount,
      total_downloads: totalDownloads,
      avg_likes: avgLikes,
    });
  }

  return topCategories;
}

function PieCategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    payload: CategoryData & { percentage?: string };
  }>;
}) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white border border-stone-border p-3 shadow-sm max-w-xs">
        <div className="text-xs text-charcoal font-medium mb-2 uppercase tracking-wide">
          {formatCategoryName(data.category)}
        </div>
        <div className="text-xs text-stone font-light space-y-1">
          <div className="flex justify-between gap-4">
            <span>Models:</span>
            <span className="font-medium text-charcoal">
              {data.count.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Percentage:</span>
            <span className="font-medium text-charcoal">
              {data.percentage || "0"}%
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Total Downloads:</span>
            <span className="font-medium text-charcoal">
              {data.total_downloads >= 1000000
                ? `${(data.total_downloads / 1000000).toFixed(1)}M`
                : `${(data.total_downloads / 1000).toFixed(0)}K`}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Avg Likes:</span>
            <span className="font-medium text-charcoal">
              {Math.round(data.avg_likes).toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

function renderPieLabel(props: { payload?: { category?: string } }) {
  const entry = props.payload || props;
  if (entry && "category" in entry && entry.category) {
    return formatCategoryName(entry.category);
  }
  return "";
}

interface ModelCategoryDistributionProps {
  categories: CategoryData[];
  topN?: number;
  height?: number;
  showLegend?: boolean;
}

export function ModelCategoryDistribution({
  categories,
  topN = 8,
  height = 300,
  showLegend = true,
}: ModelCategoryDistributionProps) {
  const grouped = groupSmallCategories(categories, topN);
  const total = grouped.reduce((sum, cat) => sum + cat.count, 0);
  const dataWithPercentage = grouped.map((cat) => ({
    ...cat,
    percentage: ((cat.count / total) * 100).toFixed(1),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={dataWithPercentage}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderPieLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="count"
          >
            {grouped.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS.primary[index % COLORS.primary.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<PieCategoryTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {showLegend && (
        <div className="flex flex-col justify-center space-y-3">
          {grouped.map((cat, index) => (
            <div
              key={cat.category}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 border border-stone-border"
                  style={{
                    backgroundColor:
                      COLORS.primary[index % COLORS.primary.length],
                  }}
                />
                <span className="text-sm text-charcoal tracking-wide">
                  {formatCategoryName(cat.category)}
                </span>
              </div>
              <span className="text-sm text-stone font-light">
                {cat.count} models
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
