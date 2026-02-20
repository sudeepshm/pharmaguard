"""
PharmaGuard — Analysis router (Module 7: Full end-to-end pipeline).

Flow:  VCF Upload → Parse → Haplotype Match → Clinical Engine → RAG → LLM → JSON
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, File, Form, UploadFile, HTTPException

from app.models.schemas import (
    AnalysisResponse,
    DrugAnalysisResult,
    RiskAssessment,
    PharmacogenomicProfile,
    DetectedVariant,
    ClinicalRecommendation,
    LLMExplanation,
    QualityMetrics,
)
from app.config import get_settings

# ── Service imports ───────────────────────────────────────────────────
from app.services.vcf_parser import parse_vcf, validate_vcf_content
from app.services.haplotype_matcher import match_haplotypes, HaplotypeResult
from app.services.clinical_engine import assess_drugs, ClinicalResult
from app.services.rag_engine import RAGEngine
from app.services.llm_generator import (
    LLMGenerator, ExplanationInput, ExplanationOutput,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Analysis"])

settings = get_settings()
MAX_SIZE = settings.MAX_VCF_SIZE_MB * 1024 * 1024  # 5 MB

# ── Lazy-initialised singletons ───────────────────────────────────────
_rag_engine: RAGEngine | None = None
_llm_generator: LLMGenerator | None = None


def _get_rag_engine() -> RAGEngine:
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine()
        _rag_engine.initialize(
            gemini_api_key=settings.GEMINI_API_KEY,
            pinecone_api_key=settings.PINECONE_API_KEY,
            pinecone_index=settings.PINECONE_INDEX,
        )
    return _rag_engine


def _get_llm_generator() -> LLMGenerator:
    global _llm_generator
    if _llm_generator is None:
        _llm_generator = LLMGenerator()
        _llm_generator.initialize(gemini_api_key=settings.GEMINI_API_KEY)
    return _llm_generator


# ── Main endpoint ─────────────────────────────────────────────────────

@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(
    vcf_file: UploadFile = File(..., description="VCF file (.vcf) to analyze"),
    patient_id: str = Form("PATIENT_001", description="Patient identifier"),
    drugs: str = Form(..., description="Comma-separated drugs, e.g. CODEINE,WARFARIN"),
):
    """
    Upload a VCF file and a list of drugs to receive pharmacogenomic
    risk analysis with AI-generated explanations.

    **Full Pipeline** (Modules 1-7):
    1. Validate & parse VCF file
    2. Extract pharmacogenomic variants
    3. Assign star allele diplotypes & phenotypes
    4. Look up CPIC clinical recommendations per drug
    5. Retrieve RAG context for each finding
    6. Generate LLM explanations
    7. Return structured JSON output
    """
    errors: List[str] = []

    # ── 1. Validate file ──────────────────────────────────────
    if not vcf_file.filename or not vcf_file.filename.endswith(".vcf"):
        raise HTTPException(status_code=400, detail="File must be a .vcf file.")

    content = await vcf_file.read()

    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"VCF file exceeds {settings.MAX_VCF_SIZE_MB} MB limit.",
        )

    is_valid, error_msg = validate_vcf_content(content)
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"Invalid VCF: {error_msg}")

    # ── 2. Parse drug list ────────────────────────────────────
    drug_list: List[str] = [d.strip().upper() for d in drugs.split(",") if d.strip()]
    if not drug_list:
        raise HTTPException(status_code=400, detail="At least one drug is required.")

    # ── 3. Parse VCF (Module 2) ───────────────────────────────
    logger.info("Parsing VCF for patient %s ...", patient_id)
    parse_result = parse_vcf(content, sample_id=patient_id)

    if not parse_result.success:
        raise HTTPException(
            status_code=422,
            detail=f"VCF parsing failed: {'; '.join(parse_result.errors)}",
        )

    logger.info(
        "VCF parsed: %d variants, %d pharmacogene variants, %d genes",
        parse_result.total_variants,
        len(parse_result.pharmacogene_variants),
        len(parse_result.genes_found),
    )

    # ── 4. Haplotype matching (Module 3) ──────────────────────
    variant_dicts = [
        {
            "rsid": v.rsid,
            "genotype": v.genotype,
            "gene": v.gene,
            "ref": v.ref,
            "alt": v.alt,
            "chrom": v.chrom,
            "pos": v.pos,
        }
        for v in parse_result.pharmacogene_variants
    ]

    haplo_result: HaplotypeResult = match_haplotypes(variant_dicts)

    logger.info("Haplotype matching: %d genes analysed", haplo_result.genes_analysed)
    if haplo_result.errors:
        errors.extend(haplo_result.errors)

    # ── 5. Clinical decision engine (Module 4) ────────────────
    gene_phenotypes: Dict[str, str] = {
        gene: dr.phenotype
        for gene, dr in haplo_result.gene_results.items()
    }

    clinical_result: ClinicalResult = assess_drugs(gene_phenotypes, drug_list)

    logger.info("Clinical engine: %d drugs assessed", clinical_result.drugs_assessed)
    if clinical_result.warnings:
        errors.extend(clinical_result.warnings)

    # ── 6. Build per-drug results ─────────────────────────────
    rag_engine = _get_rag_engine()
    llm_gen = _get_llm_generator()

    results: List[DrugAnalysisResult] = []

    # Group clinical recommendations by drug
    drug_recs: Dict[str, list] = {}
    for rec in clinical_result.recommendations:
        drug_recs.setdefault(rec.drug, []).append(rec)

    for drug in drug_list:
        recs = drug_recs.get(drug, [])

        # Pick the most severe recommendation for this drug
        if recs:
            severity_order = {"critical": 4, "high": 3, "moderate": 2, "low": 1}
            recs.sort(key=lambda r: severity_order.get(r.severity, 0), reverse=True)
            primary_rec = recs[0]
        else:
            primary_rec = None

        # Determine the primary gene for this drug
        primary_gene = primary_rec.gene if primary_rec and primary_rec.gene != "N/A" else "N/A"
        diplotype_result = haplo_result.gene_results.get(primary_gene)

        # ── Effect resolution helpers ──────────────────────
        # Filter variants to the primary gene
        if primary_gene != "N/A":
            gene_variants = [
                v for v in parse_result.pharmacogene_variants
                if v.gene == primary_gene
            ]
        else:
            gene_variants = list(parse_result.pharmacogene_variants)

        # Map allele function names to standardised labels
        _EFFECT_MAP = {
            "no function": "No Function",
            "loss of function": "No Function",
            "reduced function": "Reduced Function",
            "decreased function": "Decreased Function",
            "normal function": "Normal Function",
            "increased function": "Increased Function",
        }

        def _resolve_effect(gt: str) -> str:
            """Derive human-readable effect from genotype + haplotype allele."""
            if not gt or gt in (".", "./."):
                return "Normal Function"
            norm = gt.replace("|", "/")
            parts = norm.split("/")
            if all(p == "0" for p in parts):
                return "Normal Function"
            # Has alt allele → use the non-wildtype allele's function
            if diplotype_result:
                func = (diplotype_result.allele2.function
                        if diplotype_result.allele2
                        else (diplotype_result.allele1.function if diplotype_result.allele1 else ""))
                if func:
                    return _EFFECT_MAP.get(func.lower().strip(), func.title())
            # Fallback based on zygosity
            if all(p != "0" for p in parts):
                return "No Function"
            return "Reduced Function"

        detected = [
            DetectedVariant(
                rsid=v.rsid,
                genotype=v.genotype,
                effect=_resolve_effect(v.genotype or ""),
            )
            for v in gene_variants
        ]

        # Build pharmacogenomic profile (with detected_variants nested inside)
        if diplotype_result:
            pgx_profile = PharmacogenomicProfile(
                primary_gene=primary_gene,
                diplotype=diplotype_result.diplotype,
                phenotype=diplotype_result.phenotype,  # Just code: PM, IM, NM, RM, URM
                detected_variants=detected,
            )
        else:
            pgx_profile = PharmacogenomicProfile(
                primary_gene=primary_gene,
                diplotype="N/A",
                phenotype="Unknown",
                detected_variants=detected,
            )

        # Build risk assessment
        if primary_rec:
            risk = RiskAssessment(
                risk_label=primary_rec.risk_label,
                confidence_score=primary_rec.confidence_score,
                severity=primary_rec.severity,
            )
        else:
            risk = RiskAssessment(
                risk_label="Unknown",
                confidence_score=0.3,
                severity="none",
            )

        # Build clinical recommendation object
        _CPIC_YEARS = {
            "CYP2D6": "2020", "CYP2C19": "2022", "CYP2C9": "2017",
            "SLCO1B1": "2022", "TPMT": "2019", "DPYD": "2023",
            "CYP3A5": "2022",
        }
        cpic_year = _CPIC_YEARS.get(primary_gene, "")

        if primary_rec:
            clin_rec = ClinicalRecommendation(
                recommendation=primary_rec.recommendation,
                dosing_guidance=None,
                cpic_guideline=f"CPIC Guideline: {primary_gene} ({cpic_year})" if cpic_year else f"CPIC Guideline: {primary_gene}",
                cpic_level="A" if primary_rec.found else None,
            )
        else:
            clin_rec = ClinicalRecommendation(
                recommendation="No CPIC guideline found. Standard dosing may be appropriate — consult clinical pharmacist.",
                dosing_guidance=None,
                cpic_guideline=None,
                cpic_level=None,
            )

        # ── 6a. RAG context retrieval (Module 5) ─────────────
        try:
            rag_result = rag_engine.retrieve(
                gene=primary_gene,
                diplotype=diplotype_result.diplotype if diplotype_result else "N/A",
                drug=drug,
                phenotype=diplotype_result.phenotype if diplotype_result else "",
                top_k=3,
            )
            rag_texts = [ctx.content for ctx in rag_result.contexts]
        except Exception as exc:
            logger.warning("RAG retrieval failed for %s/%s: %s", primary_gene, drug, exc)
            rag_texts = []

        # ── 6b. LLM explanation (Module 6) ───────────────────
        try:
            llm_input = ExplanationInput(
                gene=primary_gene,
                diplotype=diplotype_result.diplotype if diplotype_result else "N/A",
                phenotype=diplotype_result.phenotype if diplotype_result else "N/A",
                phenotype_label=diplotype_result.phenotype_label if diplotype_result else "Unknown",
                drug=drug,
                risk_label=primary_rec.risk_label if primary_rec else "Unknown",
                severity=primary_rec.severity if primary_rec else "low",
                recommendation=primary_rec.recommendation if primary_rec else "",
                rag_contexts=rag_texts,
                detected_variants=[
                    {"rsid": v.rsid, "genotype": v.genotype}
                    for v in gene_variants[:5]
                ],
            )
            llm_output: ExplanationOutput = llm_gen.generate(llm_input)

            explanation = LLMExplanation(
                summary=llm_output.summary,
                mechanism=llm_output.mechanism,
            )
        except Exception as exc:
            logger.warning("LLM generation failed for %s/%s: %s", primary_gene, drug, exc)
            explanation = LLMExplanation(
                summary=f"Analysis for {drug} with {primary_gene}: {primary_rec.recommendation if primary_rec else 'No data.'}",
                mechanism=None,
            )

        # ── 7. Assemble result ────────────────────────────────
        results.append(
            DrugAnalysisResult(
                patient_id=patient_id,
                drug=drug,
                timestamp=datetime.now(timezone.utc),
                risk_assessment=risk,
                pharmacogenomic_profile=pgx_profile,
                clinical_recommendation=clin_rec,
                llm_generated_explanation=explanation,
                quality_metrics=QualityMetrics(
                    vcf_parsing_success=True,
                    total_variants_extracted=parse_result.total_variants,
                    pharmacogenes_found=len(parse_result.genes_found),
                ),
            )
        )

    logger.info(
        "Analysis complete: patient=%s, drugs=%d, results=%d",
        patient_id, len(drug_list), len(results),
    )

    return AnalysisResponse(
        status="success",
        results=results,
        errors=errors,
    )
