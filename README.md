# DEX-AI — Agentic Text-to-SQL Application

A production-ready **Natural Language → MySQL** pipeline powered by the **Groq API** (free tier) and `meta-llama/llama-4-scout-17b-16e-instruct`.

---

## Architecture

```
User Question
     │
     ▼
┌──────────────────────────┐
│   sql_generator.py       │  ← Groq LLM (Llama 4 Scout, free tier)
│   (agents/)              │    + retry / exponential back-off
│   • prompt engineering   │    + read-only enforcement
│   • SQL safety checks    │    + sqlglot syntax validation
└────────────┬─────────────┘
             │  validated SELECT
             ▼
┌──────────────────────────┐
│   query_executor.py      │  ← SQLAlchemy + MySQL
│   (service/)             │    + secondary read-only guard
│   • safe execution       │    + serialisable output
└──────────────────────────┘
             │  rows / error
             ▼
         Response
```

---

## Free LLM Provider Comparison

| Provider | Model | Free Tier | Context | Tool Calling | SQL Quality |
|----------|-------|-----------|---------|--------------|-------------|
| **Groq** ✅ | `meta-llama/llama-4-scout-17b-16e-instruct` | ✅ Yes (no CC) | 128 K | ✅ Yes | ⭐⭐⭐⭐⭐ |
| Groq | `llama-3.1-8b-instant` | ✅ Yes | 128 K | ✅ Yes | ⭐⭐⭐⭐ |
| Groq | `openai/gpt-oss-120b` | ✅ Yes | 128 K | ✅ Yes | ⭐⭐⭐⭐⭐ |
| Google Gemini | `gemini-2.0-flash` | ✅ Yes (AI Studio) | 1 M | ✅ Yes | ⭐⭐⭐⭐⭐ |
| Cerebras | `llama-3.3-70b` | ✅ Yes | 128 K | ✅ Yes | ⭐⭐⭐⭐ |
| SambaNova | `Meta-Llama-3.1-405B` | ✅ Yes | 16 K | ⚠️ Partial | ⭐⭐⭐ |
| NVIDIA NIM | various | ✅ 1 K credits | varies | ✅ Yes | ⭐⭐⭐⭐ |
| OpenRouter | various | ✅ \$1 free credits | varies | ✅ Yes | varies |
| Hugging Face | serverless inference | ✅ Limited | varies | ⚠️ Model-dependent | ⭐⭐⭐ |

> **Selected: Groq + Llama 4 Scout** — best combination of free access, speed (LPU), tool-calling, and SQL accuracy.

---

## Why `llama-3.3-70b-versatile` Stopped Working

Groq deprecated `llama-3.3-70b-versatile` on the free developer tier, effective **16 August 2026**.  
Any request to that model ID now returns:

```
Error code: 404 — model_not_found
```

**Fix:** Update `GROQ_MODEL` in `.env` to a currently active model.

---

## Quick Start

### 1. Prerequisites
- Python 3.10+
- MySQL 8.0 running locally
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 2. Clone & Set Up

```bash
git clone https://github.com/IrfanHussain1132/DEX-AI.git
cd DEX-AI/backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your MySQL credentials and Groq API key
```

### 4. Run

```bash
cd backend
python main.py
```

---

## Project Structure

```
DEX/
└── backend/
    ├── agents/
    │   ├── __init__.py
    │   └── sql_generator.py      ← LLM integration (Groq, retries, safety)
    ├── service/
    │   ├── __init__.py
    │   └── query_executor.py     ← Safe MySQL execution layer
    ├── connection.py             ← SQLAlchemy engine
    ├── schema.py                 ← Dynamic schema introspection
    ├── main.py                   ← App entry point + acceptance tests
    ├── test_connection.py        ← DB connectivity test
    ├── test_sql_generation.py    ← SQL generation smoke tests
    ├── requirements.txt
    ├── .env.example
    └── .gitignore
```

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Read-only enforcement | Regex guard + `SELECT`-only check in both generator and executor |
| SQL injection protection | No string interpolation; SQLAlchemy `text()` with parameterisation |
| Syntax validation | `sqlglot` parse check before execution |
| API key security | Environment variables only — never hardcoded |
| Rate-limit handling | `tenacity` exponential back-off (2 s → 4 s → 8 s → 60 s) |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GROQ_API_KEY` | Groq API key | **required** |
| `GROQ_MODEL` | Model ID | `meta-llama/llama-4-scout-17b-16e-instruct` |
| `MYSQL_HOST` | MySQL host | `localhost` |
| `MYSQL_PORT` | MySQL port | `3306` |
| `MYSQL_USER` | MySQL user | — |
| `MYSQL_PASSWORD` | MySQL password | — |
| `MYSQL_DATABASE` | Database name | — |

---

## Phase 4 Test Queries

| # | Natural Language | Expected |
|---|-----------------|----------|
| 1 | Show all employees | SELECT * FROM employees |
| 2 | Average salary per department | GROUP BY + AVG |
| 3 | Department with highest avg salary | ORDER BY + LIMIT 1 |
| 4 | Employees earning > 50 000 | WHERE salary > 50000 |
| 5 | Count employees per department | COUNT + GROUP BY |
| 6 | Top 5 highest-paid employees | ORDER BY salary DESC LIMIT 5 |

