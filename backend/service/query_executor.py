"""
query_executor.py
-----------------
Safe, read-only MySQL query executor.

Security guarantees:
  - Only SELECT statements are executed.
  - Uses parameterised SQLAlchemy `text()` — no string interpolation.
  - Returns serialisable Python dicts (handles datetime, Decimal, etc.).
"""

import re
import logging
from decimal import Decimal
from datetime import date, datetime

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

try:
    from .connection import engine          # package import
except ImportError:
    from connection import engine           # direct / __main__ import

logger = logging.getLogger(__name__)

_FORBIDDEN = re.compile(
    r"^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|CALL|EXEC)\b",
    re.IGNORECASE | re.MULTILINE,
)


def _serialize(value):
    """Convert non-JSON-serialisable types to strings."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def execute_query(sql: str) -> dict:
    """
    Execute a read-only SQL query against the MySQL database.

    Parameters
    ----------
    sql : str
        A validated SELECT statement (already checked by sql_generator).

    Returns
    -------
    dict
        {
            "success": bool,
            "columns": list[str] | None,
            "rows":    list[dict] | None,
            "count":   int | None,
            "error":   str | None,
        }
    """
    if not sql or not sql.strip():
        return {"success": False, "columns": None, "rows": None, "count": None,
                "error": "Empty SQL query provided."}

    sql = sql.strip()

    # Secondary read-only guard (defence-in-depth)
    if not sql.upper().startswith("SELECT"):
        return {"success": False, "columns": None, "rows": None, "count": None,
                "error": "Only SELECT queries are allowed."}

    if _FORBIDDEN.search(sql):
        return {"success": False, "columns": None, "rows": None, "count": None,
                "error": "Query contains a forbidden keyword."}

    try:
        with engine.connect() as conn:
            result = conn.execute(text(sql))
            columns = list(result.keys())
            rows = [
                {col: _serialize(val) for col, val in zip(columns, row)}
                for row in result.fetchall()
            ]

        logger.info("Query executed — %d row(s) returned.", len(rows))
        return {
            "success": True,
            "columns": columns,
            "rows":    rows,
            "count":   len(rows),
            "error":   None,
        }

    except SQLAlchemyError as exc:
        logger.error("Database execution error: %s", exc)
        return {
            "success": False,
            "columns": None,
            "rows":    None,
            "count":   None,
            "error":   f"Database error: {exc}",
        }

    except Exception as exc:
        logger.exception("Unexpected error during query execution.")
        return {
            "success": False,
            "columns": None,
            "rows":    None,
            "count":   None,
            "error":   f"Unexpected error: {exc}",
        }


if __name__ == "__main__":
    result = execute_query("SELECT DATABASE()")
    print(result)
