import React, { useEffect, useState } from "react";
import { getPreview } from "../api";
import type { FileEntry } from "../types";

interface Props {
  sessionId: string;
  files: FileEntry[];
}

export default function DataPreview({ sessionId, files }: Props) {
  const [selectedFile, setSelectedFile] = useState("");
  const [selectedSheet, setSelectedSheet] = useState("");
  const [n, setN] = useState(10);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(string | number | null)[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [debouncedN, setDebouncedN] = useState(n);

  // Debounce the "Rows" input — waits 400ms after the user stops typing
  // before updating debouncedN, so we don't fire an API call on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedN(n), 400);
    return () => clearTimeout(timer);
  }, [n]);

  // Auto-select the first file and sheet when files are loaded
  // and nothing is selected yet (initial mount)
  useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0].filename);
      setSelectedSheet(files[0].sheets[0]);
    }
  }, [files, selectedFile]);

  // Fetch preview data from the backend whenever the selected file, sheet, or row count changes. 
  // Uses debouncedN so rapid row count changes only trigger one API call
  useEffect(() => {
    if (!selectedFile || !selectedSheet) return;
    setLoading(true);
    getPreview(sessionId, selectedFile, selectedSheet, debouncedN)
      .then((data) => {
        setColumns(data.columns);
        setRows(data.rows);
        setTotalRows(data.total_rows);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId, selectedFile, selectedSheet, debouncedN]);

  // Look up the full file entry for the selected filename, used to get the list of sheets for the sheet dropdown
  const currentFile = files.find((f) => f.filename === selectedFile);

  return (
    <div>
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            File
          </label>
          <select
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            value={selectedFile}
            // When user picks a different file, also reset the sheet selection to that file's first sheet
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

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Rows
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={n}
            onChange={(e) => setN(Math.min(500, Math.max(1, +e.target.value)))}
            className="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-20 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>

        <div className="ml-auto">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            {Math.min(n, totalRows)} of {totalRows.toLocaleString()} rows
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading preview...
          </div>
        </div>
      ) : columns.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-b from-gray-50 to-gray-100 border-b border-gray-200">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap w-10">
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-3 py-2 text-xs text-gray-400 font-mono">
                    {i + 1}
                  </td>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-2 whitespace-nowrap text-gray-700"
                    >
                      {cell === null ? (
                        <span className="text-gray-300 italic text-xs">null</span>
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
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <svg className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">No data to display</p>
        </div>
      )}
    </div>
  );
}
