# DEX AI frontend

## Run locally

```sh
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` to the HTTP API origin. Endpoint paths can be changed with `VITE_QUERY_ENDPOINT`, `VITE_DOCUMENT_UPLOAD_ENDPOINT`, and `VITE_DOCUMENT_ASK_ENDPOINT`.

## Existing backend status

The repository's Python backend currently exposes module functions and a command-line runner, but no HTTP server or API routes. The frontend therefore cannot reach the existing Python functions directly. It sends requests to configurable HTTP endpoints and displays connection/API errors without supplying fake results. The default paths are `/api/query`, `/api/documents/upload`, and `/api/documents/ask`; set the environment variables to the real paths when an HTTP API is available.

The frontend expects:

- `POST /api/query` with `{ "question": "..." }`. The response may include `success`, `sql`, `columns`, `rows`, `count`, `error`, and optional `execution_time`.
- `POST /api/documents/upload` as multipart form data with a `file` field. The response should identify the document with `id` or `document_id` and may include `filename` or `name`.
- `POST /api/documents/ask` with `{ "question": "...", "document_id": "..." }`. The response may include `answer` or `response`.

The existing backend files were not changed.
