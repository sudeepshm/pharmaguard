"""
PharmaGuard — Pydantic models matching the mandatory JSON output schema.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Enums ─────────────────────────────────────────────────────────

class RiskLabel(str, Enum):
    """Allowed risk labels per output schema."""
    Safe = "Safe"
    AdjustDosage = "Adjust Dosage"
    Toxic = "Toxic"
    Ineffective = "Ineffective"
    Unknown = "Unknown"


class Severity(str, Enum):
    """Allowed severity levels per output schema."""
    none = "none"
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


# ── Sub-models ────────────────────────────────────────────────────

class RiskAssessment(BaseModel):
    """Risk assessment for a drug–gene interaction."""
    risk_label: str = Field(..., description="Safe | Adjust Dosage | Toxic | Ineffective | Unknown")
    confidence_score: float = Field(..., ge=0, le=1, description="0–1 confidence")
    severity: str = Field(..., description="none | low | moderate | high | critical")


class DetectedVariant(BaseModel):
    """A single pharmacogenomic variant detected in the VCF."""
    rsid: str = Field(..., description="dbSNP rsID, e.g. rs12248560")
    genotype: Optional[str] = Field(None, description="e.g. 0/1")
    effect: Optional[str] = Field(None, description="Functional effect, e.g. Reduced Function")


class PharmacogenomicProfile(BaseModel):
    """Patient's pharmacogenomic profile for a specific gene."""
    primary_gene: str = Field(..., description="Gene symbol, e.g. CYP2D6")
    diplotype: str = Field(..., description="Star-allele diplotype, e.g. *1/*2")
    phenotype: str = Field(..., description="PM | IM | NM | RM | URM | Unknown")
    detected_variants: List[DetectedVariant] = Field(default_factory=list, description="Variants detected for this gene")


class ClinicalRecommendation(BaseModel):
    """Structured clinical recommendation."""
    recommendation: str = Field(..., description="Clinical action text")
    dosing_guidance: Optional[str] = Field(None, description="Specific dosing info")
    cpic_guideline: Optional[str] = Field(None, description="CPIC guideline reference")
    cpic_level: Optional[str] = Field(None, description="CPIC evidence level (A, B, C, D)")


class LLMExplanation(BaseModel):
    """AI-generated explanation of the pharmacogenomic finding."""
    summary: str = Field(..., description="Plain-language summary")
    mechanism: Optional[str] = Field(None, description="Biological mechanism")


class QualityMetrics(BaseModel):
    """Quality metrics for the analysis run."""
    vcf_parsing_success: bool = True
    total_variants_extracted: int = 0
    pharmacogenes_found: int = 0


# ── Top-level result model ───────────────────────────────────────

class DrugAnalysisResult(BaseModel):
    """
    Complete analysis result for a single drug.
    Matches the mandatory JSON output schema.
    """
    patient_id: str = Field(..., description="Patient identifier")
    drug: str
    timestamp: datetime
    risk_assessment: RiskAssessment
    pharmacogenomic_profile: PharmacogenomicProfile
    clinical_recommendation: ClinicalRecommendation
    llm_generated_explanation: LLMExplanation
    quality_metrics: QualityMetrics

    model_config = ConfigDict(populate_by_name=True)


# ── Request models ───────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    """Request body accompanying the VCF file upload."""
    patient_id: str = Field("PATIENT_001", description="Patient identifier")
    drugs: List[str] = Field(..., min_length=1, description="List of drugs to analyze")


# ── Response wrapper ─────────────────────────────────────────────

class AnalysisResponse(BaseModel):
    """Wrapper for the full analysis response."""
    status: str = "success"
    results: List[DrugAnalysisResult] = []
    errors: List[str] = []
