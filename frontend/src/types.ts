export interface SheetInfo {
  sheet_name: string;
  rows: number;
  columns: string[];
}

export interface UploadedFile {
  filename: string;
  success: boolean;
  sheets: SheetInfo[];
  error?: string;
}

export interface FileEntry {
  filename: string;
  sheets: string[];
}

export interface SubResult {
  type: "scalar" | "table" | "text" | "chart";
  data: string | TableData;
}

export interface QueryResult {
  type: "scalar" | "table" | "chart" | "text" | "error" | "multi";
  data: string | TableData | SubResult[];
  text?: string;
  code?: string;
  history_index?: number;
}

export interface TableData {
  columns: string[];
  rows: (string | number | null)[][];
}

export interface HistoryEntry {
  question: string;
  filename: string;
  sheet: string;
  timestamp: string;
  result: QueryResult;
  rating: number | null;
}

export interface FeedbackSummary {
  total: number;
  average_rating: number;
}
