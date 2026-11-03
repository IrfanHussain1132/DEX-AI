# DEX-AI — Agentic Text-to-SQL Application

A production-ready **Natural Language → MySQL** pipeline powered by **Groq LPU Acceleration** and modern LLM models (`openai/gpt-oss-120b` / `meta-llama/llama-4-scout-17b-16e-instruct`).

Featuring a high-performance **FastAPI backend** and a clean, modern **React + Vite dark-theme frontend**.

---

## Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────┐
 │                React + Vite Frontend (UI)                   │
 │  • Active Model Telemetry     • Natural Language Composer   │
 │  • SQL Syntax Highlighter     • Interactive Results Table   │
 │  • Live Schema Explorer       • CSV Export & History        │
 └──────────────────────────────┬──────────────────────────────┘
                                │ HTTP / JSON (REST API)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                 FastAPI Backend (app.py)                    │
 │   POST /api/query   •   GET /api/schema   • GET /api/health │
 └──────────────┬──────────────────────────────┬───────────────┘
                │                              │
                ▼                              ▼
 ┌─────────────────────────────┐  ┌────────────────────────────┐
 │  Groq LLM (Text-to-SQL)     │  │  MySQL Database Executor   │
 │  • LPU ultra-low latency    │  │  • SQLAlchemy Connection   │
 │  • Exponential Backoff      │  │  • Read-only SELECT Guard  │
 │  • SQL Syntax Validation    │  │  • Data Serialization      │
 └─────────────────────────────┘  └────────────────────────────┘
```

---

## Features

- **Dynamic Model Telemetry**: Automatically displays the active Groq model (e.g. `openai/gpt-oss-120b` or `meta-llama/llama-4-scout-17b-16e-instruct`), MySQL database connection status, and read-only mode guarantee.
- **Natural Language Querying**: Asks questions in plain English and receives accurate MySQL queries and formatted results in seconds.
- **SQL Inspector**: Syntax-highlighted SQL block with one-click copy and security badges (`Read-Only Verified`, `MySQL 8.0`).
- **Interactive Results Table**: Displays columns and rows returned from MySQL, row count, search filter, and instant **Export to CSV**.
- **Live Database Schema Explorer**: Slide-out drawer to inspect tables (`employees`, `departments`, `salaries`, `sales`), column data types, primary keys, and foreign keys.
- **Query History & Curated Samples**: Click-to-ask sample questions or re-run prior queries from history.

---

## Quick Start Guide

### 1. Backend Setup

```bash
cd backend

# Activate virtual environment (Windows)
..\venv\Scripts\activate

# Install backend dependencies
pip install -r requirements.txt

# Start FastAPI server on port 8000
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000` (API documentation at `http://localhost:8000/docs`).

### 2. Frontend Setup

In a separate terminal:

```bash
# In the project root directory
npm install

# Start Vite dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Project Structure

```
DEX/
├── backend/
│   ├── agents/
│   │   ├── __init__.py
│   │   └── sql_generator.py      ← Groq LLM integration, retries, safety checks
│   ├── service/
│   │   ├── __init__.py
│   │   └── query_executor.py     ← Safe MySQL execution layer
│   ├── app.py                    ← FastAPI HTTP server (endpoints for UI)
│   ├── connection.py             ← SQLAlchemy engine & connection pool
│   ├── schema.py                 ← Live database schema introspection
│   ├── main.py                   ← CLI test runner & acceptance tests
│   ├── test_connection.py        ← DB connectivity test
│   ├── requirements.txt          ← Python dependencies
│   ├── .env                      ← Private environment variables (ignored by Git)
│   └── .env.example              ← Template configuration
├── src/
│   ├── services/
│   │   └── api.js                ← Axios client connecting to backend API
│   ├── App.jsx                   ← Main Text-to-SQL React UI
│   ├── main.jsx                  ← Application entry point
│   └── styles.css                ← Dark-theme modern styling
├── index.html                    ← HTML shell
├── package.json                  ← Frontend dependencies (React, Vite, Lucide)
├── FRONTEND.md                   ← Frontend documentation
└── README.md                     ← Main documentation
```

---

## Security Guarantees

| Feature | Implementation |
|---------|----------------|
| **Read-Only Enforcement** | Regex keyword guard + strict `SELECT`-only check in both generator and executor |
| **SQL Injection Protection** | No raw string interpolation; SQLAlchemy `text()` with parameterisation |
| **Syntax Validation** | `sqlglot` parse check before execution |
| **Rate-Limit Resilience** | `tenacity` exponential back-off (2 s → 4 s → 8 s → 60 s) |
| **API Key Protection** | Environment variables only — never committed or leaked to client |

---

## API Endpoints

- `POST /api/query`: Accepts `{ "question": "..." }` and returns `{ "success": true, "sql": "...", "columns": [...], "rows": [...], "count": N, "execution_time_ms": M }`
- `GET /api/schema`: Returns introspected database tables, columns, constraints, and foreign keys.
- `GET /api/health`: Returns service health status, MySQL connection, and active Groq model name.
- `GET /api/sample-queries`: Returns suggested queries organized by category.
