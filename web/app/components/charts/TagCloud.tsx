"use client";

interface TagData {
  tag: string;
  count: number;
}

interface TagCloudProps {
  tags: TagData[];
  minSize?: number;
  maxSize?: number;
  scaleFactor?: number;
}

export function TagCloud({
  tags,
  minSize = 10,
  maxSize = 16,
  scaleFactor = 5,
}: TagCloudProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((item, idx) => (
        <span
          key={`${item.tag}-${idx}`}
          className="px-3 py-2 border border-stone-border bg-white text-xs text-charcoal tracking-wide"
          style={{
            fontSize: Math.max(
              minSize,
              Math.min(maxSize, minSize + item.count / scaleFactor),
            ),
          }}
        >
          {item.tag} ({item.count})
        </span>
      ))}
    </div>
  );
}
