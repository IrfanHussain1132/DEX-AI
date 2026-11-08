"""
api.py
------
FastAPI HTTP server for DEX-AI — Agentic Text-to-SQL application.

Endpoints
---------
  POST /api/query          — Natural language → SQL → MySQL results
  GET  /api/health         — Database + LLM connectivity check
  GET  /api/schema         — Live database schema (table / column info)

Run:
    cd backend
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

CORS is configured for the Vite dev-server (http://localhost:5173)
and can be extended via the ALLOWED_ORIGINS env var.
"""

import os
import time
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

# ── local imports ────────────────────────────────────────────────────────────
try:
    from agents.sql_generator   import generate_sql
    from service.query_executor import execute_query
    from connection             import engine
    from schema                 import get_database_schema
except ImportError:
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from agents.sql_generator   import generate_sql
    from service.query_executor import execute_query
    from connection             import engine
    from schema                 import get_database_schema

# ── logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("dex_api")

# ── CORS origins ──────────────────────────────────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173,http://localhost:3000")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="DEX AI — Agentic Text-to-SQL API",
    description="Natural language to MySQL query pipeline powered by Groq + Llama 4 Scout.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ────────────────────────────────────────────────
class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000, description="Natural language question")


class QueryResponse(BaseModel):
    success: bool
    question: str
    sql: Optional[str] = None
    columns: Optional[list] = None
    rows: Optional[list] = None
    count: Optional[int] = None
    execution_time: Optional[float] = None   # milliseconds
    error: Optional[str] = None


# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s", request.url)
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": f"Internal server error: {exc}"},
    )


# ── POST /api/query ───────────────────────────────────────────────────────────
@app.post("/api/query", response_model=QueryResponse)
async def query_database(body: QueryRequest):
    """
    Convert a natural-language question into a MySQL query and return results.

    Flow:
        1. Validate input
        2. Generate SQL via Groq LLM (with retry + safety checks)
        3. Execute the query against MySQL
        4. Return structured response with timing metadata
    """
    question = body.question.strip()
    logger.info("Received question: %s", question)

    t_start = time.perf_counter()

    # ── Step 1: SQL generation ────────────────────────────────────────────────
    gen = generate_sql(question)

    if not gen["success"]:
        elapsed = round((time.perf_counter() - t_start) * 1000, 1)
        return QueryResponse(
            success=False,
            question=question,
            error=gen["error"],
            execution_time=elapsed,
        )

    sql = gen["sql"]

    # ── Step 2: Query execution ───────────────────────────────────────────────
    result = execute_query(sql)
    elapsed = round((time.perf_counter() - t_start) * 1000, 1)

    if not result["success"]:
        return QueryResponse(
            success=False,
            question=question,
            sql=sql,
            error=result["error"],
            execution_time=elapsed,
        )

    logger.info(
        "Query completed in %.1f ms — %d row(s) returned.", elapsed, result["count"]
    )

    return QueryResponse(
        success=True,
        question=question,
        sql=sql,
        columns=result["columns"],
        rows=result["rows"],
        count=result["count"],
        execution_time=elapsed,
    )


# ── GET /api/health ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """
    Check database connectivity and return current configuration.
    Used by the frontend statusbar to show 'All systems operational'.
    """
    db_ok = False
    db_name = None
    db_error = None
    table_count = 0

    try:
        with engine.connect() as conn:
            db_name = conn.execute(text("SELECT DATABASE()")).scalar()
            tables = conn.execute(text("SHOW TABLES")).fetchall()
            table_count = len(tables)
            db_ok = True
    except SQLAlchemyError as exc:
        db_error = str(exc)
        logger.error("Health check — DB error: %s", exc)

    model = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

    return {
        "status": "ok" if db_ok else "degraded",
        "database": {
            "connected": db_ok,
            "name": db_name,
            "table_count": table_count,
            "error": db_error,
        },
        "llm": {
            "provider": "Groq",
            "model": model,
        },
        "version": "1.0.0",
    }


# ── GET /api/schema ───────────────────────────────────────────────────────────
@app.get("/api/schema")
async def get_schema():
    """Return the live database schema (tables, columns, keys)."""
    try:
        schema = get_database_schema()
        return {"success": True, "schema": schema, "table_count": len(schema)}
    except Exception as exc:
        logger.error("Schema fetch error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Could not retrieve schema: {exc}")


# ── Document endpoints ────────────────────────────────────────────────────────
# These stubs return a clear, friendly message so the frontend shows an
# informative error instead of a raw 404.  Replace with real PDF/RAG logic
# (e.g. LangChain + ChromaDB) when you add document intelligence.

class DocumentAskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    document_id: Optional[str] = None


@app.post("/api/documents/upload")
async def upload_document(request: Request):
    """
    Document upload endpoint.
    Currently not implemented — returns a helpful 501 response.
    """
    logger.info("Document upload attempted — feature not yet configured.")
    return JSONResponse(
        status_code=501,
        content={
            "success": False,
            "error": (
                "Document Intelligence is not yet configured. "
                "This feature requires a PDF parser and a vector store (e.g. ChromaDB). "
                "Switch to 'Database query' mode to query your MySQL data."
            ),
        },
    )


@app.post("/api/documents/ask")
async def ask_document(body: DocumentAskRequest):
    """
    Document Q&A endpoint.
    Currently not implemented — returns a helpful 501 response.
    """
    logger.info("Document ask attempted — feature not yet configured.")
    return JSONResponse(
        status_code=501,
        content={
            "success": False,
            "error": (
                "Document Intelligence is not yet configured. "
                "Switch to 'Database query' mode to query your MySQL data with natural language."
            ),
        },
    )


# ── Dev entry-point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)

