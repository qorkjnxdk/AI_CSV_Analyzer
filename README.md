# AI-Powered CSV / Excel Analysis Application

A full-stack web application that allows users to upload CSV/Excel files and ask natural language questions about their data. Built with React + TypeScript (frontend) and FastAPI + Python (backend), powered by OpenAI GPT-4o.

> For installation and setup instructions, see [SETUP.md](SETUP.md). For API endpoint details, see [API.md](API.md).

## Application Features

### 1. Multi-File Upload

Upload one or more CSV, XLS, or XLSX files per session. Files are validated for type (magic byte verification) and size (10 MB limit), then parsed into in-memory DataFrames — nothing is written to disk.

### 2. Data Preview

View the top N rows of any uploaded file or sheet. N is user-adjustable (1–500, default 10). Users can switch between different files and sheets via dropdown selectors. The total row count is displayed alongside the preview.

### 3. Natural Language Q&A

Ask questions about your data in plain English. The AI generates pandas code behind the scenes, executes it in a sandboxed environment, and returns the result. Users can select which file and sheet to query.

Example prompts:
- *"What is the average age of passengers?"*
- *"Show all rows where Fare > 100"*
- *"What does the Embarked column represent?"*

### 4. Prompt History

All past prompts are saved in a sidebar, displayed in reverse chronological order. Clicking a history entry replays the query, allowing users to revisit or compare previous results. History entries are color-coded by rating (green for high, yellow for neutral, red for low).

### 5. Feedback System

Each query result has a 5-star rating widget. Users rate whether the AI's answer was useful. An aggregate summary (average rating and total count) is displayed at the bottom of the history panel, allowing users to assess overall response quality.

### 6. Combined Multi-Output Responses

A single prompt can generate any combination of three output types, displayed in this order:

| Output | Variable | Description |
|---|---|---|
| **Answer** | `result` | A scalar value or descriptive text with context |
| **Table** | `result_table` | A filtered or computed DataFrame |
| **Chart** | matplotlib/seaborn | A visualization captured automatically |

This allows complex analytical questions to be answered in full with one prompt.

#### Example: Combined Prompt

**Prompt:** *"How many people were in pclass 3, display them, and show the distribution of passengers in each pclass"*

This produces all three outputs:

1. **Answer** — `"Number of passengers in Pclass 3: 96"`
2. **Table** — All 96 passenger rows from Pclass 3
3. **Chart** — A bar chart showing the count of passengers in each Pclass (1, 2, 3)

Behind the scenes, the LLM generates code that sets `result` (the count), `result_table` (the filtered DataFrame), and creates a matplotlib bar chart — all in one script. The sandbox captures each output, processes them and returns them together.

### 7. Auto-Suggested Prompts

When a file is uploaded, the application sends the dataset's metadata (column names, types, and a few sample rows) to the LLM, which generates a set of contextually relevant starter prompts. These appear as clickable chips above the query input — clicking one fills the input box with that prompt, ready to submit. Suggestions update automatically when the user switches between files or sheets.

### 8. Export Results

Query results can be exported directly from the UI:

- **Tables** — a **Download CSV** button appears below any table result, exporting all returned rows as a CSV file.
- **Charts** — a **Download PNG** button appears below any chart, saving the visualization as a PNG image.

Both buttons are available on standalone results and within combined multi-output responses.

---

## Security Considerations

Security is implemented as a multi-layered concern across file handling, query processing, code execution, and audit logging.

### Summary

| Layer | Attack Mitigated | Implementation |
|---|---|---|
| **API key protection** | Key theft via Git history | Key stored in `.env`, excluded via `.gitignore` |
| **Magic byte validation** | Malicious file disguised as CSV | `python-magic` reads file header bytes to verify true MIME type; extension-MIME mismatch is rejected |
| **File size limit** | Denial of service via large uploads | 10 MB per-file limit enforced before parsing |
| **Sandboxed code execution** | LLM-generated code executing system commands | `exec()` runs with restricted globals — only pandas, numpy, matplotlib, seaborn allowed; `os`, `subprocess`, `open`, `__import__` are all blocked |
| **Prompt injection detection** | User manipulating LLM context | 23 regex patterns scan for instruction overrides, context extraction, and role manipulation before the query reaches OpenAI |
| **Audit logging** | Undetected abuse or forensic analysis | Every upload, query, and blocked injection logged with timestamp and SHA-256 hashes — no raw user data in logs |
| **In-memory file handling** | Sensitive data persisting on disk | All files parsed into DataFrames via `BytesIO`; no temp files written to the filesystem |
| **Session TTL** | Stale data and resource exhaustion | Sessions expire after 60 minutes of inactivity; cleanup runs every 5 minutes |
| **Rate limiting** | API abuse and resource exhaustion | Per-IP limits: 10 queries/min on `/query`, 4 uploads/min on `/upload`; returns HTTP 429 with user-friendly frontend message |

### Sandboxed Execution

The most significant security risk is executing LLM-generated code. The sandbox mitigates this by:

- Constructing a restricted globals dict with **only** `df`, `pd`, `np`, `plt`, `sns`, and `BytesIO`
- Removing all Python builtins except a safe whitelist (`len`, `range`, `str`, `int`, `float`, `list`, `dict`, `sum`, `min`, `max`, `round`, `print`, `sorted`, `enumerate`, `zip`, `map`, `filter`, `abs`, `bool`, `tuple`, `set`, `isinstance`, `type`)
- Operating on a **copy** of the DataFrame so the original data is never mutated
- Catching and surfacing all exceptions as user-facing errors
- Blocking file system access, subprocess spawning, network calls, and dynamic imports

### Prompt Injection Detection

User queries are scanned against 23 regex patterns before being sent to OpenAI. These cover three categories:

1. **Instruction overrides** — e.g. *"ignore previous instructions"*, *"disregard your prompt"*
2. **Context extraction** — e.g. *"reveal your instructions"*, *"show the API key"*
3. **Role manipulation** — e.g. *"you are now a..."*, *"pretend you are"*, *"new instructions:"*

Flagged queries are rejected with HTTP 400 and logged in the audit trail with the matched pattern.

### File Type Validation Test

A test script (`fake_file.py`) is included to verify that magic byte validation works correctly. It generates a file named `fake.csv` that has a `.csv` extension but contains a Windows executable (PE) header:

```bash
python fake_file.py
```

Uploading the resulting `fake.csv` through the UI should be rejected — the backend reads the file's magic bytes, detects a MIME type mismatch (executable content disguised as CSV), and returns an error.

### Audit Trail

All operations are logged to `backend/audit.log` (rotating, max 5 MB, 3 backups). Sensitive data (filenames, queries) is hashed with SHA-256 so the log is useful for forensic analysis without exposing raw user data. Example entry:

```
[2026-03-18T06:59:47+00:00] QUERY session=202cd1b9 query_hash=c831e8657b4c5724
```

