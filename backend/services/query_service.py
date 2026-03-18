import os
import json
import logging
import httpx
import pandas as pd
from dotenv import load_dotenv

logger = logging.getLogger("uvicorn.error")

load_dotenv()                         # backend/.env
load_dotenv(dotenv_path="../.env")    # project root .env

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"

SYSTEM_PROMPT = """You are a data analysis assistant. You receive metadata about a pandas DataFrame and a user question.
Your job is to generate Python/pandas code that answers the question or just a string that answers their question if code cannot be ran for this query.  

You have two options, returning code that helps query the table that answers their prompt OR
returning a string that answers the user's query (e.g. about semantic meaning of the rows).

Format the answer as {"type": "code"/"string", "result": generated code/string}

Rules:
- The DataFrame is available as `df`.
- pandas is imported as `pd`, numpy as `np`, matplotlib.pyplot as `plt`, seaborn as `sns`.
- Store the final answer in a variable called `result` (can be a scalar, string, DataFrame, or Series). When `result` is a scalar or summary value, make it a descriptive string with context from the question, e.g. `result = "Number of passengers in Pclass 3: 96"` instead of just `result = 96`.
- If you also need to display a separate table (e.g. "show all rows where X and count them"), store the DataFrame in `result_table` and the summary value in `result`.
- If the question also asks for a chart/plot, generate matplotlib/seaborn code in the same script. The chart will be captured automatically.
- You can combine any of these three outputs in a single script: `result` (answer), `result_table` (table), and a matplotlib chart. They will all be displayed together in order: answer → table → chart.
- If the question asks for an explanation, description, or meaning of a column or the data (not a computation), set `result` to a plain-text string with your answer. Do NOT run any data queries for these questions.
- For charts:
  - Always add a clear, descriptive title and axis labels.
  - Use appropriate chart types: bar charts for categorical comparisons, histograms for distributions, line charts for trends over time, scatter plots for correlations, pie charts only for proportions with few categories.
  - Add value labels/annotations on bars when there are fewer than 10 categories.
  - Use a clean style: `plt.style.use('seaborn-v0_8-whitegrid')` or similar.
  - Use `plt.tight_layout()` before the figure is captured.
  - Sort categorical axes meaningfully (e.g. by value descending, or natural order).
  - Use readable colors — prefer seaborn palettes like `sns.color_palette("muted")`.
  - Rotate x-axis labels with `plt.xticks(rotation=45, ha='right')` if they are long or numerous.
  - If the user doesn't specify a chart type, choose the most appropriate one for the data.
- Do NOT import any modules.
- Do NOT use open(), os, subprocess, or __import__.
- Do NOT access the file system or network.
- Keep the code concise and correct."""


def build_prompt(df: pd.DataFrame, question: str) -> str:
    col_info = []
    for col in df.columns:
        col_info.append(f"  - {col} ({df[col].dtype})")

    sample = df.head(5).to_string(index=False)

    return (
        f"DataFrame info:\n"
        f"- Shape: {df.shape[0]} rows x {df.shape[1]} columns\n"
        f"- Columns:\n" + "\n".join(col_info) + "\n\n"
        f"Sample rows:\n{sample}\n\n"
        f"Question: {question}"
    )


async def ask_openai(df: pd.DataFrame, question: str) -> dict:
    """Send a question to OpenAI and return generated code or a text response.

    Returns a dict with:
        - type: "code" | "text"
        - data: the content string
    """
    user_prompt = build_prompt(df, question)

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            OPENAI_URL,
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENAI_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0,
                "max_tokens": 1024,
            },
        )
        response.raise_for_status()
        data = response.json()

    # Check for refusal in the API response
    refusal = data["choices"][0]["message"].get("refusal")
    if refusal:
        return {"type": "text", "data": refusal}

    content = data["choices"][0]["message"]["content"].strip()
    logger.info("[LLM raw response]\n%s", content)
    # Strip markdown fences if the model wraps the response
    if content.startswith("```"):
        lines = content.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        content = "\n".join(lines)

    # Parse the structured JSON response from the LLM
    try:
        parsed = json.loads(content)
        resp_type = parsed.get("type", "")
        result = parsed.get("result", "")

        if resp_type == "string":
            return {"type": "text", "data": result}
        if resp_type == "code":
            return {"type": "code", "data": result}
    except (json.JSONDecodeError, AttributeError):
        pass

    # Fallback: if not valid JSON, try to detect code vs text
    try:
        compile(content, "<generated>", "exec")
    except SyntaxError:
        return {"type": "text", "data": content}

    return {"type": "code", "data": content}
