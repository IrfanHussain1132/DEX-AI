"""
document_service.py
-------------------
Document Intelligence Service for DEX-AI.
Extracts text from uploaded PDF documents and provides RAG / LLM Q&A
via the Groq API.
"""

import io
import os
import json
import uuid
import time
import logging
from typing import Optional, Dict, Any

from pypdf import PdfReader
from groq import Groq, APIStatusError, APIConnectionError, RateLimitError
from dotenv import load_dotenv
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

logger = logging.getLogger("dex_document_service")

load_dotenv()

API_KEY = os.getenv("GROQ_API_KEY")
MODEL = os.getenv("GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")

client = Groq(api_key=API_KEY) if API_KEY else None

# Upload directory inside backend
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
DOCS_INDEX_FILE = os.path.join(UPLOAD_DIR, "documents_index.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory document registry for fast access
_DOCUMENTS_CACHE: Dict[str, Dict[str, Any]] = {}


def _load_index():
    """Load existing documents index from disk into memory."""
    global _DOCUMENTS_CACHE
    if os.path.exists(DOCS_INDEX_FILE):
        try:
            with open(DOCS_INDEX_FILE, "r", encoding="utf-8") as f:
                _DOCUMENTS_CACHE = json.load(f)
        except Exception as e:
            logger.warning("Could not load documents index: %s", e)
            _DOCUMENTS_CACHE = {}


def _save_index():
    """Persist documents index to disk."""
    try:
        with open(DOCS_INDEX_FILE, "w", encoding="utf-8") as f:
            json.dump(_DOCUMENTS_CACHE, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.error("Failed to save documents index: %s", e)


# Initialize cache from disk on startup
_load_index()


def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """
    Extract text and page count from raw PDF bytes using pypdf.
    Returns (extracted_text, page_count).
    """
    reader = PdfReader(io.BytesIO(file_bytes))
    page_count = len(reader.pages)
    text_chunks = []

    for i, page in enumerate(reader.pages):
        page_text = page.extract_text() or ""
        page_text = page_text.strip()
        if page_text:
            text_chunks.append(f"--- Page {i + 1} ---\n{page_text}")

    full_text = "\n\n".join(text_chunks).strip()
    return full_text, page_count


def save_and_process_document(file_bytes: bytes, filename: str) -> dict:
    """
    Save an uploaded PDF, extract its content, and register it in the document store.
    """
    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    safe_filename = os.path.basename(filename) or "document.pdf"
    storage_filename = f"{doc_id}_{safe_filename}"
    file_path = os.path.join(UPLOAD_DIR, storage_filename)

    # 1. Save original PDF file to disk
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # 2. Extract text
    try:
        extracted_text, page_count = extract_text_from_pdf(file_bytes)
    except Exception as exc:
        logger.error("Error reading PDF %s: %s", filename, exc)
        raise ValueError(f"Failed to parse PDF: {exc}")

    if not extracted_text:
        extracted_text = "[Notice: No readable text could be extracted from this PDF. It may contain scanned images or be protected.]"

    doc_record = {
        "id": doc_id,
        "document_id": doc_id,
        "filename": safe_filename,
        "name": safe_filename,
        "file_path": file_path,
        "page_count": page_count,
        "char_count": len(extracted_text),
        "created_at": time.time(),
        "status": "Ready",
        "text": extracted_text,
    }

    # Store in cache and persist
    _DOCUMENTS_CACHE[doc_id] = doc_record
    _save_index()

    logger.info("Processed document %s (%s): %d pages, %d chars", doc_id, safe_filename, page_count, len(extracted_text))

    return {
        "success": True,
        "id": doc_id,
        "document_id": doc_id,
        "filename": safe_filename,
        "name": safe_filename,
        "page_count": page_count,
        "status": "Ready",
        "message": f"Successfully parsed {page_count} page(s).",
    }


def find_document(identifier: Optional[str] = None) -> Optional[dict]:
    """
    Find a document by id, document_id, filename, or fallback to the most recent.
    """
    if not _DOCUMENTS_CACHE:
        _load_index()

    if not _DOCUMENTS_CACHE:
        return None

    if identifier:
        # 1. Exact ID match
        if identifier in _DOCUMENTS_CACHE:
            return _DOCUMENTS_CACHE[identifier]

        # 2. Match by document_id or filename
        for doc in _DOCUMENTS_CACHE.values():
            if doc.get("document_id") == identifier or doc.get("filename") == identifier or doc.get("name") == identifier:
                return doc

        # 3. Partial match on ID or filename (e.g. prefix or timestamp-name)
        for doc in _DOCUMENTS_CACHE.values():
            if identifier in doc.get("id", "") or identifier in doc.get("filename", "") or doc.get("filename", "") in identifier:
                return doc

    # Fallback to the most recently created document
    sorted_docs = sorted(
        _DOCUMENTS_CACHE.values(),
        key=lambda d: d.get("created_at", 0),
        reverse=True
    )
    return sorted_docs[0] if sorted_docs else None


@retry(
    retry=retry_if_exception_type((RateLimitError, APIConnectionError)),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(4),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _call_groq_doc_qa(system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
    """Call Groq chat completion for Document Q&A with retries."""
    if not client:
        raise ValueError("GROQ_API_KEY is not configured.")

    completion = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.1,
        max_tokens=max_tokens,
    )
    return completion.choices[0].message.content or ""


def ask_document_question(question: str, document_id: Optional[str] = None) -> dict:
    """
    Ask a question against an uploaded document.
    """
    t_start = time.perf_counter()

    if not question or not question.strip():
        return {
            "success": False,
            "answer": None,
            "error": "Question cannot be empty.",
            "execution_time": 0,
        }

    question = question.strip()
    doc = find_document(document_id)

    if not doc:
        return {
            "success": False,
            "answer": None,
            "error": "No document found. Please upload a PDF document first using the Attach button or drag-and-drop.",
            "execution_time": round((time.perf_counter() - t_start) * 1000, 1),
        }

    doc_text = doc.get("text", "")
    doc_name = doc.get("filename", "Uploaded Document")

    # Limit context text if extremely huge (> 150,000 characters) to avoid context limit
    if len(doc_text) > 150000:
        doc_text = doc_text[:150000] + "\n\n[... Remaining content truncated for length ...]"

    # Determine response size: factual questions → 500 tokens, summaries → 900
    is_summary = any(w in question.lower() for w in ["summar", "overview", "describe", "explain", "tell me about", "what is"])
    max_tok = 900 if is_summary else 500

    system_prompt = """You are DEX AI — a precise document analyst. Answer questions about documents concisely.

RULES (follow strictly):
1. Answer ONLY what is asked. Do not add unrelated info.
2. For factual questions (name, GPA, date, number): answer in 1-3 lines max.
3. For summaries: use 4-6 bullet points max, each under 20 words.
4. NEVER use markdown tables (no | col | syntax).
5. NEVER use HTML tags (<br>, <b>, <div>, etc.).
6. NEVER start with "Based on the document..." or "The document states...".
7. Use plain bullet points (•) for lists. No nested bullets.
8. No introductory or closing filler sentences."""

    user_prompt = f"""Document: {doc_name}

---
{doc_text}
---

Question: {question}"""

    try:
        raw_answer = _call_groq_doc_qa(system_prompt, user_prompt, max_tokens=max_tok)
        elapsed_ms = round((time.perf_counter() - t_start) * 1000, 1)

        # Sanitize any stray html tags or <br>
        import re
        clean_answer = re.sub(r"<br\s*/?>", "\n", raw_answer, flags=re.IGNORECASE)
        clean_answer = re.sub(r"</?[a-zA-Z0-9]+[^>]*>", "", clean_answer).strip()

        return {
            "success": True,
            "answer": clean_answer,
            "document_id": doc.get("id"),
            "document_name": doc_name,
            "execution_time": elapsed_ms,
            "error": None,
        }

    except RateLimitError as exc:
        logger.error("Rate limit calling Groq for document QA: %s", exc)
        return {
            "success": False,
            "answer": None,
            "error": "Groq API rate limit reached. Please wait a few moments and try again.",
            "execution_time": round((time.perf_counter() - t_start) * 1000, 1),
        }
    except APIStatusError as exc:
        logger.error("Groq API error (%s): %s", exc.status_code, exc.message)
        return {
            "success": False,
            "answer": None,
            "error": f"AI service error: {exc.message}",
            "execution_time": round((time.perf_counter() - t_start) * 1000, 1),
        }
    except Exception as exc:
        logger.exception("Unexpected error during document Q&A: %s", exc)
        return {
            "success": False,
            "answer": None,
            "error": f"Failed to analyze document: {str(exc)}",
            "execution_time": round((time.perf_counter() - t_start) * 1000, 1),
        }

