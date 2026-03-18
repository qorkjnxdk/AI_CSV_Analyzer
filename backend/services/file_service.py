import io
import pandas as pd
from security.magic_bytes import validate_file_type

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def parse_file(file_bytes: bytes, filename: str) -> dict[str, pd.DataFrame]:
    """Parse an uploaded file into a dict of {sheet_name: DataFrame}.

    Raises ValueError on invalid file type or size.

    Checks Magic Bytes of the file to ensure files are not being renamed .csv to bypass the upload check.
    """
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValueError(f"File exceeds 10MB limit ({len(file_bytes)} bytes)")

    is_valid, mime = validate_file_type(file_bytes, filename)
    if not is_valid:
        raise ValueError(
            f"Invalid file type: detected MIME '{mime}'. "
            "Only CSV and Excel files are accepted."
        )

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    buf = io.BytesIO(file_bytes)

    if ext == "csv" or mime in ("text/plain", "text/csv", "application/csv"):
        df = pd.read_csv(buf)
        return {"Sheet1": df}

    if ext in ("xls", "xlsx") or mime in (
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ):
        xls = pd.ExcelFile(buf)
        return {name: xls.parse(name) for name in xls.sheet_names}

    raise ValueError(f"Unsupported file extension: .{ext}")
