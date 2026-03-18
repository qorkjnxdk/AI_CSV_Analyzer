import React, { useCallback, useRef } from "react";
import { uploadFiles } from "../api";
import type { UploadedFile } from "../types";

interface Props {
  onUpload: (files: UploadedFile[]) => void;
  sessionId: string | null;
  setSessionId: (id: string) => void;
}

export default function FileUploader({
  onUpload,
  sessionId,
  setSessionId,
}: Props) {
  
  // Reference to the hidden file input — used to programmatically open the file picker
  // from the styled button, and to reset its value so re-selecting the same file still triggers onChange
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Validates selected files (extension check), sends them to the backend, updates the session ID, and surfaces any errors (rate limit, failed files, unsupported types)
  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      // Client-side guard: reject files that don't end in .csv/.xls/.xlsx before sending to backend (backend also validates via magic bytes)
      const allowed = [".csv", ".xls", ".xlsx"];
      const invalid = Array.from(fileList).filter(
        (f) => !allowed.some((ext) => f.name.toLowerCase().endsWith(ext))
      );
      if (invalid.length > 0) {
        setError(`Unsupported file type: ${invalid.map((f) => f.name).join(", ")}. Only CSV and Excel files are allowed.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setLoading(true);
      setError(null);

      try {
        const result = await uploadFiles(
          Array.from(fileList),
          sessionId || undefined
        );
        setSessionId(result.session_id);
        onUpload(result.files);

        // Check if any files were rejected by the backend (e.g. magic byte mismatch) and show their error messages
        const failed = result.files.filter((f) => !f.success);
        if (failed.length > 0) {
          setError(
            failed.map((f) => `${f.filename}: ${f.error}`).join("; ")
          );
        }
      } catch (e: any) {
        if (e?.response?.status === 429) {
          setError("Rate limit reached — please wait a moment before uploading again.");
        } else {
          setError(e?.response?.data?.detail || e.message || "Upload failed");
        }
      } finally {
        setLoading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [sessionId, setSessionId, onUpload]
  );

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => handleUpload(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
      >
        {loading ? "Uploading..." : "Upload CSV / Excel Files"}
      </button>
      <p className="mt-2 text-sm text-gray-500">
        Accepts .csv, .xls, .xlsx — max 10MB per file
      </p>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
