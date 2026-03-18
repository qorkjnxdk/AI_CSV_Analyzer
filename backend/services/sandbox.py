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

    # Check if a chart was created
    fig = plt.gcf()
    if fig.get_axes():
        fig.savefig(chart_buf, format="png", bbox_inches="tight", dpi=150)
        plt.close("all")
        chart_buf.seek(0)
        chart_b64 = base64.b64encode(chart_buf.read()).decode("utf-8")
        text = restricted_globals.get("result", "")
        return {
            "type": "chart",
            "data": chart_b64,
            "text": str(text) if text else "",
            "code": code,
        }

    plt.close("all")

    result = restricted_globals.get("result")
    result_table = restricted_globals.get("result_table")

    # Convert result_table to table dict if present
    table_part = None
    if isinstance(result_table, pd.DataFrame):
        table_part = {
            "columns": result_table.columns.tolist(),
            "rows": _sanitize_rows(result_table.head(500).values.tolist()),
        }
    elif isinstance(result_table, pd.Series):
        rt_df = result_table.reset_index()
        table_part = {
            "columns": rt_df.columns.tolist(),
            "rows": _sanitize_rows(rt_df.head(500).values.tolist()),
        }

    # Both result and result_table set → return multi
    if table_part is not None and result is not None:
        return {
            "type": "multi",
            "data": [
                {"type": "scalar", "data": str(result)},
                {"type": "table", "data": table_part},
            ],
            "code": code,
        }

    # Only result_table set
    if table_part is not None:
        return {"type": "table", "data": table_part, "code": code}

    if result is None:
        return {"type": "text", "data": "Code executed but no result variable was set.", "code": code}

    if isinstance(result, pd.DataFrame):
        return {
            "type": "table",
            "data": {
                "columns": result.columns.tolist(),
                "rows": _sanitize_rows(result.head(500).values.tolist()),
            },
            "code": code,
        }

    if isinstance(result, pd.Series):
        result_df = result.reset_index()
        return {
            "type": "table",
            "data": {
                "columns": result_df.columns.tolist(),
                "rows": _sanitize_rows(result_df.head(500).values.tolist()),
            },
            "code": code,
        }

    return {"type": "scalar", "data": str(result), "code": code}
