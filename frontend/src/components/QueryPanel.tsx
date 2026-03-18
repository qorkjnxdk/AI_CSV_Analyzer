import React, { useState, useEffect } from "react";
import { queryData, submitFeedback, getSuggestions } from "../api";
import type { FileEntry, QueryResult, TableData, SubResult } from "../types";

// Module-level cache so StrictMode double-mount doesn't duplicate calls
const suggestionsCache: Record<string, Promise<string[]>> = {};

interface Props {
  sessionId: string;
  files: FileEntry[];
  onQueryComplete: () => void;
  onFeedbackSubmit: () => void;
  prefillQuestion?: string;
  prefillFile?: string;
  prefillSheet?: string;
  prefillRating?: number | null;
  prefillHistoryIndex?: number | null;
  autoSubmitKey?: number;
}

export default function QueryPanel({
  sessionId,
  files,
  onQueryComplete,
  onFeedbackSubmit,
  prefillQuestion,
  prefillFile,
  prefillSheet,
  prefillRating,
  prefillHistoryIndex,
  autoSubmitKey,
}: Props) {
  const [question, setQuestion] = useState(prefillQuestion || "");
  const [selectedFile, setSelectedFile] = useState(files[0]?.filename || "");
  const [selectedSheet, setSelectedSheet] = useState(files[0]?.sheets[0] || "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [feedback, setFeedback] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  React.useEffect(() => {
    if (prefillQuestion) setQuestion(prefillQuestion);
    if (prefillFile) setSelectedFile(prefillFile);
    if (prefillSheet) setSelectedSheet(prefillSheet);
    if (prefillRating !== undefined) setFeedback(prefillRating);
  }, [prefillQuestion, prefillFile, prefillSheet, prefillRating]);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (retryCountdown <= 0) return;
    const timer = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [retryCountdown]);

  // Fetch suggestions when file/sheet changes and clear old result
  React.useEffect(() => {
    if (!sessionId || !selectedFile || !selectedSheet) return;
    const key = `${sessionId}:${selectedFile}:${selectedSheet}`;
    setResult(null);
    setError(null);
    if (!suggestionsCache[key]) {
      suggestionsCache[key] = getSuggestions(sessionId, selectedFile, selectedSheet);
    }
    suggestionsCache[key]
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }, [sessionId, selectedFile, selectedSheet]);


  const currentFile = files.find((f) => f.filename === selectedFile);

  // Core query function: sends question to backend, handles response (including history
  // ===replays where we reattach the original index for rating), and errors (429 triggers countdown)
  const runQuery = async (q: string, file: string, sheet: string, saveHistory: boolean) => {
    if (!q.trim() || !file) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setFeedback(null);

    try {
      const res = await queryData(sessionId, q, file, sheet, saveHistory);
      // For replays, attach the original history index so we can rate it
      if (!saveHistory && prefillHistoryIndex != null) {
        res.history_index = prefillHistoryIndex;
        setFeedback(prefillRating ?? null);
      }
      setResult(res);
      if (saveHistory) onQueryComplete();
    } catch (e: any) {
      if (e?.response?.status === 429) {
        const retryAfter = e?.response?.data?.detail?.retry_after || 60;
        setRetryCountdown(retryAfter);
      } else {
        setError(e?.response?.data?.detail || e.message || "Query failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // Form submit handler: calls runQuery with saveHistory=true for new queries
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runQuery(question, selectedFile, selectedSheet, true);
  };

  // Auto-submit when a history item is selected (replay — don't save to history).
  // Triggers when autoSubmitKey changes (set by parent when user clicks a history entry)
  React.useEffect(() => {
    if (!autoSubmitKey || !prefillQuestion || !prefillFile) return;
    runQuery(prefillQuestion, prefillFile, prefillSheet || "Sheet1", false);
  }, [autoSubmitKey]);

  // Sends star rating to backend for the current result's history entry, then notifies parent to refresh the history panel
  const handleFeedback = async (rating: number) => {
    if (result?.history_index == null) return;
    try {
      await submitFeedback(sessionId, result.history_index, rating);
      setFeedback(rating);
      onFeedbackSubmit();
    } catch {}
  };

  // Creates a temporary download link from the base64-encoded chart image and triggers a browser download
  const downloadChartPNG = (b64: string) => {
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${b64}`;
    link.download = "chart.png";
    link.click();
  };

  // Converts table data to CSV (with proper escaping for commas, quotes, newlines), creates a Blob, and triggers a browser download
  const downloadTableCSV = (table: TableData) => {
    const escape = (val: string) =>
      val.includes(",") || val.includes('"') || val.includes("\n")
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    const header = table.columns.map(escape).join(",");
    const rows = table.rows
      .map((row) => row.map((cell) => escape(cell == null ? "" : String(cell))).join(","))
      .join("\n");
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "result.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div>
      <form onSubmit={handleSubmit} className="space-y-3">
        {/* File selector row */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              File
            </label>
            <select
              className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              value={selectedFile}
              onChange={(e) => {
                setSelectedFile(e.target.value);
                const f = files.find((f) => f.filename === e.target.value);
                if (f) setSelectedSheet(f.sheets[0]);
              }}
            >
              {files.map((f) => (
                <option key={f.filename} value={f.filename}>
                  {f.filename}
                </option>
              ))}
            </select>
          </div>

          {currentFile && currentFile.sheets.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Sheet
              </label>
              <select
                className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
              >
                {currentFile.sheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Question input */}
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-400 focus-within:border-transparent">
          <textarea
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (question.trim() && !loading) {
                  (e.target as HTMLTextAreaElement).form?.requestSubmit();
                }
              }
            }}
            rows={1}
            placeholder="e.g. What is the average age of passengers?"
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="flex-1 min-w-0 text-sm py-1 focus:outline-none placeholder:text-gray-400 resize-none overflow-hidden"
          />
          <button
            type="submit"
            disabled={loading || !question.trim() || retryCountdown > 0}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium cursor-pointer transition-colors shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Thinking...
              </span>
            ) : (
              "Ask"
            )}
          </button>
        </div>
      </form>

      {/* Suggested prompts */}
      {suggestions.length > 0 && !result && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuestion(s)}
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full hover:bg-blue-100 cursor-pointer transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Rate limit countdown */}
      {retryCountdown > 0 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Rate limit reached — please wait {retryCountdown}s before querying again.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
          <svg className="h-4 w-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="mt-4 flex items-center justify-center py-10">
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <svg className="animate-spin h-6 w-6 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Analyzing your data...</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
          {/* Result header */}
          <div className="px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {result.type === "chart" ? "Chart" : result.type === "table" ? "Table" : result.type === "multi" ? "Results" : result.type === "error" ? "Error" : "Answer"}
            </span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleFeedback(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  disabled={feedback !== null}
                  className={`p-0.5 transition-colors cursor-pointer disabled:cursor-default`}
                  title={`${star} star${star > 1 ? "s" : ""}`}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill={
                      (feedback !== null ? star <= feedback : star <= hoverRating)
                        ? "#f59e0b"
                        : "none"
                    }
                    stroke={
                      (feedback !== null ? star <= feedback : star <= hoverRating)
                        ? "#f59e0b"
                        : "#d1d5db"
                    }
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              ))}
              {feedback !== null && (
                <span className="text-xs text-gray-400 ml-1.5">{feedback}/5</span>
              )}
            </div>
          </div>

          {/* Result body */}
          <div className="p-4">
            {result.type === "error" && (
              <div className="text-red-600 text-sm whitespace-pre-wrap">
                {result.data as string}
              </div>
            )}

            {result.type === "scalar" && (
              <p className="text-2xl font-bold text-gray-900">
                {result.data as string}
              </p>
            )}

            {result.type === "text" && (
              <p className="text-sm text-gray-700 leading-relaxed">{result.data as string}</p>
            )}

            {result.type === "table" && (() => {
              const table = result.data as TableData;
              return (
                <div>
                  <div className="overflow-x-auto rounded-md border border-gray-100">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {table.columns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {table.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-blue-50/30">
                            {row.map((cell, j) => (
                              <td
                                key={j}
                                className="px-3 py-2 whitespace-nowrap text-gray-700"
                              >
                                {cell === null ? (
                                  <span className="text-gray-300">--</span>
                                ) : (
                                  String(cell)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => downloadTableCSV(table)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md cursor-pointer transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download CSV
                  </button>
                </div>
              );
            })()}

            {/* Multi-output renderer: iterates over sub-results (scalar, text, table, chart)
                and renders each with its appropriate component */}
            {result.type === "multi" && (
              <div className="space-y-4">
                {(result.data as SubResult[]).map((sub, idx) => (
                  <div key={idx}>
                    {sub.type === "scalar" && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Answer</span>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{sub.data as string}</p>
                      </div>
                    )}
                    {sub.type === "text" && (
                      <p className="text-sm text-gray-700 leading-relaxed">{sub.data as string}</p>
                    )}
                    {sub.type === "table" && (() => {
                      const table = sub.data as TableData;
                      return (
                        <div>
                          <div className="overflow-x-auto rounded-md border border-gray-100">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  {table.columns.map((col) => (
                                    <th key={col} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {table.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-blue-50/30">
                                    {row.map((cell, j) => (
                                      <td key={j} className="px-3 py-2 whitespace-nowrap text-gray-700">
                                        {cell === null ? <span className="text-gray-300">--</span> : String(cell)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button
                            onClick={() => downloadTableCSV(table)}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md cursor-pointer transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download CSV
                          </button>
                        </div>
                      );
                    })()}
                    {sub.type === "chart" && (
                      <div>
                        <img
                          src={`data:image/png;base64,${sub.data}`}
                          alt="Generated chart"
                          className="max-w-full rounded-md border border-gray-100"
                        />
                        <button
                          onClick={() => downloadChartPNG(sub.data as string)}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md cursor-pointer transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download PNG
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.type === "chart" && (
              <div>
                {result.text && (
                  <p className="text-sm text-gray-700 mb-3 leading-relaxed">{result.text}</p>
                )}
                <img
                  src={`data:image/png;base64,${result.data}`}
                  alt="Generated chart"
                  className="max-w-full rounded-md border border-gray-100"
                />
                <button
                  onClick={() => downloadChartPNG(result.data as string)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md cursor-pointer transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNG
                </button>
              </div>
            )}
          </div>

          {/* Generated code toggle */}
          {result.code && (
            <details className="border-t border-gray-100">
              <summary className="px-4 py-2.5 text-xs text-gray-400 cursor-pointer hover:text-gray-600 hover:bg-gray-50 transition-colors">
                View generated code
              </summary>
              <pre className="px-4 py-3 bg-gray-900 text-gray-100 text-xs overflow-x-auto font-mono leading-relaxed">
                {result.code}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
