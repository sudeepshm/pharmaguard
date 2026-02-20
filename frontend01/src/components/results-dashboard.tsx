"use client";

import { useState, useEffect, useRef } from "react";
import {
    CheckCircle2, XCircle, AlertTriangle, HelpCircle,
    ChevronRight, Copy, Download, Code2,
    Dna, Pill, Shield, ShieldAlert, ShieldX, ShieldCheck,
    Activity, ExternalLink,
} from "lucide-react";
import { cn, type DrugResult, type RiskLabel } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════
   RISK CONFIG
   ═══════════════════════════════════════════════════════ */
type RiskConfig = {
    badgeClass: string;
    color: string;
    dotColor: string;
    label: string;
    icon: typeof ShieldCheck;
    glowShadow?: string;
};

const RISK_CONFIG: Record<RiskLabel, RiskConfig> = {
    Safe: { badgeClass: "risk-badge--safe", color: "#34d399", dotColor: "bg-green-400", label: "SAFE", icon: ShieldCheck },
    "Adjust Dosage": { badgeClass: "risk-badge--adjust", color: "#fbbf24", dotColor: "bg-amber-400", label: "ADJUST DOSAGE", icon: ShieldAlert },
    Toxic: { badgeClass: "risk-badge--toxic", color: "#fb7185", dotColor: "bg-rose-400", label: "TOXIC", icon: ShieldX, glowShadow: "var(--shadow-glow-danger)" },
    Ineffective: { badgeClass: "risk-badge--ineffective", color: "#a78bfa", dotColor: "bg-violet-400", label: "INEFFECTIVE", icon: XCircle },
    Unknown: { badgeClass: "risk-badge--unknown", color: "#94a3b8", dotColor: "bg-slate-400", label: "UNKNOWN", icon: HelpCircle },
};

const SEVERITY_LEVELS = ["none", "low", "moderate", "high", "critical"] as const;
const SEVERITY_INDEX: Record<string, number> = {
    none: 0, low: 1, moderate: 2, high: 3, critical: 4,
};

/* ═══════════════════════════════════════════════════════
   TYPEWRITER HOOK (preserved from original)
   ═══════════════════════════════════════════════════════ */
function useTypewriter(text: string, speed: number = 12) {
    const [displayed, setDisplayed] = useState("");
    const [done, setDone] = useState(false);

    useEffect(() => {
        setDisplayed("");
        setDone(false);
        if (!text) { setDone(true); return; }
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) {
                clearInterval(interval);
                setDone(true);
            }
        }, speed);
        return () => clearInterval(interval);
    }, [text, speed]);

    return { displayed, done };
}

/* ═══════════════════════════════════════════════════════
   COLLAPSIBLE SECTION
   ═══════════════════════════════════════════════════════ */
