"use client";

import { useState } from "react";
import { KeyRound, Check, Copy, Eye, EyeOff } from "lucide-react";

export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Medium", color: "bg-amber-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
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
    <div className="mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? color : "bg-slate-700"
            }`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs ${score <= 2 ? "text-red-400" : score <= 4 ? "text-amber-400" : "text-emerald-400"}`}>
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

  function handleGenerate() {
    onChange(generatePassword());
  }

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      {label && <label className="block text-sm text-slate-300 font-medium mb-1.5">{label}</label>}
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line/50 bg-surface px-3 py-2.5 pr-20 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500/50 transition-colors"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="rounded-md p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          {value && (
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1.5 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Copy password"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {showGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 transition-colors"
          >
            <KeyRound className="h-3 w-3" />
            Generate
          </button>
        )}
      </div>
      <StrengthMeter password={value} />
    </div>
  );
}
