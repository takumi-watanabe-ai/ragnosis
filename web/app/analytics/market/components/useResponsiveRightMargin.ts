"use client";

import { useState, useEffect } from "react";

export function useResponsiveRightMargin(forBubbleChart = false) {
  const [rightMargin, setRightMargin] = useState(30);

  useEffect(() => {
    function updateMargin() {
      const width = window.innerWidth;
      if (width >= 1024) {
        setRightMargin(30);
      } else {
        // Bubble charts need more space for large circles
        setRightMargin(forBubbleChart ? 15 : 0);
      }
    }

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, [forBubbleChart]);

  return rightMargin;
}
