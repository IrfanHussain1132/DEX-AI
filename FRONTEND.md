# DEX AI — Text-to-SQL Frontend

A modern, responsive React + Vite frontend specifically designed for the **Agentic Text-to-SQL** engine.

## Features

- **Live LLM Model & Database Telemetry**: Displays the active Groq model (e.g. `openai/gpt-oss-120b` or `meta-llama/llama-4-scout-17b-16e-instruct`), MySQL connection status, and read-only mode guarantee.
- **Natural Language Querying**: Asks questions in plain English and triggers Groq LPU acceleration.
- **SQL Code Inspector**: Formatted SQL syntax highlighting with one-click copy and read-only verification pill.
- **Interactive Results Table**: Displays columns and rows returned from MySQL, row count, search filter, and "Export CSV".
- **Database Schema Drawer**: Inspect tables (`employees`, `departments`, `salaries`, `sales`), column types, primary keys, and foreign keys.
- **Session History & Sample Queries**: Quickly re-run recent questions or trigger curated business queries.

---

## Getting Started

### 1. Start the Backend API Server

In a terminal:

```bash
cd backend

# Activate Python virtual environment (Windows)
..\venv\Scripts\activate

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Start FastAPI server on port 8000
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

The backend API will run at `http://localhost:8000` with interactive docs at `http://localhost:8000/docs`.

### 2. Start the Frontend Dev Server

In a second terminal:

```bash
# In the project root (c:\Users\irfan\Downloads\plan b\DEX)
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Configuration

The frontend connects by default to `http://localhost:8000`. You can configure custom settings in `.env.local`:

```ini
VITE_API_BASE_URL=http://localhost:8000
```
