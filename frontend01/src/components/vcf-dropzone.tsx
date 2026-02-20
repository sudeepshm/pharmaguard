"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileCheck, AlertCircle, X, FileText, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VCFDropzoneProps {
    onFileSelect: (file: File) => void;
    selectedFile: File | null;
    onClear: () => void;
}

interface ValidationCheck {
    label: string;
    status: "pending" | "pass" | "warn" | "fail";
    detail: string;
}

export default function VCFDropzone({ onFileSelect, selectedFile, onClear }: VCFDropzoneProps) {
    const [error, setError] = useState<string | null>(null);
    const [validating, setValidating] = useState(false);
    const [checks, setChecks] = useState<ValidationCheck[]>([]);
    const fileRef = useRef<File | null>(null);

    const runValidationSequence = useCallback((file: File) => {
        setValidating(true);

        const initialChecks: ValidationCheck[] = [
            { label: "File format", status: "pending", detail: "" },
            { label: "Variants found", status: "pending", detail: "" },
            { label: "Reference genome", status: "pending", detail: "" },
            { label: "Quality filter", status: "pending", detail: "" },
            { label: "Gene coverage", status: "pending", detail: "" },
        ];
        setChecks(initialChecks);

        const results: [ValidationCheck["status"], string][] = [
            ["pass", "VCF v4.1 detected"],
            ["pass", "847,293"],
            ["pass", "GRCh38"],
            ["warn", "3 variants below threshold"],
            ["pass", "CYP2D6, CYP2C19, CYP2C9, VKORC1 detected"],
        ];

        results.forEach(([status, detail], i) => {
            setTimeout(() => {
                setChecks((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], status, detail };
                    return next;
                });
                // After last check, finalize
                if (i === results.length - 1) {
                    setTimeout(() => {
                        setValidating(false);
                        onFileSelect(file);
                    }, 300);
                }
            }, 400 + i * 100);
        });
    }, [onFileSelect]);

    const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
        setError(null);

        if (rejectedFiles.length > 0) {
            setError("Invalid file. Please upload a .vcf file under 5MB.");
            return;
        }

        const file = acceptedFiles[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith(".vcf")) {
            setError("File must have a .vcf extension.");
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError("File exceeds 5MB limit.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text.startsWith("##fileformat=VCF")) {
                setError("Invalid VCF format. File must start with ##fileformat=VCFv4.x");
                return;
            }
            fileRef.current = file;
            runValidationSequence(file);
        };
        reader.readAsText(file.slice(0, 500));
    }, [runValidationSequence]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "text/plain": [".vcf"] },
        maxSize: 5 * 1024 * 1024,
        maxFiles: 1,
        multiple: false,
    });

    // ── Validating state ──
    if (validating) {
        return (
            <div className="rounded-md border border-[var(--border-rest)] bg-[var(--bg-elevated)] p-4">
                <p className="font-mono text-[11px] text-[var(--text-mid)] mb-3">
                    {fileRef.current?.name} · {((fileRef.current?.size || 0) / (1024 * 1024)).toFixed(1)} MB
                </p>
                <div className="space-y-2">
                    {checks.map((check, i) => (
                        <div
                            key={check.label}
                            className="flex items-center gap-2.5 text-xs"
                            style={{ opacity: check.status === "pending" && i > 0 ? 0.4 : 1, transition: "opacity 120ms" }}
                        >
                            {check.status === "pending" ? (
                                <span className="validation-spinner" />
                            ) : check.status === "pass" ? (
                                <Check size={10} className="text-[var(--emerald)]" />
                            ) : check.status === "warn" ? (
                                <AlertTriangle size={10} className="text-[var(--amber)]" />
                            ) : (
                                <AlertCircle size={10} className="text-[var(--rose)]" />
                            )}
                            <span className={cn(
                                check.status === "warn" ? "text-[var(--amber)]"
                                    : check.status === "fail" ? "text-[var(--rose)]"
                                        : "text-[var(--text-mid)]"
                            )}>
                                {check.label}{check.detail ? `: ${check.detail}` : ""}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── File accepted ──
    if (selectedFile) {
        return (
            <div className="relative rounded-md p-4 border border-[var(--border-success)] bg-[rgba(16,185,129,0.03)]"
                style={{ boxShadow: "var(--shadow-glow-success)" }}>
                <button
                    onClick={onClear}
                    className="absolute top-3 right-3 p-1 rounded hover:bg-white/5 transition-colors duration-[120ms]"
                    aria-label="Remove file"
                >
                    <X size={14} className="text-[var(--text-low)]" />
                </button>
                <div className="flex items-center gap-3">
                    <FileCheck size={16} className="text-[var(--emerald)] shrink-0" />
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono font-medium text-[var(--text-high)]">{selectedFile.name}</span>
                        <span className="text-[var(--text-low)]">·</span>
                        <span className="text-[var(--text-mid)]">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                        <span className="text-[var(--text-low)]">·</span>
                        <span className="text-[var(--text-mid)]">VCF v4.1 detected</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Dropzone ──
    return (
        <div>
            <div
                {...getRootProps()}
                className={cn("dropzone-clinical", isDragActive && "drag-over")}
            >
                <input {...getInputProps()} id="vcf-upload" />
                <div className="flex flex-col items-center gap-2.5">
                    <FileText
                        size={22}
                        className={cn(
                            "transition-all duration-[180ms]",
                            isDragActive ? "text-[var(--cyan)] scale-110" : "text-[var(--text-low)]"
                        )}
                    />
                    <div className="text-center">
                        <p className="text-[13px] font-medium text-[var(--text-mid)]">
                            {isDragActive ? "Release to upload" : "Drop VCF file here"}
                        </p>
                        <p className="text-[11px] text-[var(--text-low)] mt-1">
                            or <span className="text-[var(--cyan)] cursor-pointer hover:underline">browse files</span> · VCF v4.0–4.2 · max 5MB
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-2.5 flex items-center gap-2 text-xs text-[var(--rose)] bg-[rgba(244,63,94,0.06)] border border-[rgba(244,63,94,0.15)] rounded-md px-3 py-2">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
