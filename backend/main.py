"""Report Decoder — Backend.

FastAPI service that accepts medical reports and returns
patient-friendly explanations via the Gemini API.
"""

import asyncio
import json
import logging
from typing import Union

import fitz  # PyMuPDF
import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from gemini_client import get_model
from models import AnalysisResponse

load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_MIME: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
})
MAX_SIZE: int = 4 * 1024 * 1024  # 4 MB
MAX_PDF_PAGES: int = 3
PDF_RENDER_ZOOM: float = 2.0
MAX_RETRIES: int = 2
RETRY_DELAY_SECONDS: float = 1.0

# Whitelist of allowed language values to prevent prompt-injection attacks.
ALLOWED_LANGUAGES: frozenset[str] = frozenset({
    "English",
    "Hindi",
    "Kannada",
    "Tamil",
    "Telugu",
    "Malayalam",
    "Marathi",
    "Bengali",
})

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="Report Decoder API",
    version="1.0.0",
    description="Accepts medical reports and returns patient-friendly explanations via the Gemini API.",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler that hides internal stack traces from clients."""
    logger.exception("Unhandled exception for %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://reportdecoder-ten.vercel.app"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_language(language: str) -> str:
    """Validate and sanitize the language parameter.

    Returns the language if it is in the allow-list, otherwise defaults
    to ``"English"``.  This prevents prompt-injection via the language
    form field.

    Args:
        language: The raw language string from the request.

    Returns:
        A safe, validated language string.

    """
    cleaned = language.strip()
    if cleaned in ALLOWED_LANGUAGES:
        return cleaned
    logger.warning("Rejected unsupported language value: %r — defaulting to English", language)
    return "English"


def _build_prompt(language: str) -> str:
    """Build the system prompt for the Gemini model.

    Args:
        language: The validated target language for the explanation.

    Returns:
        A fully-formed prompt string including the JSON schema.

    """
    return f"""You are a patient-friendly medical report explainer.

Analyze the uploaded medical document (prescription, lab report, or other medical document).

CRITICAL REQUIREMENT: YOU MUST TRANSLATE ALL OF YOUR ANALYSIS AND EXPLANATIONS INTO **{language}**!
The JSON keys MUST remain in English, but every single string VALUE inside the JSON MUST be written in {language}.
If you write the values in English instead of {language}, you have failed.
DO NOT use English for the values. USE {language} ONLY!

RULES:
1. Write ALL text fields in **{language}** using simple, everyday words that any patient can understand.
2. Never diagnose or prescribe. Always advise consulting a qualified doctor.
3. If the document is unreadable or not a medical document, say so clearly in the summary field (IN {language}) and leave all lists empty.
4. For medicines, include timing (morning/afternoon/night) and whether to take before/after/any food.
5. For lab values, indicate if each value is normal, high, or low and explain what it means in simple terms.
6. Highlight any red flags that need urgent medical attention.
7. Suggest 3 to 5 questions the patient should ask their doctor.
8. Always include a disclaimer that this is an educational tool and not medical advice.

Return a valid JSON object matching this schema exactly:
{json.dumps(AnalysisResponse.model_json_schema(), indent=2)}"""


def _render_pdf_to_images(file_bytes: bytes) -> list[dict[str, Union[str, bytes]]]:
    """Render a PDF's pages into PNG image blobs for the AI model.

    Args:
        file_bytes: Raw bytes of the uploaded PDF file.

    Returns:
        A list of dicts with ``mime_type`` and ``data`` keys suitable
        for the Gemini ``generate_content`` call.

    Raises:
        HTTPException: If PyMuPDF cannot open or render the PDF.

    """
    try:
        doc = fitz.open("pdf", file_bytes)
        images: list[dict[str, Union[str, bytes]]] = []
        for page_num in range(min(MAX_PDF_PAGES, len(doc))):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(PDF_RENDER_ZOOM, PDF_RENDER_ZOOM))
            images.append({
                "mime_type": "image/png",
                "data": pix.tobytes("png"),
            })
        doc.close()
        return images
    except Exception as exc:
        logger.error("Failed to render PDF: %s", exc)
        raise HTTPException(status_code=400, detail=f"Failed to process PDF: {exc}") from exc


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
@limiter.limit("10/minute")
async def health(request: Request) -> dict[str, str]:
    """Liveness / readiness check endpoint."""
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalysisResponse)
@limiter.limit("5/minute")
async def analyze(
    request: Request,
    file: UploadFile = File(...),  # noqa: B008
    language: str = Form("English"),
) -> AnalysisResponse:
    """Analyze a medical document and return a patient-friendly explanation.

    Accepts an uploaded image or PDF along with a target language and
    returns a structured ``AnalysisResponse`` produced by the Gemini
    vision-language model.

    Args:
        request: The incoming HTTP request (used by SlowAPI).
        file: The uploaded medical document (image or PDF, max 4 MB).
        language: The target language for the explanation (default:
            ``"English"``).

    Returns:
        An :class:`AnalysisResponse` containing the decoded report.

    Raises:
        HTTPException: On invalid file type (400), oversized file (413),
            PDF rendering failure (400), or AI backend errors (502).

    """
    # --- validate mime type ---
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. "
                   f"Allowed: {', '.join(sorted(ALLOWED_MIME))}",
        )

    # --- validate size ---
    file_bytes: bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes)} bytes). Max allowed: {MAX_SIZE} bytes (4 MB).",
        )

    # --- sanitize language ---
    safe_language: str = _sanitize_language(language)

    # --- build prompt ---
    prompt: str = _build_prompt(safe_language)
    content_parts: list[Union[str, dict[str, Union[str, bytes]]]] = [prompt]

    # --- Process file into images ---
    if file.content_type == "application/pdf":
        content_parts.extend(_render_pdf_to_images(file_bytes))
    else:
        content_parts.append({
            "mime_type": file.content_type,
            "data": file_bytes,
        })

    # --- call Gemini with retry ---
    response_text: str = ""
    for attempt in range(MAX_RETRIES):
        try:
            model = get_model()
            response = model.generate_content(
                content_parts,
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                    response_mime_type="application/json",
                ),
            )
            response_text = response.text
            logger.info("Gemini responded successfully on attempt %d", attempt + 1)
            break
        except Exception as exc:
            logger.warning("Gemini API error (attempt %d/%d): %s", attempt + 1, MAX_RETRIES, exc)
            if attempt == MAX_RETRIES - 1:
                raise HTTPException(
                    status_code=502,
                    detail=f"Gemini API error after retries: {exc}. Please try again later.",
                ) from exc
            await asyncio.sleep(RETRY_DELAY_SECONDS)

    # --- parse response ---
    try:
        result: dict = json.loads(response_text)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error("Failed to parse Gemini JSON: %s — raw: %s", exc, response_text[:200])
        raise HTTPException(status_code=502, detail=f"Failed to parse Gemini response: {exc}") from exc

    return AnalysisResponse(**result)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)  # noqa: S104