function CollapsibleSection({
    title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen);
    const contentRef = useRef<HTMLDivElement>(null);

    return (
        <div className="border-b border-[var(--border-rest)] last:border-b-0">
            <button className="expand-header" onClick={() => setOpen(!open)}>
                <ChevronRight size={12} className={cn("chevron", open && "open")} />
                {title}
            </button>
            <div
                className="expand-content"
                style={{
                    maxHeight: open ? `${(contentRef.current?.scrollHeight || 500) + 16}px` : "0px",
                    opacity: open ? 1 : 0,
                    paddingBottom: open ? "12px" : "0px",
                }}
            >
                <div ref={contentRef}>{children}</div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   CONFIDENCE BAR + SEVERITY DOTS
   ═══════════════════════════════════════════════════════ */
function ConfidenceBar({ score, color }: { score: number; color: string }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { const t = setTimeout(() => setMounted(true), 100); return () => clearTimeout(t); }, []);

    return (
        <div>
            <div className="text-[9px] text-[var(--text-low)] uppercase tracking-[0.12em] mb-1">Confidence</div>
            <div className="font-mono text-[28px] font-bold text-[var(--text-high)] leading-none mb-2">
                {(score * 100).toFixed(0)}%
            </div>
            <div className="confidence-bar">
                <div
                    className="confidence-fill"
                    style={{
                        width: mounted ? `${score * 100}%` : "0%",
                        background: `linear-gradient(90deg, ${color}66, ${color})`,
                    }}
                />
            </div>
        </div>
    );
}

function SeverityDots({ severity, color }: { severity: string; color: string }) {
    const activeIdx = SEVERITY_INDEX[severity.toLowerCase()] ?? 0;

    return (
        <div>
            <div className="text-[9px] text-[var(--text-low)] uppercase tracking-[0.12em] mb-2">Severity</div>
            <div className="flex items-center gap-1">
                {SEVERITY_LEVELS.map((level, i) => (
                    <div
                        key={level}
                        className={cn("severity-dot", i <= activeIdx && "active")}
                        title={level}
                        style={{
                            background: i <= activeIdx ? color : undefined,
                            boxShadow: i <= activeIdx ? `0 0 8px ${color}44` : undefined,
                            transitionDelay: `${i * 60 + 300}ms`,
                        }}
                    />
                ))}
            </div>
            <div className="text-[9px] text-[var(--text-low)] mt-1 capitalize">{severity}</div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   RESULT CARD
   ═══════════════════════════════════════════════════════ */
function ResultCard({ result, index }: { result: DrugResult; index: number }) {
    const [copied, setCopied] = useState(false);
    const [showJSON, setShowJSON] = useState(false);

    const risk = result.risk_assessment;
    const config = RISK_CONFIG[risk.risk_label as RiskLabel] || RISK_CONFIG.Unknown;
    const profile = result.pharmacogenomic_profile;

    const summary = result.llm_generated_explanation?.summary || "";
    const mechanism = result.llm_generated_explanation?.mechanism || "";
    const { displayed: typedSummary, done: summaryDone } = useTypewriter(summary, 8);

    const copyJSON = () => {
        navigator.clipboard.writeText(JSON.stringify(result, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const downloadJSON = () => {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${result.drug}_analysis.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const effectColor = (effect: string) => {
        const e = effect.toLowerCase();
        if (e.includes("no function") || e.includes("loss")) return "text-[var(--rose)]";
        if (e.includes("reduced") || e.includes("decreased")) return "text-[var(--amber)]";
        if (e.includes("normal") || e.includes("increased")) return "text-[var(--emerald)]";
        return "text-[var(--text-mid)]";
    };

    return (
        <div
            className="animate-fade-in-up space-y-3"
            style={{ animationDelay: `${80 + index * 80}ms` }}
        >
            {/* ── Risk Assessment Card ─────────────── */}
            <div
                className="clinical-card !p-0 overflow-hidden"
                style={{ boxShadow: config.glowShadow || "var(--shadow-card)" }}
            >
                <div className="flex flex-col sm:flex-row">
                    {/* Left: drug + risk badge */}
                    <div className="flex-[3] p-5">
                        <h3
                            className="text-[var(--text-high)] font-bold leading-none mb-3"
                            style={{ fontSize: "clamp(18px, 2.5vw, 28px)", letterSpacing: "-0.01em" }}
                        >
                            {result.drug}
                        </h3>
                        <span className={cn("risk-badge", config.badgeClass)} style={{ animationDelay: `${200 + index * 80}ms` }}>
                            {config.label}
                        </span>
                        <p className="text-[12px] text-[var(--text-mid)] mt-3">
                            {profile.phenotype} · <span className="font-mono font-semibold">{profile.diplotype}</span>
                        </p>
                    </div>

                    {/* Right: confidence + severity */}
                    <div className="flex-[2] p-5 border-t sm:border-t-0 sm:border-l border-[var(--border-rest)] flex flex-col justify-center gap-4">
                        <ConfidenceBar score={risk.confidence_score} color={config.color} />
                        <SeverityDots severity={risk.severity} color={config.color} />
                    </div>
                </div>
            </div>

            {/* ── Pharmacogenomic Profile ──────────── */}
            <div className="clinical-card">
                <div className="section-label">Pharmacogenomic Profile</div>
                <div className="data-grid">
                    <span className="label">Primary Gene</span>
                    <span className="value">{profile.primary_gene}</span>
                    <span className="label">Diplotype</span>
                    <span className="value">{profile.diplotype}</span>
                    <span className="label">Phenotype</span>
                    <span className="value">{profile.phenotype}</span>
                </div>
            </div>

            {/* ── Detected Variants Table ─────────── */}
            {profile.detected_variants && profile.detected_variants.length > 0 && (
                <div className="clinical-card !p-0 overflow-hidden">
                    <div className="p-5 pb-0"><div className="section-label">Detected Variants</div></div>
                    <div className="overflow-x-auto">
                        <table className="variant-table">
                            <thead>
                                <tr>
                                    <th>RSID</th>
                                    <th>Genotype</th>
                                    <th>Effect</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profile.detected_variants.map((v, vi) => (
                                    <tr
                                        key={vi}
                                        className="animate-fade-in-up"
                                        style={{ animationDelay: `${300 + vi * 30}ms` }}
                                    >
                                        <td className="font-bold text-[var(--cyan)]">{v.rsid}</td>
                                        <td>{v.genotype || "N/A"}</td>
                                        <td className={effectColor(v.effect || "")}>
                                            {v.effect || "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Clinical Recommendation ─────────── */}
            <div
                className="clinical-card"
                style={{ borderLeft: `3px solid ${config.color}` }}
            >
                <div className="section-label">Clinical Recommendation</div>
                <p className="text-[13px] text-[var(--text-high)] leading-[1.7]">
                    {summary ? typedSummary : "No clinical recommendation available."}
                    {!summaryDone && summary && (
                        <span className="inline-block w-0.5 h-4 bg-[var(--cyan)] animate-pulse ml-0.5 align-middle" />
                    )}
                </p>
                {risk.risk_label === "Adjust Dosage" && (
                    <div className="mt-3 font-mono text-[11px] text-[var(--amber)] bg-[rgba(245,158,11,0.04)] border border-[rgba(245,158,11,0.15)] rounded-[var(--r-sm)] px-3.5 py-2.5">
                        Recommended dose adjustment · CPIC Level A
                    </div>
                )}
                <p className="mt-3 text-[11px] text-[var(--text-low)] flex items-center gap-1 hover:text-[var(--cyan)] transition-colors cursor-pointer">
                    CPIC Guideline: {profile.primary_gene} ({new Date().getFullYear()})
                    <ExternalLink size={10} />
                </p>
            </div>

            {/* ── LLM Explanation ─────────────────── */}
            <div className="clinical-card">
                <div className="flex items-center justify-between mb-2">
                    <div className="section-label !mb-0">AI-Generated Clinical Explanation</div>
                    <span className="nav-pill nav-pill--teal text-[8px]">● Powered by LLM</span>
                </div>

                <CollapsibleSection title="Summary" defaultOpen>
                    <p className="text-[13px] text-[var(--text-mid)] leading-[1.75]">
                        {summary || "No summary available."}
                    </p>
                </CollapsibleSection>

                {mechanism && (
                    <CollapsibleSection title="Biological Mechanism">
                        <p className="text-[13px] text-[var(--text-mid)] leading-[1.75]">
                            {mechanism}
                        </p>
                    </CollapsibleSection>
                )}

                {profile.detected_variants && profile.detected_variants.length > 0 && (
                    <CollapsibleSection title="Variant Citations">
                        <div className="flex flex-wrap gap-1.5">
                            {profile.detected_variants.map((v, i) => (
                                <span key={i} className="font-mono text-[10px] text-[var(--cyan)] bg-[rgba(14,165,233,0.06)] border border-[rgba(14,165,233,0.12)] rounded-[var(--r-sm)] px-2 py-0.5">
                                    {v.rsid}
                                </span>
                            ))}
                        </div>
                    </CollapsibleSection>
                )}
            </div>

            {/* ── Actions ─────────────────────────── */}
            <div className="flex items-center gap-2">
                <button onClick={copyJSON} className="action-btn action-btn--primary">
                    {copied ? <>✓ Copied</> : <><Copy size={11} /> Copy JSON</>}
                </button>
                <button onClick={downloadJSON} className="action-btn action-btn--primary">
                    <Download size={11} /> Download JSON
                </button>
                <button onClick={() => setShowJSON(!showJSON)} className="action-btn action-btn--ghost">
                    <Code2 size={11} /> {showJSON ? "Hide" : "View"} Raw
                </button>
            </div>

            {showJSON && (
                <pre className="p-4 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border-rest)] text-xs font-mono text-[var(--cyan)] overflow-x-auto max-h-80">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════════ */
interface ResultsDashboardProps {
    results: DrugResult[];
    patientId: string;
    runId?: string;
}

export default function ResultsDashboard({ results, patientId, runId }: ResultsDashboardProps) {
    const [activeTab, setActiveTab] = useState(0);
    const showTabs = results.length > 1;

    const safeCount = results.filter((r) => r.risk_assessment.risk_label === "Safe").length;
    const adjustCount = results.filter((r) => r.risk_assessment.risk_label === "Adjust Dosage").length;
    const dangerCount = results.filter((r) =>
        r.risk_assessment.risk_label === "Toxic" || r.risk_assessment.risk_label === "Ineffective"
    ).length;

    const downloadAll = () => {
        const blob = new Blob([JSON.stringify({ status: "success", results }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${patientId}_pharmaguard_report.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

    return (
        <div className="space-y-4">
            {/* ── Results Header ──────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                    <p className="text-[11px] font-semibold text-[var(--emerald)] tracking-[0.15em] flex items-center gap-1.5 mb-1">
                        ✓ ANALYSIS COMPLETE
                    </p>
                    <p className="font-mono text-[10px] text-[var(--text-low)]">
                        {patientId} · Run {runId || "PGX-RUN-0000"} · {dateStr} {timeStr}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={downloadAll} className="action-btn action-btn--primary">
                        <Download size={11} /> Download JSON
                    </button>
                </div>
            </div>

            {/* ── Summary counts ──────────────────── */}
            <div className="flex items-center gap-2">
                {safeCount > 0 && (
                    <span className="risk-badge risk-badge--safe !text-[10px] !py-1 !px-3 !font-semibold !tracking-[0.06em]" style={{ animation: "none" }}>
                        {safeCount} Safe
                    </span>
                )}
                {adjustCount > 0 && (
                    <span className="risk-badge risk-badge--adjust !text-[10px] !py-1 !px-3 !font-semibold !tracking-[0.06em]" style={{ animation: "none" }}>
                        {adjustCount} Adjust
                    </span>
                )}
                {dangerCount > 0 && (
                    <span className="risk-badge risk-badge--toxic !text-[10px] !py-1 !px-3 !font-semibold !tracking-[0.06em]" style={{ animation: "none" }}>
                        {dangerCount} Risk
                    </span>
                )}
            </div>

            {/* ── Drug Tabs (multi-drug only) ─────── */}
            {showTabs && (
                <div className="flex items-center border-b border-[var(--border-rest)] gap-0">
                    {results.map((r, i) => {
                        const riskCfg = RISK_CONFIG[r.risk_assessment.risk_label as RiskLabel] || RISK_CONFIG.Unknown;
                        return (
                            <button
                                key={`${r.drug}-${i}`}
                                onClick={() => setActiveTab(i)}
                                className={cn("drug-tab flex items-center gap-2", i === activeTab && "active")}
                            >
                                <span
                                    className="w-[6px] h-[6px] rounded-full"
                                    style={{ background: riskCfg.color }}
                                />
                                {r.drug}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Result Cards ────────────────────── */}
            {showTabs ? (
                <div key={activeTab} style={{ animation: "fadeInUp 150ms ease-out" }}>
                    <ResultCard result={results[activeTab]} index={0} />
                </div>
            ) : (
                <div className="space-y-6">
                    {results.map((result, i) => (
                        <ResultCard key={`${result.drug}-${i}`} result={result} index={i} />
                    ))}
                </div>
            )}
        </div>
    );
}
