"use client";

import { useState, useEffect } from "react";

export function useResponsiveMargin() {
  const [leftMargin, setLeftMargin] = useState(60);

  useEffect(() => {
    function updateMargin() {
      const width = window.innerWidth;
      // Desktop (>1024px): 60, Tablet (768-1024px): 15, Mobile (<768px): 15
      if (width >= 1024) {
        setLeftMargin(60);
      } else if (width >= 768) {
        setLeftMargin(15);
      } else {
        setLeftMargin(15);
      }
    }

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, []);

  return leftMargin;
}
