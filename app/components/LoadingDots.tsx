"use client";

import { useState, useEffect } from "react";

/**
 * LoadingDots component displays 5 dots that appear sequentially
 * Each dot becomes visible after 1 second
 */
export default function LoadingDots() {
  const [visibleDots, setVisibleDots] = useState(1); // Start with first dot visible

  useEffect(() => {
    // Reset to 1 when component mounts (first dot visible immediately)
    setVisibleDots(1);

    // Show remaining dots one by one, each after 1 second
    const intervals: NodeJS.Timeout[] = [];

    for (let i = 2; i <= 5; i++) {
      const timeout = setTimeout(() => {
        setVisibleDots(i);
      }, (i - 1) * 1000); // i=2 at 1000ms, i=3 at 2000ms, etc.
      intervals.push(timeout);
    }

    // Cleanup timeouts when component unmounts
    return () => {
      intervals.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  return (
    <div className="flex items-center space-x-2">
      {[1, 2, 3, 4, 5].map((dotNumber) => (
        <div
          key={dotNumber}
          className={`w-3 h-3 rounded-full bg-gray-500 transition-opacity duration-300 ${
            dotNumber <= visibleDots ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}
