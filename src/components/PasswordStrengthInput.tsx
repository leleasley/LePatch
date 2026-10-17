"use client";

import { useId, useState } from "react";
import { KeyRound, Check, Copy, Eye, EyeOff } from "lucide-react";

export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-status-danger" };
  if (score <= 4) return { score, label: "Medium", color: "bg-status-warning" };
  return { score, label: "Strong", color: "bg-status-success" };
}

export function generatePassword(length = 20): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = upper + lower + digits + symbols;

  const pw: string[] = [];
  pw.push(upper[Math.floor(Math.random() * upper.length)]);
  pw.push(lower[Math.floor(Math.random() * lower.length)]);
  pw.push(digits[Math.floor(Math.random() * digits.length)]);
  pw.push(symbols[Math.floor(Math.random() * symbols.length)]);
  for (let i = pw.length; i < length; i++) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const { score, label, color } = passwordStrength(password);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? color : "bg-border"}`}
          />
        ))}
      </div>
      <p
        className={`mt-1 text-xs ${
          score <= 2 ? "text-status-danger" : score <= 4 ? "text-status-warning" : "text-status-success"
        }`}
      >
        {label}
      </p>
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  placeholder,
  label,
  showGenerate = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
  showGenerate?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputId = useId();

  function handleGenerate() {
    onChange(generatePassword());
  }

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-text-muted">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 pr-16 text-sm text-text placeholder:text-text-faint transition-colors focus:border-accent"
        />
        <div className="absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            className="icon-button h-7 w-7"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              className="icon-button h-7 w-7"
              aria-label="Copy password"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-status-success" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
      {showGenerate && (
        <div className="mt-1">
          <button type="button" onClick={handleGenerate} className="btn btn--ghost btn--sm">
            <KeyRound className="h-3 w-3" aria-hidden="true" />
            Generate
          </button>
        </div>
      )}
      <StrengthMeter password={value} />
    </div>
  );
}
