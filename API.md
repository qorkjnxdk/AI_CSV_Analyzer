# API Documentation

**Base URL:** `http://localhost:8000/api`

All endpoints that operate on session data require the `x-session-id` header.

## Endpoints

### `GET /api/health`

Health check — returns server status.

**Response:**
```json
{ "status": "ok" }
```

---

### `POST /api/upload`

Upload one or more CSV/Excel files. Creates a new session or adds files to an existing one.

**Rate limit:** 4 requests / 60 seconds per session/IP.

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `files` | body (multipart) | `File[]` | Yes | `.csv`, `.xls`, or `.xlsx` files |
| `x-session-id` | header | `string` | No | Existing session ID; omit to create a new session |

**Response:**
```json
{
  "session_id": "string",
  "files": [
    {
      "filename": "string",
      "success": true,
      "sheets": [
        { "sheet_name": "string", "rows": 150, "columns": ["col1", "col2"] }
      ]
    }
  ]
}
```

On validation failure a file entry returns `"success": false` with an `"error"` field.

---

### `GET /api/files`

List all uploaded files and their sheets for the current session.

| Parameter | In | Type | Required |
|---|---|---|---|
| `x-session-id` | header | `string` | Yes |

**Response:**
```json
{
  "files": [
    { "filename": "data.csv", "sheets": ["Sheet1"] }
  ]
}
```

---

### `GET /api/preview`

Return the first N rows of a specific file/sheet.

| Parameter | In | Type | Required | Default | Description |
|---|---|---|---|---|---|
| `x-session-id` | header | `string` | Yes | — | Session ID |
| `filename` | query | `string` | Yes | — | Uploaded filename |
| `sheet` | query | `string` | No | `"Sheet1"` | Sheet name |
| `n` | query | `int` | No | `10` | Rows to return (max 500) |

**Response:**
```json
{
  "filename": "data.csv",
  "sheet": "Sheet1",
  "columns": ["col1", "col2"],
  "rows": [["val1", "val2"], ["val3", null]],
  "total_rows": 150
}
```

`NaN` and `Inf` values are converted to `null`.

---

### `POST /api/query`

Ask a natural language question about the data. The backend generates pandas code via OpenAI, executes it in a sandbox, and returns the result.

**Rate limit:** 10 requests / 60 seconds per session.

| Parameter | In | Type | Required | Default |
|---|---|---|---|---|
| `x-session-id` | header | `string` | Yes | — |
| `question` | body | `string` | Yes | — |
| `filename` | body | `string` | Yes | — |
| `sheet` | body | `string` | No | `"Sheet1"` |
| `save_history` | body | `bool` | No | `true` |

**Response:**
```json
{
  "type": "scalar | table | chart | text | error | multi",
  "data": "string | TableData | SubResult[]",
  "text": "string (optional, chart description)",
  "code": "string (optional, generated code)",
  "history_index": 0
}
```

**`TableData`** shape:
```json
{ "columns": ["col1", "col2"], "rows": [["v1", "v2"]] }
```

**`SubResult`** shape (when `type` is `multi`):
```json
{ "type": "scalar | table | text | chart", "data": "string | TableData" }
```

**Error codes:**
| Status | Reason |
|---|---|
| 400 | Prompt injection detected |
| 404 | Session, file, or sheet not found |
| 429 | Rate limit exceeded |
| 502 | OpenAI API error |

---

### `GET /api/suggestions`

Get 3 AI-generated starter prompts based on the dataset's schema.

| Parameter | In | Type | Required | Default |
|---|---|---|---|---|
| `x-session-id` | header | `string` | Yes | — |
| `filename` | query | `string` | Yes | — |
| `sheet` | query | `string` | No | `"Sheet1"` |

**Response:**
```json
{
  "suggestions": [
    "What is the average value of column X?",
    "Show all rows where Y > 100",
    "Plot the distribution of Z"
  ]
}
```

Falls back to generic suggestions if the LLM call fails.

---

### `GET /api/history`

Retrieve all past queries and their results for the current session.

| Parameter | In | Type | Required |
|---|---|---|---|
| `x-session-id` | header | `string` | Yes |

**Response:**
```json
{
  "history": [
    {
      "question": "string",
      "filename": "string",
      "sheet": "string",
      "timestamp": "2026-03-18T07:00:00Z",
      "result": { "type": "...", "data": "..." },
      "rating": 4
    }
  ]
}
```

`rating` is `null` if no feedback has been submitted for that entry.

---

### `POST /api/feedback`

Submit a 1–5 star rating for a query result.

| Parameter | In | Type | Required | Description |
|---|---|---|---|---|
| `x-session-id` | header | `string` | Yes | Session ID |
| `history_index` | body | `int` | Yes | Index into the history array |
| `rating` | body | `int` | Yes | Rating from 1 to 5 |

**Response:**
```json
{
  "success": true,
  "summary": { "total": 5, "average_rating": 3.8 }
}
```

Returns `400` if the rating or index is invalid.

---

### `GET /api/feedback/summary`

Get aggregate feedback statistics for the current session.

| Parameter | In | Type | Required |
|---|---|---|---|
| `x-session-id` | header | `string` | Yes |

**Response:**
```json
{ "total": 5, "average_rating": 3.8 }
```
