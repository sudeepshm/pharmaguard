"""
Targeted tests for CYP2C19, SLCO1B1, and TPMT diplotype assignment.
Patient safety critical — ensures correct genotype→diplotype→phenotype→risk.
"""

import sys
from pathlib import Path

# Add backend root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.haplotype_matcher import (
    match_haplotypes, _genotype_zygosity, Zygosity,
)
from app.services.clinical_engine import assess_risk


# ══════════════════════════════════════════════════════════════════
# 1. Zygosity classification
# ══════════════════════════════════════════════════════════════════

def test_genotype_zygosity():
    """_genotype_zygosity must correctly classify GT strings."""
    assert _genotype_zygosity("0/0", "A", "A") == Zygosity.NONE, "0/0 → NONE"
    assert _genotype_zygosity("0/1", "A", "A") == Zygosity.HET,  "0/1 → HET"
    assert _genotype_zygosity("1/0", "A", "A") == Zygosity.HET,  "1/0 → HET"
    assert _genotype_zygosity("1/1", "A", "A") == Zygosity.HOM,  "1/1 → HOM"
    assert _genotype_zygosity("0|1", "A", "A") == Zygosity.HET,  "0|1 → HET"
    assert _genotype_zygosity("1|1", "A", "A") == Zygosity.HOM,  "1|1 → HOM"
    assert _genotype_zygosity(".",   "A", "A") == Zygosity.NONE,  ". → NONE"
    assert _genotype_zygosity("./.", "A", "A") == Zygosity.NONE,  "./. → NONE"
    assert _genotype_zygosity("",   "A", "A") == Zygosity.NONE,  "empty → NONE"
    print("✓ _genotype_zygosity: all 9 assertions passed")


# ══════════════════════════════════════════════════════════════════
# 2. CYP2C19 — GT=1/1 → *2/*2 → PM
# ══════════════════════════════════════════════════════════════════

def test_cyp2c19_homozygous_star2():
    variants = [{
        "rsid": "rs4244285", "genotype": "1/1",
        "gene": "CYP2C19", "ref": "G", "alt": "A",
        "chrom": "chr10", "pos": 96541616,
    }]
    result = match_haplotypes(variants, target_genes={"CYP2C19"})
    dr = result.gene_results["CYP2C19"]
    assert dr.diplotype == "*2/*2", f"got {dr.diplotype}"
    assert dr.phenotype == "PM", f"got {dr.phenotype}"
    assert dr.activity_score_total == 0.0
    print(f"✓ CYP2C19 GT=1/1 → {dr.diplotype}, {dr.phenotype}, score={dr.activity_score_total}")


def test_cyp2c19_heterozygous_star2():
    variants = [{
        "rsid": "rs4244285", "genotype": "0/1",
        "gene": "CYP2C19", "ref": "G", "alt": "A",
        "chrom": "chr10", "pos": 96541616,
    }]
    result = match_haplotypes(variants, target_genes={"CYP2C19"})
    dr = result.gene_results["CYP2C19"]
    assert dr.diplotype == "*1/*2", f"got {dr.diplotype}"
    assert dr.phenotype == "IM", f"got {dr.phenotype}"
    assert dr.activity_score_total == 1.0
    print(f"✓ CYP2C19 GT=0/1 → {dr.diplotype}, {dr.phenotype}, score={dr.activity_score_total}")


def test_clopidogrel_pm_risk():
    rec = assess_risk("CYP2C19", "PM", "CLOPIDOGREL")
    assert rec.found
    assert rec.risk_label == "Ineffective", f"got {rec.risk_label}"
    assert rec.severity == "high", f"got {rec.severity}"
    print(f"✓ CYP2C19 PM + CLOPIDOGREL → {rec.risk_label} ({rec.severity})")


# ══════════════════════════════════════════════════════════════════
# 3. SLCO1B1 — rs4149056 GT=0/1 → *1A/*5 (NOT *5/*15)
# ══════════════════════════════════════════════════════════════════

