"""
app.py
------
FastAPI HTTP server for the DEX-AI Agentic Text-to-SQL application.

Provides endpoints:
  - POST /api/query       : Natural-language question -> SQL generation & safe execution
  - GET  /api/schema      : Live database schema introspection (tables, columns, types, FKs)
  - GET  /api/health      : Status check (database connection, active LLM model)
  - GET  /api/sample-queries : Curated list of suggested questions for the UI

Run with:
    cd backend
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import time
import logging
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

# Import backend modules
try:
    from agents.sql_generator import generate_sql
    from service.query_executor import execute_query
    from schema import get_database_schema
    from connection import engine
except ImportError:
    import sys
    sys.path.append(os.path.dirname(__file__))
    from agents.sql_generator import generate_sql
    from service.query_executor import execute_query
    from schema import get_database_schema
    from connection import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dex-api")

app = FastAPI(
    title="DEX AI Text-to-SQL API",
    description="Agentic Natural Language to MySQL query pipeline powered by Groq LLM",
    version="1.0.0",
)

# Enable CORS for frontend dev server (Vite default: http://localhost:5173) and any local origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    question: str = Field(..., description="Natural language question to convert into SQL", min_length=1)


class QueryResponse(BaseModel):
    success: bool
    question: str
    sql: Optional[str] = None
    columns: Optional[List[str]] = None
    rows: Optional[List[Dict[str, Any]]] = None
    count: Optional[int] = None
    error: Optional[str] = None
    execution_time_ms: Optional[int] = None


@app.get("/api/health")
def health_check():
    """Verify backend status, MySQL connection, and active model."""
    db_connected = False
    db_name = None
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            db_name = conn.execute(text("SELECT DATABASE()")).scalar()
            db_connected = True
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")

    model_name = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

    return {
        "status": "healthy" if db_connected else "degraded",
        "database_connected": db_connected,
        "database_name": db_name,
        "model": model_name,
        "provider": "Groq LPU",
    }


@app.get("/api/schema")
def get_schema():
    """Inspect and return the database schema (tables, columns, types, primary & foreign keys)."""
    try:
        schema = get_database_schema()
        return {"success": True, "schema": schema}
    except Exception as exc:
        logger.error(f"Schema inspection error: {exc}")
        return {"success": False, "error": str(exc), "schema": {}}


@app.get("/api/sample-queries")
def get_sample_queries():
    """Suggested queries based on standard business intelligence tasks."""
    return {
        "categories": [
            {
                "category": "Employees & Salaries",
                "questions": [
                    "Show all employees.",
                    "Show the average salary of each department.",
                    "Find the department with the highest average salary.",
                    "Show employees earning more than 50000.",
                    "Count employees in each department.",
                    "Find the top 5 highest-paid employees."
                ]
            },
            {
                "category": "Locations & Analytics",
                "questions": [
                    "Find employees who work in Hyderabad.",
                    "Which employee generated the highest sales?",
                    "Calculate total sales for each month."
                ]
            }
        ]
    }


@app.post("/api/query", response_model=QueryResponse)
def run_query_endpoint(req: QueryRequest):
    """
    Agentic Text-to-SQL pipeline:
    1. Generates safe MySQL query using Groq LLM with exponential backoff & regex/sqlglot checks
    2. Safely executes the SELECT query against MySQL
    3. Returns query, column names, structured rows, record count, and execution time
    """
    start_time = time.perf_counter()
    question = req.question.strip()

    logger.info(f"Received question: {question}")

    # Step 1: SQL Generation
    gen_result = generate_sql(question)
    if not gen_result.get("success"):
        elapsed_ms = int((time.perf_counter() - start_time) * 1000)
        return QueryResponse(
            success=False,
            question=question,
            sql=None,
            columns=None,
            rows=None,
            count=0,
            error=gen_result.get("error", "Failed to generate SQL query."),
            execution_time_ms=elapsed_ms,
        )

    generated_sql = gen_result.get("sql")

    # Step 2: Safe MySQL Execution
    exec_result = execute_query(generated_sql)
    elapsed_ms = int((time.perf_counter() - start_time) * 1000)

    if not exec_result.get("success"):
        return QueryResponse(
            success=False,
            question=question,
            sql=generated_sql,
            columns=None,
            rows=None,
            count=0,
            error=exec_result.get("error", "Database query execution error."),
            execution_time_ms=elapsed_ms,
        )

    return QueryResponse(
        success=True,
        question=question,
        sql=generated_sql,
        columns=exec_result.get("columns", []),
        rows=exec_result.get("rows", []),
        count=exec_result.get("count", 0),
        error=None,
        execution_time_ms=elapsed_ms,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
