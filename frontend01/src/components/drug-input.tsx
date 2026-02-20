"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { X, Search } from "lucide-react";
import { cn, KNOWN_DRUGS } from "@/lib/utils";

interface DrugInputProps {
    drugs: string[];
    onChange: (drugs: string[]) => void;
}

const QUICK_ADD = ["CODEINE", "WARFARIN", "CLOPIDOGREL", "SIMVASTATIN", "AZATHIOPRINE", "FLUOROURACIL"];

/* Gene mapping for gene preview */
const GENE_MAP: Record<string, string[]> = {
    CODEINE: ["CYP2D6"],
    TRAMADOL: ["CYP2D6", "CYP2B6"],
    OXYCODONE: ["CYP2D6"],
    TAMOXIFEN: ["CYP2D6"],
    WARFARIN: ["CYP2C9", "VKORC1", "CYP4F2"],
    PHENYTOIN: ["CYP2C9", "HLA-B"],
    CELECOXIB: ["CYP2C9"],
    CLOPIDOGREL: ["CYP2C19"],
    VORICONAZOLE: ["CYP2C19"],
    OMEPRAZOLE: ["CYP2C19"],
    TACROLIMUS: ["CYP3A5"],
    FLUOROURACIL: ["DPYD"],
    CAPECITABINE: ["DPYD"],
    AZATHIOPRINE: ["TPMT", "NUDT15"],
    MERCAPTOPURINE: ["TPMT", "NUDT15"],
    THIOGUANINE: ["TPMT", "NUDT15"],
    SIMVASTATIN: ["SLCO1B1"],
    ATORVASTATIN: ["SLCO1B1"],
    ROSUVASTATIN: ["SLCO1B1", "ABCG2"],
    METOPROLOL: ["CYP2D6"],
};

export default function DrugInput({ drugs, onChange }: DrugInputProps) {
    const [input, setInput] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const suggestions = KNOWN_DRUGS.filter(
        (d) => d.toLowerCase().includes(input.toLowerCase()) && !drugs.includes(d)
    ).slice(0, 6);

    const addDrug = (drug: string) => {
        const normalized = drug.trim().toUpperCase();
        if (normalized && !drugs.includes(normalized)) {
            onChange([...drugs, normalized]);
        }
        setInput("");
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    const removeDrug = (drug: string) => {
        onChange(drugs.filter((d) => d !== drug));
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            if (input.trim()) addDrug(input);
        } else if (e.key === "Backspace" && !input && drugs.length > 0) {
            removeDrug(drugs[drugs.length - 1]);
        }
    };

    return (
        <div className="relative">
            <div className="section-label">Drugs to Analyze</div>

            <div
                className={cn(
                    "flex flex-wrap items-center gap-1.5 rounded-md border px-3 py-2.5 min-h-[44px]",
                    "border-[var(--border-rest)] bg-[var(--bg-elevated)]",
                    "drug-input-container"
                )}
                onClick={() => inputRef.current?.focus()}
            >
                {drugs.map((drug) => (
                    <span key={drug} className="drug-chip">
                        {drug}
                        <button
                            onClick={(e) => { e.stopPropagation(); removeDrug(drug); }}
                            aria-label={`Remove ${drug}`}
                        >
                            <X size={10} />
                        </button>
                    </span>
                ))}

                <div className="flex items-center gap-1.5 flex-1 min-w-[100px]">
                    <Search size={12} className="text-[var(--text-low)] shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder={drugs.length === 0 ? "Search drugs..." : "Add more..."}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-high)] placeholder:text-[var(--text-low)]"
                        id="drug-input"
                    />
                </div>
            </div>

            <p className="mt-1.5 text-[10px] text-[var(--text-low)]">
                Press Enter or comma to add{drugs.length > 0 && ` · ${drugs.length} selected`}
            </p>

            {/* Gene preview */}
            {drugs.length > 0 && (
                <div className="mt-2 space-y-0.5">
                    {drugs.map((drug) => {
                        const genes = GENE_MAP[drug];
                        if (!genes) return null;
                        return (
                            <p key={drug} className="font-mono text-[10px] text-[var(--text-low)] animate-fade-in-up">
                                {drug} → ↳ {genes.join(" · ")}
                            </p>
                        );
                    })}
                </div>
            )}

            {/* Quick Add row */}
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] text-[var(--text-low)] uppercase tracking-[0.12em] font-semibold mr-1">Common PGx Drugs</span>
                {QUICK_ADD.filter((d) => !drugs.includes(d)).map((drug) => (
                    <button key={drug} onClick={() => addDrug(drug)} className="ghost-chip">
                        {drug}
                    </button>
                ))}
            </div>

            {/* Autocomplete */}
            {showSuggestions && input.length > 0 && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 py-1 rounded-md border border-[var(--border-rest)] bg-[var(--bg-surface)] shadow-lg shadow-black/30">
                    {suggestions.map((drug) => (
                        <button
                            key={drug}
                            onMouseDown={() => addDrug(drug)}
                            className="w-full text-left px-3 py-1.5 text-sm text-[var(--text-high)] hover:bg-[var(--bg-elevated)] transition-colors duration-100"
                        >
                            {drug}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
