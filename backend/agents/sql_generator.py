"""
sql_generator.py
----------------
Agentic Text-to-SQL generator using the Groq API.

Model  : meta-llama/llama-4-scout-17b-16e-instruct  (free-tier, tool-calling)
Retry  : exponential back-off via tenacity (handles rate-limits & transient errors)
Safety : read-only enforcement + SQL injection guard via sqlglot parse validation
"""

import os
import re
import json
import logging

from groq import Groq, APIStatusError, APIConnectionError, RateLimitError
from dotenv import load_dotenv
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

try:
    import sqlglot
    SQLGLOT_AVAILABLE = True
except ImportError:
    SQLGLOT_AVAILABLE = False

try:
    from ..schema import get_database_schema         # package import: backend.agents → backend.schema
except ImportError:
    try:
        from schema import get_database_schema       # run directly: python agents/sql_generator.py
    except ImportError:
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from schema import get_database_schema       # last-resort fallback

# ─────────────────────────── Logging ──────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────── Configuration ────────────────────────────────────
load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")
MODEL   = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

if not API_KEY:
    raise ValueError(
        "GROQ_API_KEY is not set. "
        "Add it to your .env file: GROQ_API_KEY=gsk_..."
    )

client = Groq(api_key=API_KEY)

# Disallowed SQL statement types (read-only guard)
_FORBIDDEN_KEYWORDS = re.compile(
    r"^\s*(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE|CALL|EXEC)\b",
    re.IGNORECASE | re.MULTILINE,
)

# ─────────────────────────── Prompt builders ──────────────────────────────────
def _build_system_prompt() -> str:
    return """You are an expert MySQL 8.0 database engineer.

TASK: Convert the user's natural-language question into a single, correct MySQL SELECT query.

STRICT RULES:
1. Use ONLY the tables and columns that exist in the provided schema.
2. Generate valid MySQL 8.0 syntax.
3. Use proper JOIN conditions based on foreign keys listed in the schema.
4. Use meaningful column aliases (e.g. AS avg_salary).
5. NEVER generate INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, REPLACE, CALL, or EXEC.
6. Generate ONLY a single SELECT statement — nothing else.
7. Do NOT invent table names or column names.
8. Use LIMIT when the user requests a specific number of records.
9. Return ONLY the raw SQL — no markdown, no explanation, no code fences.
10. If the question cannot be answered from the schema, respond with exactly: UNSUPPORTED_QUESTION"""


def _build_user_prompt(question: str, schema: dict) -> str:
    schema_text = json.dumps(schema, indent=2)
    return f"""DATABASE SCHEMA:
{schema_text}

USER QUESTION:
{question}

Generate the MySQL query (SELECT only). Output raw SQL with no formatting."""


# ─────────────────────────── SQL safety checks ────────────────────────────────
def _is_read_only(sql: str) -> bool:
    """Return True only if the statement is a SELECT (read-only)."""
    stripped = sql.strip()
    if not stripped.upper().startswith("SELECT"):
        return False
    if _FORBIDDEN_KEYWORDS.search(stripped):
        return False
    return True


def _validate_sql_syntax(sql: str) -> tuple[bool, str]:
    """
    Use sqlglot to validate MySQL syntax.
    Returns (is_valid: bool, error_message: str).
    """
    if not SQLGLOT_AVAILABLE:
        return True, ""  # skip validation if library not installed

    try:
        parsed = sqlglot.parse(sql, dialect="mysql")
        if not parsed or parsed[0] is None:
            return False, "sqlglot could not parse the SQL statement."
        return True, ""
    except sqlglot.errors.ParseError as exc:
        return False, str(exc)


# ─────────────────────────── Groq call with retries ──────────────────────────
@retry(
    retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _call_groq(system_prompt: str, user_prompt: str) -> str:
    """
    Call the Groq chat-completions endpoint.
    Retries on rate-limit (429) and transient connection errors with
    exponential back-off: 2 s → 4 s → 8 s (max 60 s), up to 4 attempts.
    """
    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0,          # deterministic output for SQL
        max_tokens=512,
    )
    return completion.choices[0].message.content or ""


# ─────────────────────────── Response cleaner ─────────────────────────────────
def _extract_sql(raw: str) -> str:
    """Strip markdown fences and whitespace from the LLM response."""
    text = raw.strip()

    # Remove ```sql ... ``` or ``` ... ```
    text = re.sub(r"^```(?:sql)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$",         "", text)

    return text.strip()


# ─────────────────────────── Public API ───────────────────────────────────────
def generate_sql(question: str) -> dict:
    """
    Convert a natural-language question to a validated MySQL SELECT query.

    Returns a dict:
        {
            "success": bool,
            "sql":     str | None,
            "error":   str | None,
        }
    """
    if not question or not question.strip():
        return {"success": False, "sql": None, "error": "Empty question provided."}

    question = question.strip()
    logger.info("Processing question: %s", question)

    try:
        # 1. Fetch live database schema
        database_schema = get_database_schema()

        # 2. Build prompts
        system_prompt = _build_system_prompt()
        user_prompt   = _build_user_prompt(question, database_schema)

        # 3. Call LLM (with automatic retry on rate-limits / connection errors)
        raw_response = _call_groq(system_prompt, user_prompt)
        logger.debug("Raw LLM response: %s", raw_response)

        # 4. Clean up the response
        sql = _extract_sql(raw_response)

        # 5. Handle explicit "I can't answer this" sentinel
        if sql.upper() == "UNSUPPORTED_QUESTION":
            return {
                "success": False,
                "sql":     None,
                "error":   "The question cannot be answered from the available schema.",
            }

        # 6. Read-only enforcement (SQL injection / mutation guard)
        if not _is_read_only(sql):
            logger.warning("Rejected non-SELECT output: %s", sql)
            return {
                "success": False,
                "sql":     None,
                "error":   "Generated statement is not a safe SELECT query. Request rejected.",
            }

        # 7. Syntax validation
        valid, syntax_error = _validate_sql_syntax(sql)
        if not valid:
            logger.warning("SQL syntax validation failed: %s", syntax_error)
            return {
                "success": False,
                "sql":     None,
                "error":   f"Generated SQL has a syntax error: {syntax_error}",
            }

        logger.info("SQL generated successfully.")
        return {"success": True, "sql": sql, "error": None}

    except RateLimitError as exc:
        logger.error("Groq rate limit exceeded after retries: %s", exc)
        return {
            "success": False,
            "sql":     None,
            "error":   "Groq API rate limit exceeded. Please wait a moment and try again.",
        }

    except APIStatusError as exc:
        logger.error("Groq API error %s: %s", exc.status_code, exc.message)
        return {
            "success": False,
            "sql":     None,
            "error":   f"Groq API error ({exc.status_code}): {exc.message}",
        }

    except APIConnectionError as exc:
        logger.error("Groq connection error: %s", exc)
        return {
            "success": False,
            "sql":     None,
            "error":   "Could not reach the Groq API. Check your internet connection.",
        }

    except Exception as exc:
        logger.exception("Unexpected error during SQL generation.")
        return {
            "success": False,
            "sql":     None,
            "error":   f"Unexpected error: {exc}",
        }


# ─────────────────────────── Quick smoke-test ─────────────────────────────────
if __name__ == "__main__":
    test_question = "Find the top 5 highest-paid employees."
    result = generate_sql(test_question)

    print("\nQUESTION :", test_question)
    print("SUCCESS  :", result["success"])
    print("SQL      :", result["sql"])
    if result["error"]:
        print("ERROR    :", result["error"])
