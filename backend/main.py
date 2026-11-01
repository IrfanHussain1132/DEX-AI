"""
main.py
-------
Entry point for the Agentic Text-to-SQL application.

Run:
    cd backend
    python main.py

The script:
  1. Verifies the MySQL connection.
  2. Runs 6 Phase-4 acceptance tests (natural language → SQL → MySQL results).
  3. Checks invalid-question handling.
  4. Checks SQL-injection / mutation-attempt rejection.
"""

import sys
import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

# ── allow running from the backend/ directory directly ──────────────────────
try:
    from agents.sql_generator  import generate_sql
    from service.query_executor import execute_query
    from connection             import engine
except ImportError:
    from agents.sql_generator  import generate_sql
    from service.query_executor import execute_query
    from connection             import engine

# ─────────────────────────── Logging ────────────────────────────────────────
logging.basicConfig(
    level=logging.WARNING,          # keep console clean during tests
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

SEPARATOR = "=" * 70


def print_header(title: str) -> None:
    print(f"\n{SEPARATOR}")
    print(f"  {title}")
    print(SEPARATOR)


def run_query(question: str, expect_success: bool = True) -> None:
    """Generate SQL from `question`, execute it, and pretty-print the result."""
    print(f"\n📝 QUESTION : {question}")

    # Step 1 — generate SQL
    gen = generate_sql(question)

    if not gen["success"]:
        status = "✅ (expected)" if not expect_success else "❌"
        print(f"   SQL Gen  : FAILED {status}")
        print(f"   Error    : {gen['error']}")
        return

    sql = gen["sql"]
    print(f"   SQL      : {sql}")

    # Step 2 — execute SQL
    res = execute_query(sql)

    if not res["success"]:
        print(f"   Exec     : ❌ FAILED — {res['error']}")
        return

    print(f"   Rows     : {res['count']}")
    if res["rows"]:
        # Print first 5 rows as a quick preview
        for i, row in enumerate(res["rows"][:5]):
            print(f"   [{i+1}] {row}")
        if res["count"] > 5:
            print(f"   ... and {res['count'] - 5} more row(s).")
    else:
        print("   (no rows returned)")


# ─────────────────────────── Database connectivity check ────────────────────
def verify_connection() -> None:
    print_header("Step 1 — Database Connection Check")
    try:
        with engine.connect() as conn:
            db_name = conn.execute(text("SELECT DATABASE()")).scalar()
            print(f"   ✅  Connected to MySQL database: {db_name}")
    except SQLAlchemyError as exc:
        print(f"   ❌  MySQL connection failed: {exc}")
        sys.exit(1)


# ─────────────────────────── Phase 4 acceptance tests ───────────────────────
PHASE_4_QUESTIONS = [
    "Show all employees.",
    "Show the average salary of each department.",
    "Find the department with the highest average salary.",
    "Show employees earning more than 50000.",
    "Count employees in each department.",
    "Find the top 5 highest-paid employees.",
]

INVALID_QUESTIONS = [
    "What is the weather in Paris?",            # off-schema question
    "How many planets are in the solar system?", # completely unrelated
]

INJECTION_ATTEMPTS = [
    "DROP TABLE employees",                     # direct DDL attempt
    "Show all employees; DELETE FROM employees", # stacked statement attempt
]


def run_phase_4_tests() -> None:
    print_header("Step 2 — Phase 4: Acceptance Tests")
    for q in PHASE_4_QUESTIONS:
        run_query(q, expect_success=True)


def run_invalid_question_tests() -> None:
    print_header("Step 3 — Invalid Question Handling")
    for q in INVALID_QUESTIONS:
        run_query(q, expect_success=False)


def run_injection_protection_tests() -> None:
    print_header("Step 4 — SQL Injection / Mutation Protection")
    for q in INJECTION_ATTEMPTS:
        run_query(q, expect_success=False)


# ─────────────────────────── Main ───────────────────────────────────────────
if __name__ == "__main__":
    print("\n🚀  Agentic Text-to-SQL Application")
    print("   Model  :", __import__("os").getenv("GROQ_MODEL",
                                                 "meta-llama/llama-4-scout-17b-16e-instruct"))

    verify_connection()
    run_phase_4_tests()
    run_invalid_question_tests()
    run_injection_protection_tests()

    print(f"\n{SEPARATOR}")
    print("  ✅  All test phases completed.")
    print(SEPARATOR)
