import io
import math
import base64
import traceback
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

SAFE_BUILTINS = {
    "len": len,
    "range": range,
    "str": str,
    "int": int,
    "float": float,
    "list": list,
    "dict": dict,
    "sum": sum,
    "min": min,
    "max": max,
    "round": round,
    "print": print,
    "sorted": sorted,
    "enumerate": enumerate,
    "zip": zip,
    "map": map,
    "filter": filter,
    "abs": abs,
    "bool": bool,
    "tuple": tuple,
    "set": set,
    "isinstance": isinstance,
    "type": type,
    "True": True,
    "False": False,
    "None": None,
}


def _sanitize(val):
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def _sanitize_rows(rows):
    return [[_sanitize(cell) for cell in row] for row in rows]


def execute_sandboxed(code: str, df: pd.DataFrame) -> dict:
    """Execute LLM-generated pandas code in a restricted sandbox.

    Returns a dict with keys:
        - type: "scalar" | "table" | "chart" | "text" | "error"
        - data: the result content
    """
    chart_buf = io.BytesIO()

    restricted_globals = {
        "__builtins__": SAFE_BUILTINS,
        "pd": pd,
        "np": np,
        "plt": plt,
        "sns": sns,
        "df": df.copy(),
        "chart_buf": chart_buf,
        "BytesIO": io.BytesIO,
    }

    # Detect non-code responses (e.g. LLM refusals or explanations)
    try:
        compile(code, "<generated>", "exec")
    except SyntaxError:
        return {"type": "text", "data": code}

    try:
        exec(code, restricted_globals)
    except SyntaxError:
        # Text that slipped past the compile check — treat as a text response
        return {"type": "text", "data": code}
    except Exception as e:
        return {"type": "error", "data": f"{type(e).__name__}: {e}", "code": code}

    # --- Collect all output parts (order: answer → table → chart) ---
    parts = []

    # 1. Scalar / text answer from `result`
    result = restricted_globals.get("result")
    if result is not None:
        if isinstance(result, pd.DataFrame):
            parts.append({
                "type": "table",
                "data": {
                    "columns": result.columns.tolist(),
                    "rows": _sanitize_rows(result.head(500).values.tolist()),
                },
            })
            result = None  # handled as table, don't duplicate
        elif isinstance(result, pd.Series):
            result_df = result.reset_index()
            parts.append({
                "type": "table",
                "data": {
                    "columns": result_df.columns.tolist(),
                    "rows": _sanitize_rows(result_df.head(500).values.tolist()),
                },
            })
            result = None
        else:
            parts.append({"type": "scalar", "data": str(result)})

    # 2. Table from `result_table`
    result_table = restricted_globals.get("result_table")
    if isinstance(result_table, pd.DataFrame):
        parts.append({
            "type": "table",
            "data": {
                "columns": result_table.columns.tolist(),
                "rows": _sanitize_rows(result_table.head(500).values.tolist()),
            },
        })
    elif isinstance(result_table, pd.Series):
        rt_df = result_table.reset_index()
        parts.append({
            "type": "table",
            "data": {
                "columns": rt_df.columns.tolist(),
                "rows": _sanitize_rows(rt_df.head(500).values.tolist()),
            },
        })

    # 3. Chart from matplotlib
    fig = plt.gcf()
    if fig.get_axes():
        fig.savefig(chart_buf, format="png", bbox_inches="tight", dpi=150)
        chart_buf.seek(0)
        chart_b64 = base64.b64encode(chart_buf.read()).decode("utf-8")
        parts.append({"type": "chart", "data": chart_b64})
    plt.close("all")

    # --- Return based on how many parts we collected ---
    if len(parts) == 0:
        return {"type": "text", "data": "Code executed but no result variable was set.", "code": code}

    if len(parts) == 1:
        return {**parts[0], "code": code}

    return {"type": "multi", "data": parts, "code": code}