def test_slco1b1_het_star5_only():
    """
    Only rs4149056 in VCF, GT=0/1.
    *5 requires rs4149056 (1/1 defining) → FULL MATCH ✓
    *15 requires rs2306283 + rs4149056 (1/2 defining) → PARTIAL → REJECTED
    Result must be *1A/*5, NOT *5/*15.
    """
    variants = [{
        "rsid": "rs4149056", "genotype": "0/1",
        "gene": "SLCO1B1", "ref": "T", "alt": "C",
        "chrom": "chr12", "pos": 21176804,
    }]
    result = match_haplotypes(variants, target_genes={"SLCO1B1"})
    dr = result.gene_results["SLCO1B1"]

    assert dr.diplotype == "*1A/*5", f"Expected *1A/*5, got {dr.diplotype}"
    assert "*15" not in dr.diplotype, f"*15 must NEVER appear without rs2306283! Got {dr.diplotype}"
    assert dr.phenotype == "DF", f"Expected DF, got {dr.phenotype}"
    print(f"✓ SLCO1B1 rs4149056 GT=0/1 → {dr.diplotype}, {dr.phenotype}, score={dr.activity_score_total}")


def test_slco1b1_df_simvastatin_severity():
    """SLCO1B1 DF + SIMVASTATIN → Adjust, severity moderate (not high)."""
    rec = assess_risk("SLCO1B1", "DF", "SIMVASTATIN")
    assert rec.found
    assert rec.risk_label == "Adjust Dosage", f"got {rec.risk_label}"
    assert rec.severity == "moderate", f"Expected moderate, got {rec.severity}"
    print(f"✓ SLCO1B1 DF + SIMVASTATIN → {rec.risk_label} ({rec.severity})")


# ══════════════════════════════════════════════════════════════════
# 4. TPMT — rs1142345 GT=0/1 → *1/*3C (NOT *3A/*3C)
# ══════════════════════════════════════════════════════════════════

def test_tpmt_het_star3c_only():
    """
    Only rs1142345 in VCF, GT=0/1.
    *3C requires rs1142345 (1/1 defining) → FULL MATCH ✓
    *3A requires rs1800460 + rs1142345 (1/2 defining) → PARTIAL → REJECTED
    Result must be *1/*3C, NOT *3A/*3C.
    """
    variants = [{
        "rsid": "rs1142345", "genotype": "0/1",
        "gene": "TPMT", "ref": "A", "alt": "G",
        "chrom": "chr6", "pos": 18143724,
    }]
    result = match_haplotypes(variants, target_genes={"TPMT"})
    dr = result.gene_results["TPMT"]

    assert dr.diplotype == "*1/*3C", f"Expected *1/*3C, got {dr.diplotype}"
    assert "*3A" not in dr.diplotype, f"*3A must NEVER appear without rs1800460! Got {dr.diplotype}"
    assert dr.phenotype == "IM", f"Expected IM, got {dr.phenotype}"
    assert dr.activity_score_total == 1.0, f"Expected 1.0, got {dr.activity_score_total}"
    print(f"✓ TPMT rs1142345 GT=0/1 → {dr.diplotype}, {dr.phenotype}, score={dr.activity_score_total}")


def test_tpmt_im_azathioprine_severity():
    """TPMT IM + AZATHIOPRINE → Adjust, severity moderate (not high)."""
    rec = assess_risk("TPMT", "IM", "AZATHIOPRINE")
    assert rec.found
    assert rec.risk_label == "Adjust Dosage", f"got {rec.risk_label}"
    assert rec.severity == "moderate", f"Expected moderate, got {rec.severity}"
    print(f"✓ TPMT IM + AZATHIOPRINE → {rec.risk_label} ({rec.severity})")


# ══════════════════════════════════════════════════════════════════
# 5. Regression — CYP2C19 EM still Safe for clopidogrel
# ══════════════════════════════════════════════════════════════════

def test_clopidogrel_em_safe():
    rec = assess_risk("CYP2C19", "EM", "CLOPIDOGREL")
    assert rec.risk_label == "Safe", f"got {rec.risk_label}"
    print(f"✓ CYP2C19 EM + CLOPIDOGREL → {rec.risk_label}")


# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("PATIENT SAFETY CRITICAL TESTS")
    print("=" * 60)
    print()

    test_genotype_zygosity()
    print()

    print("── CYP2C19 ──")
    test_cyp2c19_homozygous_star2()
    test_cyp2c19_heterozygous_star2()
    test_clopidogrel_pm_risk()
    test_clopidogrel_em_safe()
    print()

    print("── SLCO1B1 ──")
    test_slco1b1_het_star5_only()
    test_slco1b1_df_simvastatin_severity()
    print()

    print("── TPMT ──")
    test_tpmt_het_star3c_only()
    test_tpmt_im_azathioprine_severity()

    print()
    print("=" * 60)
    print("ALL TESTS PASSED ✓")
    print("=" * 60)
