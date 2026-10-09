import os

from dotenv import load_dotenv

load_dotenv()

# Environment settings
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
REDIS_URL = os.getenv("REDIS_URL", "")

# Upload constraints
MAX_SIZE = int(os.getenv("MAX_SIZE", str(10 * 1024 * 1024)))  # 10 MB
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "3"))

# Validations
ALLOWED_MIME: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
})

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

# Gemini constraints
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "2"))
RETRY_DELAY_SECONDS = float(os.getenv("RETRY_DELAY_SECONDS", "1.0"))
PDF_RENDER_ZOOM = float(os.getenv("PDF_RENDER_ZOOM", "2.0"))

# CORS
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "https://reportdecoder-ten.vercel.app")
