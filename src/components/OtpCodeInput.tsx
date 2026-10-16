"use client";

import { useEffect, useId, useRef } from "react";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  name?: string;
  label?: string;
};

export function OtpCodeInput({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  name = "mfa-code",
  label = "One-time code",
}: OtpCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  const digits = value.padEnd(length).slice(0, length).split("");

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div
        className="relative cursor-text"
        onClick={() => inputRef.current?.focus()}
        aria-hidden="true"
      >
        <input
          id={id}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, length))}
          className="absolute inset-0 z-10 h-full w-full text-transparent caret-transparent"
          aria-label={label}
        />
        <div className="grid grid-cols-6 gap-2 sm:gap-3">
          {digits.map((digit, index) => {
            const hasDigit = index < value.length;
            const isActive = index === value.length || (value.length >= length && index === length - 1);
            return (
              <div
                key={`${id}-${index}`}
                className={[
                  "flex h-14 items-center justify-center rounded-2xl border text-xl font-semibold transition-all sm:h-16 sm:text-2xl",
                  hasDigit
                    ? "border-cyan-400/60 bg-cyan-400/10 text-white shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                    : "border-white/10 bg-white/[0.03] text-slate-500",
                  isActive ? "ring-2 ring-cyan-400/40" : "",
                  disabled ? "opacity-60" : "",
                ].join(" ")}
              >
                <span className="font-mono">{digit.trim() ? digit : ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">You can type or paste the full code.</p>
    </div>
  );
}
