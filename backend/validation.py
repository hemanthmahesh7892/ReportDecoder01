import logging
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
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Must be PDF, JPEG, PNG, or WEBP.",
        )
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_SIZE // (1024 * 1024)} MB.",
        )
