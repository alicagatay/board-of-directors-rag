"use client";

import { useState } from "react";
import LoadingDots from "../components/LoadingDots";

export default function TestDotsFullSize() {
  const [showDots, setShowDots] = useState(false);
  const [dotsCount, setDotsCount] = useState(1);

  const handleStart = () => {
    setShowDots(true);
    setDotsCount(1);
  };

  const handleStop = () => {
    setShowDots(false);
    setDotsCount(1);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Full-Size Dots Test</h1>

      <div className="border rounded p-4 mb-4 bg-white">
        <p className="mb-4 text-gray-600">
          Dots now appear at full size without shrinking:
        </p>

        <div className="flex gap-2 mb-4">
          <button
            onClick={handleStart}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Start Animation
          </button>
          <button
            onClick={handleStop}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Stop
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-2">
          Current dots: {dotsCount} | Width: {40 + dotsCount * 12}px
        </p>

        {showDots && (
          <div
            className="p-3 rounded bg-gray-100 transition-all duration-300"
            style={{
              width: `${40 + dotsCount * 12}px`,
            }}
          >
            <LoadingDots onDotsChange={setDotsCount} />
          </div>
        )}
      </div>

      <div className="border rounded p-4 bg-white">
        <h2 className="font-semibold mb-2">Chat Context</h2>
        <div className="space-y-4">
          <div className="p-3 rounded bg-blue-100 ml-8">
            <p className="font-semibold mb-1">You</p>
            <div>What is the best way to approach product development?</div>
          </div>

          {showDots && (
            <div
              className="p-3 rounded bg-gray-100 mr-8 transition-all duration-300"
              style={{
                width: `${40 + dotsCount * 12}px`,
              }}
            >
              <LoadingDots onDotsChange={setDotsCount} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
