"use client";

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/cn";

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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      <div className="relative cursor-text" onClick={() => inputRef.current?.focus()}>
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
        <div
          aria-hidden="true"
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
        >
          {digits.map((digit, index) => {
            const hasDigit = index < value.length;
            const isActive = index === value.length || (value.length >= length && index === length - 1);
            return (
              <div
                key={`${id}-${index}`}
                className={cn(
                  "flex h-12 items-center justify-center rounded-md border text-lg font-semibold transition-colors",
                  hasDigit ? "border-accent/60 bg-accent/10 text-text" : "border-border bg-surface text-text-muted",
                  isActive && "border-accent ring-1 ring-accent/50",
                  disabled && "opacity-60"
                )}
              >
                <span className="font-mono">{digit.trim() ? digit : ""}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-text-faint">You can type or paste the full code.</p>
    </div>
  );
}
