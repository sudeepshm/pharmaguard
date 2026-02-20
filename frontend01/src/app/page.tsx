"use client";

import { useState } from "react";
import {
  Shield, Loader2, AlertCircle,
  ArrowRight, User, Pill, FileUp, Zap, Check,
} from "lucide-react";
import { cn, API_BASE, type AnalysisResponse, type DrugResult } from "@/lib/utils";
import DrugInput from "@/components/drug-input";
import VCFDropzone from "@/components/vcf-dropzone";
import ResultsDashboard from "@/components/results-dashboard";

type AppState = "input" | "loading" | "results" | "error";

/* ─── Step Progress ──────────────────────────── */
const STEPS = [
  { label: "PATIENT", icon: User },
  { label: "DRUGS", icon: Pill },
  { label: "VCF", icon: FileUp },
  { label: "ANALYZE", icon: Zap },
];

function StepProgress({ activeStep }: { activeStep: number }) {
  return (
    <div className="max-w-[400px] mx-auto pt-5 pb-1">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const isCompleted = i < activeStep;
          const isActive = i === activeStep;
          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                {isCompleted ? (
                  <div className="w-[14px] h-[14px] rounded-full bg-[var(--emerald)] flex items-center justify-center">
                    <Check size={8} className="text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div className={cn("step-dot", isActive && "step-active")} />
                )}
                <span className={cn(
                  "text-[9px] font-medium tracking-[0.1em]",
                  isActive ? "text-[var(--text-high)] font-semibold"
                    : isCompleted ? "text-[var(--text-mid)]"
                      : "text-[var(--text-low)]"
                )}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="stepper-line mx-3 mb-5"
                  style={{ "--progress": isCompleted ? 1 : 0 } as React.CSSProperties}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const [state, setState] = useState<AppState>("input");
  const [drugs, setDrugs] = useState<string[]>([]);
  const [vcfFile, setVcfFile] = useState<File | null>(null);
  const [patientId, setPatientId] = useState("PATIENT_001");
  const [results, setResults] = useState<DrugResult[]>([]);
  const [error, setError] = useState<string>("");
  const [loadingStep, setLoadingStep] = useState("");
  const [runId] = useState(() => `PGX-RUN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);

  const canSubmit = drugs.length > 0 && vcfFile !== null;
  const activeStep = !patientId.trim() ? 0 : drugs.length === 0 ? 1 : !vcfFile ? 2 : 3;

  const handleSubmit = async () => {
    if (!canSubmit || !vcfFile) return;
    setState("loading");
    setError("");

    const steps = [
      "Uploading VCF file...",
      "Parsing genomic variants...",
      "Matching star alleles...",
      "Querying CPIC guidelines...",
      "Retrieving clinical context...",
      "Generating AI explanations...",
    ];

    let stepIdx = 0;
    setLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) setLoadingStep(steps[stepIdx]);
    }, 800);

    try {
      const formData = new FormData();
      formData.append("vcf_file", vcfFile);
      formData.append("patient_id", patientId);
      formData.append("drugs", drugs.join(","));

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: formData,
      });

      clearInterval(stepInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ detail: "Server error" }));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const data: AnalysisResponse = await response.json();
      if (data.status !== "success") {
        throw new Error(data.errors?.join(", ") || "Analysis failed");
      }

      setResults(data.results);
      setState("results");
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setState("error");
    }
  };

  const handleReset = () => {
    setState("input");
    setDrugs([]);
    setVcfFile(null);
    setResults([]);
    setError("");
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="min-h-screen flex flex-col">
      {/* ══ NAVBAR ══════════════════════════════ */}
      <header className="clinical-nav sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-gradient-to-br from-[#0e7490] to-[#0ea5e9] flex items-center justify-center flex-shrink-0">
              <Shield size={15} className="text-white" />
            </div>
            <div className="flex items-center gap-2">
              <div>
                <span className="text-[15px] font-semibold text-[var(--text-high)] leading-none block">PharmaGuard</span>
                <span className="font-mono text-[9px] text-[var(--text-low)] tracking-[0.18em] block mt-0.5">PHARMACOGENOMICS · CDS</span>
              </div>
              <div className="status-dot ml-1" title="System Active" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="nav-pill nav-pill--teal hidden sm:inline-flex">CPIC v2024.1</span>
            {state === "results" ? (
              <button onClick={handleReset} className="action-btn action-btn--ghost text-[10px]">← New Analysis</button>
            ) : (
              <span className="nav-pill nav-pill--green">
                <span className="loading-dot">●</span> SYSTEM READY
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════ */}
      <main className="flex-1 max-w-[720px] w-full mx-auto px-6 py-6">
        {/* ── Input State ──────────────────────── */}
        {state === "input" && (
          <div>
            <StepProgress activeStep={activeStep} />

            {/* Hero */}
            <div className="text-center max-w-[560px] mx-auto pt-8 pb-5">
              <div className="stagger-item mb-4" style={{ "--si": 0 } as React.CSSProperties}>
                <span className="lab-tag">⬡ CPIC LEVEL A–D · PHARMVAR 6.1</span>
              </div>
              <h2
                className="stagger-item text-[var(--text-high)]"
                style={{
                  "--si": 1,
                  fontSize: "clamp(24px, 3.2vw, 38px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  textShadow: "0 0 60px rgba(14,165,233,0.12)",
                } as React.CSSProperties}
              >
                Pharmacogenomic Risk Analysis
              </h2>
              <p className="stagger-item text-[var(--text-mid)] text-[13px] max-w-[440px] mx-auto leading-[1.7] mt-3" style={{ "--si": 2 } as React.CSSProperties}>
                Upload a VCF file and select drugs to receive pharmacogenomic risk assessments with clinical guidelines and dosing recommendations.
              </p>
              <div className="stagger-item flex items-center justify-center gap-2 flex-wrap mt-4" style={{ "--si": 3 } as React.CSSProperties}>
                <span className="stat-pill">CYP450 · 6 Genes</span>
                <span className="stat-pill">CPIC Level A/B</span>
                <span className="stat-pill">VCF v4.0–4.2</span>
              </div>
            </div>

            {/* Form */}
            <div className="max-w-[660px] mx-auto flex flex-col gap-[10px]">
              {/* Patient ID */}
              <div className="clinical-card stagger-item" style={{ "--si": 4 } as React.CSSProperties}>
                <div className="section-label">Patient ID</div>
                <div className="input-wrap">
                  <input
                    type="text"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    className="clinical-input"
                    placeholder="Enter patient identifier..."
                    id="patient-id"
                  />
                  <span className="input-icon-right">
                    <Shield size={14} />
                  </span>
                </div>
                <p className="font-mono text-[9px] text-[var(--text-low)] mt-2 tracking-wide">
                  Session encrypted · Audit logged
                </p>
              </div>

              {/* Drugs */}
              <div className="clinical-card stagger-item" style={{ "--si": 5 } as React.CSSProperties}>
                <DrugInput drugs={drugs} onChange={setDrugs} />
              </div>

              {/* VCF Upload */}
              <div className="clinical-card stagger-item" style={{ "--si": 6 } as React.CSSProperties}>
                <div className="section-label">VCF File</div>
                <VCFDropzone
                  onFileSelect={setVcfFile}
                  selectedFile={vcfFile}
                  onClear={() => setVcfFile(null)}
                />
              </div>

              {/* Scope Summary */}
              {canSubmit && (
                <div className="clinical-card stagger-item" style={{ "--si": 0, animationDelay: "0ms" } as React.CSSProperties}>
                  <div className="section-label">Analysis Scope</div>
                  <div className="data-grid text-[11px]">
                    <span className="label">Patient</span>
                    <span className="value">{patientId}</span>
                    <span className="label">Drugs</span>
                    <span className="value">{drugs.length} selected ({drugs.join(" · ")})</span>
                    <span className="label">VCF File</span>
                    <span className="value">{vcfFile?.name} · {((vcfFile?.size || 0) / 1024).toFixed(1)} KB</span>
                    <span className="label">CPIC Coverage</span>
                    <span className="value">Level A + B genes included</span>
                  </div>
                </div>
              )}

              {/* Button */}
              <div className="stagger-item pt-1" style={{ "--si": 7 } as React.CSSProperties}>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="btn-analyze"
                  id="submit-analysis"
                >
                  {canSubmit ? (
                    <>Run Pharmacogenomic Analysis <ArrowRight size={14} /></>
                  ) : (
                    "Complete all fields to run analysis"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading State ────────────────────── */}
        {state === "loading" && (
          <div className="animate-fade-in-up pt-16 max-w-[500px] mx-auto">
            {/* Progress bar */}
            <div className="progress-bar mb-6">
              <div className="progress-bar-fill" />
            </div>

            <div className="flex items-center gap-3 mb-3">
              <span className="loading-dot text-[var(--cyan)]">●</span>
              <h3 className="text-base font-semibold text-[var(--text-high)]">Analyzing variants...</h3>
            </div>
            <p className="text-sm text-[var(--text-mid)] mb-6">{loadingStep}</p>

            <div className="space-y-1.5">
              {[
                "Parsing genomic variants",
                "Matching star alleles",
                "Querying CPIC guidelines",
                "Generating AI explanations",
              ].map((step) => (
                <div key={step} className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    loadingStep.toLowerCase().includes(step.split(" ")[0].toLowerCase())
                      ? "bg-[var(--cyan)]" : "bg-[var(--border-rest)]"
                  )} />
                  <span className="text-xs text-[var(--text-low)]">{step}</span>
                </div>
              ))}
            </div>

            <p className="font-mono text-[10px] text-[var(--text-low)] text-center mt-8">
              Run ID: {runId} · Submitted {timeStr} · Queue: 1
            </p>
          </div>
        )}

        {/* ── Error State ──────────────────────── */}
        {state === "error" && (
          <div className="max-w-md mx-auto py-20 text-center space-y-5 animate-fade-in-up">
            <div className="w-12 h-12 mx-auto rounded-[var(--r-md)] bg-[var(--rose)]/10 border border-[var(--rose)]/20 flex items-center justify-center">
              <AlertCircle size={22} className="text-[var(--rose)]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--text-high)]">Analysis Failed</h3>
              <p className="text-sm text-[var(--rose)] mt-1.5">{error}</p>
            </div>
            <button onClick={handleReset} className="action-btn action-btn--ghost mx-auto">
              Try Again
            </button>
          </div>
        )}

        {/* ── Results State ────────────────────── */}
        {state === "results" && (
          <div className="animate-fade-in-up">
            <ResultsDashboard results={results} patientId={patientId} runId={runId} />
          </div>
        )}
      </main>

      {/* ══ FOOTER ══════════════════════════════ */}
      <footer className="clinical-footer mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          <p className="text-[10px] text-[var(--text-low)] text-center max-w-[500px] mx-auto">
            ⚠ For clinical decision support only. Results must be interpreted by a qualified clinical pharmacist or physician.
          </p>
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-mono text-[9px] text-[var(--text-low)]">PharmaGuard © 2026 · v2.4.1</span>
            <div className="flex items-center gap-3">
              <span className="footer-link">CPIC Guidelines</span>
              <span className="text-[var(--border-rest)]">·</span>
              <span className="footer-link">PharmVar</span>
              <span className="text-[var(--border-rest)]">·</span>
              <span className="footer-link">dbSNP</span>
              <span className="text-[var(--border-rest)]">·</span>
              <span className="footer-link">FDA PGx</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
