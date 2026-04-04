"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import type { RagTechStackSankeyFlow } from "@/lib/market-analysis";
import { RagFlowTabSwitch } from "./RagFlowTabSwitch";

interface RagTechStackSankeyProps {
  flows: RagTechStackSankeyFlow[];
}

type FlowTab = "model" | "repo";

interface TooltipData {
  label: string;
  value: number;
  type: string;
  x: number;
  y: number;
  inflows: Array<{ source: string; value: number }>;
  outflows: Array<{ target: string; value: number }>;
}

interface Node {
  id: string;
  label: string;
  type: string;
  value: number;
  x: number;
  y: number;
  height: number;
}

interface Link {
  source: string;
  target: string;
  value: number;
  sourceY: number;
  targetY: number;
  sourceHeight: number;
  targetHeight: number;
}

export function RagTechStackSankey({ flows }: RagTechStackSankeyProps) {
  const [activeTab, setActiveTab] = useState<FlowTab>("repo");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [containerWidth, setContainerWidth] = useState(1100);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(Math.max(width, 800)); // Minimum width for mobile scroll
        setIsMobile(width < 768);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const { nodes, links, nodeWidth, columnWidth, columnGap, margin } =
    useMemo(() => {
      // Filter flows based on active tab
      const filteredFlows = flows
        .filter((flow) => {
          if (activeTab === "model") {
            // Model: model_tag -> rag_category
            return (
              flow.source_type === "model_tag" &&
              flow.target_type === "rag_category"
            );
          } else {
            // Repo: rag_category -> github_topic (will reverse below)
            return (
              flow.source_type === "rag_category" &&
              flow.target_type === "github_topic"
            );
          }
        })
        .map((flow) => {
          // Reverse the repo flow direction: github_topic -> rag_category
          if (activeTab === "repo") {
            return {
              source: flow.target,
              target: flow.source,
              value: flow.value,
              source_type: flow.target_type,
              target_type: flow.source_type,
            };
          }
          return flow;
        });

      if (filteredFlows.length === 0) {
        return {
          nodes: [],
          links: [],
          nodeWidth: 100,
          columnWidth: 200,
          columnGap: 60,
          margin: { top: 20, right: 0, bottom: 20, left: 20 },
        };
      }

      // Group flows by type
      const nodeMap = new Map<string, { type: string; value: number }>();

      filteredFlows.forEach((flow) => {
        // Add source node
        const sourceKey = `${flow.source}::${flow.source_type}`;
        if (!nodeMap.has(sourceKey)) {
          nodeMap.set(sourceKey, { type: flow.source_type, value: 0 });
        }
        const sourceNode = nodeMap.get(sourceKey)!;
        sourceNode.value += flow.value;

        // Add target node
        const targetKey = `${flow.target}::${flow.target_type}`;
        if (!nodeMap.has(targetKey)) {
          nodeMap.set(targetKey, { type: flow.target_type, value: 0 });
        }
        const targetNode = nodeMap.get(targetKey)!;
        targetNode.value += flow.value;
      });

      // Define column positions based on active tab
      const columns =
        activeTab === "model"
          ? {
              model_tag: 0,
              rag_category: 1,
            }
          : {
              github_topic: 0,
              rag_category: 1,
            };

      const numColumns = Object.keys(columns).length;
      const margin = { top: 20, right: 0, bottom: 20, left: 20 };
      const availableWidth = containerWidth - margin.left - margin.right;
      const columnGap = 60; // Extra spacing between columns
      const columnWidth =
        (availableWidth - columnGap * (numColumns - 1)) / numColumns;
      const nodeWidth = Math.min(150, Math.max(100, columnWidth * 0.6));
      const nodeSpacing = 5;

      // Group nodes by type/column
      const nodesByColumn = new Map<
        number,
        Array<{ id: string; value: number }>
      >();

      for (const [key, data] of nodeMap.entries()) {
        const [, type] = key.split("::");
        const columnIndex = columns[type as keyof typeof columns];

        if (!nodesByColumn.has(columnIndex)) {
          nodesByColumn.set(columnIndex, []);
        }

        nodesByColumn.get(columnIndex)!.push({
          id: key,
          value: data.value,
        });
      }

      // Sort nodes within each column by value (descending) and limit
      const maxNodesPerColumn = 12;
      for (const [col, items] of nodesByColumn.entries()) {
        items.sort((a, b) => b.value - a.value);
        nodesByColumn.set(col, items.slice(0, maxNodesPerColumn));
      }

      // Calculate node positions and heights
      const totalHeight = 600;
      const availableHeight = totalHeight - margin.top - margin.bottom;

      const processedNodes: Node[] = [];

      for (const [colIndex, items] of nodesByColumn.entries()) {
        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        let currentY = margin.top;

        items.forEach((item) => {
          const [label, type] = item.id.split("::");
          const heightRatio = item.value / totalValue;
          const nodeHeight = Math.max(
            8,
            heightRatio * availableHeight - nodeSpacing,
          );

          processedNodes.push({
            id: item.id,
            label,
            type,
            value: item.value,
            x: margin.left + colIndex * (columnWidth + columnGap),
            y: currentY,
            height: nodeHeight,
          });

          currentY += nodeHeight + nodeSpacing;
        });
      }

      // Create node lookup
      const nodeLookup = new Map(processedNodes.map((n) => [n.id, n]));

      // Create links with proper source/target node data
      const processedLinks: Link[] = [];
      const linksBySourceTarget = new Map<string, number>();

      flows.forEach((flow) => {
        const sourceKey = `${flow.source}::${flow.source_type}`;
        const targetKey = `${flow.target}::${flow.target_type}`;

        const sourceNode = nodeLookup.get(sourceKey);
        const targetNode = nodeLookup.get(targetKey);

        if (sourceNode && targetNode) {
          const linkKey = `${sourceKey}->${targetKey}`;
          const currentValue = linksBySourceTarget.get(linkKey) || 0;
          linksBySourceTarget.set(linkKey, currentValue + flow.value);
        }
      });

      // Calculate link positions with stacking
      const sourceOffsets = new Map<string, number>();
      const targetOffsets = new Map<string, number>();

      for (const [linkKey, value] of linksBySourceTarget.entries()) {
        const [sourceKey, targetKey] = linkKey.split("->");
        const sourceNode = nodeLookup.get(sourceKey)!;
        const targetNode = nodeLookup.get(targetKey)!;

        const sourceOffset = sourceOffsets.get(sourceKey) || 0;
        const targetOffset = targetOffsets.get(targetKey) || 0;

        const sourceHeight = (value / sourceNode.value) * sourceNode.height;
        const targetHeight = (value / targetNode.value) * targetNode.height;

        processedLinks.push({
          source: sourceKey,
          target: targetKey,
          value,
          sourceY: sourceNode.y + sourceOffset,
          targetY: targetNode.y + targetOffset,
          sourceHeight,
          targetHeight,
        });

        sourceOffsets.set(sourceKey, sourceOffset + sourceHeight);
        targetOffsets.set(targetKey, targetOffset + targetHeight);
      }

      return {
        nodes: processedNodes,
        links: processedLinks,
        nodeWidth,
        columnWidth,
        columnGap,
        margin,
      };
    }, [flows, containerWidth, activeTab]);

  if (flows.length === 0) {
    return null;
  }

  const height = 600;

  const handleNodeHover = (
    node: Node,
    event: React.MouseEvent | React.TouchEvent,
  ) => {
    setHoveredNode(node.id);

    // Calculate inflows and outflows
    const inflows = links
      .filter((link) => link.target === node.id)
      .map((link) => ({
        source: nodes.find((n) => n.id === link.source)?.label || "",
        value: link.value,
      }));

    const outflows = links
      .filter((link) => link.source === node.id)
      .map((link) => ({
        target: nodes.find((n) => n.id === link.target)?.label || "",
        value: link.value,
      }));

    const clientX =
      "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY =
      "touches" in event ? event.touches[0].clientY : event.clientY;

    setTooltip({
      label: node.label,
      value: node.value,
      type: node.type,
      x: clientX,
      y: clientY,
      inflows,
      outflows,
    });
  };

  const handleNodeLeave = () => {
    setHoveredNode(null);
    if (!isMobile) {
      setTooltip(null);
    }
  };

  const handleNodeTouch = (node: Node, event: React.TouchEvent) => {
    event.preventDefault();
    if (tooltip?.label === node.label) {
      // Toggle off if tapping the same node
      setTooltip(null);
      setHoveredNode(null);
    } else {
      handleNodeHover(node, event);
    }
  };

  const getColumnTitle = (type: string): string => {
    switch (type) {
      case "model_tag":
        return "Model Tags";
      case "rag_category":
        return "RAG Categories";
      case "github_topic":
        return "Repository Topics";
      default:
        return type;
    }
  };

  const formatValue = (value: number, type: string): string => {
    if (type === "model_tag" || type === "rag_category") {
      // Downloads
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
      return value.toString();
    } else {
      // Stars
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
      return value.toString();
    }
  };

  // Get unique column types and sort by their column index
  const columnTypes = Array.from(new Set(nodes.map((n) => n.type))).sort(
    (a, b) => {
      // Get column indices from the nodes
      const nodeA = nodes.find((n) => n.type === a);
      const nodeB = nodes.find((n) => n.type === b);
      if (!nodeA || !nodeB) return 0;
      return nodeA.x - nodeB.x; // Sort by x position (column index)
    },
  );

  return (
    <div>
      <RagFlowTabSwitch activeTab={activeTab} onTabChange={setActiveTab} />

      <div
        ref={containerRef}
        className="w-full relative overflow-x-auto"
        onClick={(e) => {
          if (isMobile && tooltip && e.target === e.currentTarget) {
            setTooltip(null);
            setHoveredNode(null);
          }
        }}
      >
        <div style={{ minWidth: isMobile ? "800px" : "auto" }}>
          {/* Column Headers */}
          <div
            className="flex mb-4"
            style={{ paddingLeft: `${margin.left}px` }}
          >
            {columnTypes.map((type, idx) => (
              <div
                key={type}
                className="text-xs font-medium text-charcoal uppercase tracking-wide"
                style={{
                  width: `${columnWidth + nodeWidth}px`,
                  marginRight:
                    idx < columnTypes.length - 1 ? `${columnGap}px` : "0",
                }}
              >
                {getColumnTitle(type)}
              </div>
            ))}
          </div>

          {/* SVG Diagram */}
          <svg width={containerWidth} height={height} className="w-full">
            {/* Links */}
            <g>
              {links.map((link, idx) => {
                const sourceNode = nodes.find((n) => n.id === link.source)!;
                const targetNode = nodes.find((n) => n.id === link.target)!;

                const isHighlighted =
                  hoveredNode === link.source || hoveredNode === link.target;

                const sourceRight = sourceNode.x + nodeWidth;
                const controlOffset = nodeWidth * 0.4;

                const path = `
                M ${sourceRight} ${link.sourceY}
                L ${sourceRight} ${link.sourceY + link.sourceHeight}
                C ${sourceRight + controlOffset} ${link.sourceY + link.sourceHeight},
                  ${targetNode.x - controlOffset} ${link.targetY + link.targetHeight},
                  ${targetNode.x} ${link.targetY + link.targetHeight}
                L ${targetNode.x} ${link.targetY}
                C ${targetNode.x - controlOffset} ${link.targetY},
                  ${sourceRight + controlOffset} ${link.sourceY},
                  ${sourceRight} ${link.sourceY}
                Z
              `;

                return (
                  <path
                    key={`${link.source}-${link.target}-${idx}`}
                    d={path}
                    fill={isHighlighted ? "#a3a3a3" : "#d4d4d4"}
                    opacity={isHighlighted ? 0.6 : 0.3}
                    className="transition-all duration-200"
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {nodes.map((node) => (
                <g
                  key={node.id}
                  onMouseEnter={(e) => handleNodeHover(node, e)}
                  onMouseLeave={handleNodeLeave}
                  onTouchStart={(e) => handleNodeTouch(node, e)}
                  className="cursor-pointer"
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={nodeWidth}
                    height={node.height}
                    fill={hoveredNode === node.id ? "#525252" : "#737373"}
                    className="transition-colors duration-200"
                  />
                  <text
                    x={node.x + nodeWidth + 10}
                    y={node.y + node.height / 2}
                    dominantBaseline="middle"
                    className="text-xs fill-charcoal font-medium"
                    style={{ fontSize: "11px" }}
                  >
                    {node.label.length > 20
                      ? `${node.label.substring(0, 20)}...`
                      : node.label}
                  </text>
                  <text
                    x={node.x + nodeWidth + 10}
                    y={node.y + node.height / 2 + 12}
                    dominantBaseline="middle"
                    className="text-xs fill-stone font-light"
                    style={{ fontSize: "10px" }}
                  >
                    {formatValue(node.value, node.type)}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 bg-white border border-stone-border shadow-lg p-3 text-xs max-w-xs"
            style={{
              left: isMobile
                ? `${Math.min(tooltip.x + 10, window.innerWidth - 250)}px`
                : `${tooltip.x + 10}px`,
              top: isMobile
                ? `${Math.min(tooltip.y + 10, window.innerHeight - 300)}px`
                : `${tooltip.y + 10}px`,
              pointerEvents: "none",
            }}
          >
            <div className="font-medium text-charcoal mb-2">
              {tooltip.label}
            </div>
            <div className="text-stone mb-2">
              Total: {formatValue(tooltip.value, tooltip.type)}
            </div>

            {tooltip.inflows.length > 0 && (
              <div className="mb-2">
                <div className="font-medium text-charcoal mb-1">Inflows:</div>
                {tooltip.inflows.slice(0, 5).map((flow, idx) => (
                  <div key={idx} className="text-stone">
                    {flow.source}: {formatValue(flow.value, tooltip.type)}
                  </div>
                ))}
                {tooltip.inflows.length > 5 && (
                  <div className="text-stone italic">
                    +{tooltip.inflows.length - 5} more
                  </div>
                )}
              </div>
            )}

            {tooltip.outflows.length > 0 && (
              <div>
                <div className="font-medium text-charcoal mb-1">Outflows:</div>
                {tooltip.outflows.slice(0, 5).map((flow, idx) => (
                  <div key={idx} className="text-stone">
                    {flow.target}: {formatValue(flow.value, tooltip.type)}
                  </div>
                ))}
                {tooltip.outflows.length > 5 && (
                  <div className="text-stone italic">
                    +{tooltip.outflows.length - 5} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
