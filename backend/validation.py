import logging
import fitz
from fastapi import HTTPException, UploadFile
from config import ALLOWED_LANGUAGES, ALLOWED_MIME, MAX_SIZE

logger = logging.getLogger(__name__)

def sanitize_language(language: str) -> str:
    cleaned = language.strip()
    if cleaned in ALLOWED_LANGUAGES:
        return cleaned
    logger.warning("Rejected unsupported language value: %r — defaulting to English", language)
    return "English"

def validate_file(file: UploadFile, file_bytes: bytes) -> None:
    if len(file_bytes) > MAX_SIZE:
        logger.warning("Rejected file upload: file exceeds %d bytes", MAX_SIZE)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_SIZE // (1024 * 1024)} MB.",
        )

    # Magic byte checks for security
    if file_bytes.startswith(b"%PDF-"):
        mime = "application/pdf"
    elif file_bytes.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif file_bytes.startswith(b"RIFF") and file_bytes[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        logger.warning("Rejected file upload: signature does not match allowed types")
        raise HTTPException(status_code=400, detail="Invalid file signature. Spoofed file type detected.")

    if mime not in ALLOWED_MIME or (file.content_type and file.content_type not in ALLOWED_MIME):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Must be PDF, JPEG, PNG, or WEBP.",
        )

    # Cap PDF page count
    if mime == "application/pdf":
        try:
            doc = fitz.open("pdf", file_bytes)
            if len(doc) > 10:
                logger.warning("Rejected PDF upload: too many pages (%d)", len(doc))
                raise HTTPException(status_code=400, detail="PDF has too many pages. Maximum allowed is 10.")
            doc.close()
        except Exception:
            logger.warning("Rejected PDF upload: could not parse PDF")
            raise HTTPException(status_code=400, detail="Invalid or corrupt PDF file.")

