"""Pydantic response models for the Report Decoder API.

These models define the structured JSON contract between the Gemini AI
response and the frontend client.  All fields use sensible defaults so
that partial AI responses degrade gracefully.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Medicine(BaseModel):
    """A single medication entry extracted from a medical document.

    Attributes:
        name: Commercial or generic name of the medicine.
        purpose: Brief description of what the medicine is prescribed for.
        dosage: Prescribed dosage (e.g. ``"500 mg"``).
        timing: When to take the medicine (e.g. ``"morning, night"``).
        with_food: Whether to take before, after, or with food.
        notes: Any additional notes (e.g. ``"Complete the full course"``).

    """

    name: str = Field(default="")
    purpose: str = Field(default="")
    dosage: str = Field(default="")
    timing: str = Field(default="")
    with_food: str = Field(default="")
    notes: str = Field(default="")


class LabValue(BaseModel):
    """A single lab-test value extracted from a report.

    Attributes:
        name: Name of the lab parameter (e.g. ``"Hemoglobin"``).
        value: The reported value as a string (e.g. ``"14.5"``).
        normal_range: The reference range (e.g. ``"12-16 g/dL"``).
        status: Whether the value is ``"normal"``, ``"high"``, or ``"low"``.
        meaning: A patient-friendly explanation of the result.

    """

    name: str = Field(default="")
    value: str = Field(default="")
    normal_range: str = Field(default="")
    status: Literal["normal", "high", "low"] = Field(default="normal")
    meaning: str = Field(default="")


class AnalysisResponse(BaseModel):
    """Top-level response returned by the ``/analyze`` endpoint.

    Attributes:
        summary: A plain-language summary of the entire document.
        document_type: Classification of the uploaded document.
        medicines: List of extracted medicines (empty for lab reports).
        lab_values: List of extracted lab values (empty for prescriptions).
        red_flags: Critical findings requiring urgent attention.
        doctor_questions: Suggested questions for the patient's next visit.
        disclaimer: A mandatory medical disclaimer.

    """

    summary: str = Field(default="")
    document_type: Literal["prescription", "lab_report", "other"] = Field(default="other")
    medicines: list[Medicine] = Field(default_factory=list)
    lab_values: list[LabValue] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)
    doctor_questions: list[str] = Field(default_factory=list)
    disclaimer: str = Field(default="")
