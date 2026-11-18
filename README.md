# DEX AI — Enterprise Intelligence

> **Agentic Text-to-SQL + Document Intelligence** powered by Groq LLM, FastAPI, MySQL, and React.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Lucide Icons |
| Backend | FastAPI + Uvicorn |
| Database | MySQL (`company_analytics`) |
| LLM | Groq API (`openai/gpt-oss-120b`) |
| PDF Parsing | pypdf |

---

## Local Development

### 1. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
cp .env.example .env           # fill in your values
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend
```bash
npm install
npm run dev
# → http://localhost:5173
```

---

## Environment Variables (backend/.env)

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=company_analytics

GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

ALLOWED_ORIGINS=http://localhost:5173
```

---

## Deployment

### Recommended Stack

| Service | What deploys there | Free tier |
|---|---|---|
| **Railway** | FastAPI backend | ✅ 500 hrs/month |
| **Vercel** | React frontend | ✅ Unlimited |
| **PlanetScale / Aiven** | MySQL database | ✅ Free hobby tier |

### Deploy Backend → Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select this repo → set **Root Directory** to `backend`
3. Railway auto-detects the `Dockerfile` and builds it
4. Add environment variables in Railway dashboard (all from `.env.example`)
5. Copy the generated Railway URL (e.g. `https://dex-ai-backend.up.railway.app`)

### Deploy Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → import this repo
2. Set **Framework Preset** = `Vite`
3. Add environment variable:
   ```
   VITE_API_BASE_URL = https://dex-ai-backend.up.railway.app
   ```
4. Click Deploy → get your Vercel URL

### After both are deployed

Go back to Railway → add one more env var:
```
ALLOWED_ORIGINS = https://your-app.vercel.app
```

Then redeploy Railway backend.

### MySQL in Production

Use a hosted MySQL — free options:
- **[Aiven](https://aiven.io)** — free 1-month trial, then \$19/mo
- **[Railway MySQL plugin](https://railway.app)** — add MySQL service inside Railway project ✅ easiest
- **[PlanetScale](https://planetscale.com)** — MySQL-compatible, free hobby tier

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | DB + LLM status |
| GET | `/api/schema` | Live MySQL schema |
| POST | `/api/query` | Natural language → SQL → results |
| POST | `/api/documents/upload` | Upload PDF |
| POST | `/api/documents/ask` | Ask question about PDF |
