import axios from "axios";
import type {
  UploadedFile,
  FileEntry,
  QueryResult,
  HistoryEntry,
  FeedbackSummary,
} from "./types";

const BASE = "http://localhost:8000/api";

function headers(sessionId: string) {
  return { "x-session-id": sessionId };
}

export async function uploadFiles(
  files: File[],
  sessionId?: string
): Promise<{ session_id: string; files: UploadedFile[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const h: Record<string, string> = {};
  if (sessionId) h["x-session-id"] = sessionId;
  const res = await axios.post(`${BASE}/upload`, form, { headers: h });
  return res.data;
}

export async function getFiles(
  sessionId: string
): Promise<{ files: FileEntry[] }> {
  const res = await axios.get(`${BASE}/files`, {
    headers: headers(sessionId),
  });
  return res.data;
}

export async function getPreview(
  sessionId: string,
  filename: string,
  sheet: string,
  n: number
): Promise<{
  filename: string;
  sheet: string;
  columns: string[];
  rows: (string | number | null)[][];
  total_rows: number;
}> {
  const res = await axios.get(`${BASE}/preview`, {
    headers: headers(sessionId),
    params: { filename, sheet, n },
  });
  return res.data;
}

export async function queryData(
  sessionId: string,
  question: string,
  filename: string,
  sheet: string,
  saveHistory: boolean = true
): Promise<QueryResult> {
  const res = await axios.post(
    `${BASE}/query`,
    { question, filename, sheet, save_history: saveHistory },
    { headers: headers(sessionId) }
  );
  return res.data;
}

export async function getHistory(
  sessionId: string
): Promise<{ history: HistoryEntry[] }> {
  const res = await axios.get(`${BASE}/history`, {
    headers: headers(sessionId),
  });
  return res.data;
}

export async function submitFeedback(
  sessionId: string,
  historyIndex: number,
  rating: number
): Promise<{ success: boolean; summary: FeedbackSummary }> {
  const res = await axios.post(
    `${BASE}/feedback`,
    { history_index: historyIndex, rating },
    { headers: headers(sessionId) }
  );
  return res.data;
}

export async function getFeedbackSummary(
  sessionId: string
): Promise<FeedbackSummary> {
  const res = await axios.get(`${BASE}/feedback/summary`, {
    headers: headers(sessionId),
  });
  return res.data;
}
