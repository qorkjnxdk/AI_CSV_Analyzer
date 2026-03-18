import React, { useEffect, useState } from "react";
import { getHistory, getFeedbackSummary } from "../api";
import type { HistoryEntry, FeedbackSummary } from "../types";

interface Props {
  sessionId: string;
  refreshKey: number;
  onSelectPrompt: (question: string, filename: string, sheet: string, rating: number | null, historyIndex: number) => void;
}

function ratingColor(rating: number | null): string {
  if (rating === null) return "border-gray-200";
  if (rating >= 4) return "border-l-green-400 border-l-4 bg-green-50/50";
  if (rating === 3) return "border-l-yellow-400 border-l-4 bg-yellow-50/30";
  return "border-l-red-400 border-l-4 bg-red-50/30";
}

const STAR_PATH = "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z";

function StarDisplay({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const fraction = rating - full;
  const hasHalf = fraction >= 0.25 && fraction < 0.75;
  const ceilFull = fraction >= 0.75 ? full + 1 : full;

  return (
    <span className="inline-flex gap-px">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFull = star <= ceilFull;
        const isHalf = !isFull && hasHalf && star === ceilFull + 1;

        if (isHalf) {
          const clipId = `half-star-${star}`;
          return (
            <svg key={star} className="h-3 w-3" viewBox="0 0 24 24">
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
              </defs>
              {/* Filled half */}
              <path d={STAR_PATH} fill="#f59e0b" stroke="#f59e0b" strokeWidth={2} clipPath={`url(#${clipId})`} />
              {/* Empty outline */}
              <path d={STAR_PATH} fill="none" stroke="#d1d5db" strokeWidth={2} />
            </svg>
          );
        }

        return (
          <svg key={star} className="h-3 w-3" viewBox="0 0 24 24"
            fill={isFull ? "#f59e0b" : "none"}
            stroke={isFull ? "#f59e0b" : "#d1d5db"}
            strokeWidth={2}
          >
            <path d={STAR_PATH} />
          </svg>
        );
      })}
    </span>
  );
}

export default function HistoryPanel({
  sessionId,
  refreshKey,
  onSelectPrompt,
}: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);

  // Fetch history and feedback summary whenever the session changes or refreshKey
  // increments (which happens after a new query or feedback submission)
  useEffect(() => {
    getHistory(sessionId).then((data) => setHistory(data.history));
    getFeedbackSummary(sessionId).then(setSummary).catch(() => {});
  }, [sessionId, refreshKey]);

  if (history.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">No prompts yet. Ask a question to get started.</p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Display in reverse chronological order (newest first).
          .slice() avoids mutating the original array */}
      {history
        .slice()
        .reverse()
        .map((entry, i) => {
          // Map reversed display index back to original history array index, needed when replaying a query or submitting feedback for a specific entry
          const realIndex = history.length - 1 - i;
          return (
            <button
              key={realIndex}
              onClick={() => onSelectPrompt(entry.question, entry.filename, entry.sheet, entry.rating, realIndex)}
              className={`w-full text-left p-3 rounded border transition-colors cursor-pointer hover:shadow-sm ${ratingColor(entry.rating)}`}
            >
              <p className="text-sm font-medium text-gray-800 truncate">
                {entry.question}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-xs text-gray-400">
                  {entry.filename}
                  {entry.sheet !== "Sheet1" ? ` / ${entry.sheet}` : ""} &middot;{" "}
                  {new Date(entry.timestamp).toLocaleTimeString()}
                  {entry.result.type === "chart" && " · Chart"}
                </p>
                {entry.rating !== null && (
                  <StarDisplay rating={entry.rating} />
                )}
              </div>
            </button>
          );
        })}

      {/* Aggregate feedback stats — average rating + count, shown only if at least one entry has been rated */}
      {summary && summary.total > 0 && (
        <div className="pt-3 border-t flex items-center justify-center gap-2 text-xs text-gray-500">
          <span>Avg rating:</span>
          <StarDisplay rating={summary.average_rating} />
          <span>{summary.average_rating}/5 ({summary.total} rated)</span>
        </div>
      )}
    </div>
  );
}
