"""Gemini API client helper for the Report Decoder.

This module provides a thin wrapper around the ``google.generativeai``
library, centralising configuration and model instantiation so that the
rest of the application can remain decoupled from the SDK.
"""

import logging
import os

import google.generativeai as genai

logger = logging.getLogger(__name__)

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

_client_configured: bool = False


def configure_client() -> None:
    """Configure the Gemini SDK with the project API key.

    This function is idempotent — repeated calls after the first
    successful configuration are no-ops.

    Raises:
        RuntimeError: If the ``GEMINI_API_KEY`` environment variable is
            not set or is empty.

    """
    global _client_configured
    if _client_configured:
        return

    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY environment variable is not set.")
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env"
        )

    genai.configure(api_key=GEMINI_API_KEY)
    _client_configured = True
    logger.info("Gemini client configured successfully with model=%s", GEMINI_MODEL)


def get_model() -> genai.GenerativeModel:
    """Return a configured ``GenerativeModel`` instance.

    Ensures the SDK is configured before returning the model.

    Returns:
        genai.GenerativeModel: A ready-to-use Gemini model instance.

    Raises:
        RuntimeError: Propagated from :func:`configure_client` when the
            API key is missing.

    """
    configure_client()
    return genai.GenerativeModel(GEMINI_MODEL)


def reset_client() -> None:
    """Reset the client configuration state.

    This is primarily intended for use in tests so that the module-level
    singleton state can be cleanly reset between test cases.
    """
    global _client_configured
    _client_configured = False
    logger.debug("Gemini client configuration reset.")
