import React, { useState, useCallback } from "react";
import FileUploader from "./components/FileUploader";
import DataPreview from "./components/DataPreview";
import QueryPanel from "./components/QueryPanel";
import HistoryPanel from "./components/HistoryPanel";
import type { FileEntry, UploadedFile } from "./types";

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [prefillQuestion, setPrefillQuestion] = useState("");
  const [prefillFile, setPrefillFile] = useState("");
  const [prefillSheet, setPrefillSheet] = useState("");
  const [prefillRating, setPrefillRating] = useState<number | null>(null);
  const [prefillHistoryIndex, setPrefillHistoryIndex] = useState<number | null>(null);
  const [autoSubmitKey, setAutoSubmitKey] = useState(0);

  const handleUpload = useCallback(
    (uploaded: UploadedFile[]) => {
      const newFiles: FileEntry[] = uploaded
        .filter((f) => f.success)
        .map((f) => ({
          filename: f.filename,
          sheets: f.sheets.map((s) => s.sheet_name),
        }));

      setFiles((prev) => {
        const map = new Map(prev.map((f) => [f.filename, f]));
        newFiles.forEach((f) => map.set(f.filename, f));
        return Array.from(map.values());
      });
    },
    []
  );

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">
            AI CSV/Excel Analyzer
          </h1>
          <p className="text-sm text-gray-500">
            Upload data files and ask questions in natural language
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Upload */}
        <section>
          <FileUploader
            onUpload={handleUpload}
            sessionId={sessionId}
            setSessionId={setSessionId}
          />
        </section>

        {sessionId && files.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Data Preview */}
              <section className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Data Preview
                </h2>
                <DataPreview sessionId={sessionId} files={files} />
              </section>

              {/* Query */}
              <section className="bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Ask a Question
                </h2>
                <QueryPanel
                  sessionId={sessionId}
                  files={files}
                  onQueryComplete={() =>
                    setHistoryRefreshKey((k) => k + 1)
                  }
                  onFeedbackSubmit={() =>
                    setHistoryRefreshKey((k) => k + 1)
                  }
                  prefillQuestion={prefillQuestion}
                  prefillFile={prefillFile}
                  prefillSheet={prefillSheet}
                  prefillRating={prefillRating}
                  prefillHistoryIndex={prefillHistoryIndex}
                  autoSubmitKey={autoSubmitKey}
                />
              </section>
            </div>

            {/* Sidebar: History */}
            <aside className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Prompt History
              </h2>
              <HistoryPanel
                sessionId={sessionId}
                refreshKey={historyRefreshKey}
                onSelectPrompt={(q: string, f: string, s: string, r: number | null, idx: number) => {
                  setPrefillQuestion(q);
                  setPrefillFile(f);
                  setPrefillSheet(s);
                  setPrefillRating(r);
                  setPrefillHistoryIndex(idx);
                  setAutoSubmitKey((k) => k + 1);
                }}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
