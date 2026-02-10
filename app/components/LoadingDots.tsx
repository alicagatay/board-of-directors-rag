"use client";

import { useState, useEffect } from "react";

/**
 * LoadingDots component displays 5 dots that appear sequentially
 * Each dot becomes visible after 1 second
 */
export default function LoadingDots() {
  const [visibleDots, setVisibleDots] = useState(0);

  useEffect(() => {
    // Reset to 0 when component mounts
    setVisibleDots(0);

    // Show dots one by one, each after 1 second
    const intervals: NodeJS.Timeout[] = [];

    for (let i = 1; i <= 5; i++) {
      const timeout = setTimeout(() => {
        setVisibleDots(i);
      }, i * 1000);
      intervals.push(timeout);
    }

    // Cleanup timeouts when component unmounts
    return () => {
      intervals.forEach((timeout) => clearTimeout(timeout));
    };
  }, []);

  return (
    <div className="flex items-center space-x-2">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          className={`w-3 h-3 rounded-full transition-opacity duration-300 ${
            index < visibleDots ? "opacity-100 bg-gray-500" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}
