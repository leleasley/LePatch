"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const baseField =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text placeholder:text-text-faint " +
  "transition-colors focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * Text input with a real label.
 *
 * The previous inputs were labelled only by placeholder text, which is
 * invisible to screen readers and disappears as soon as you type.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; error?: string }>(
  function Input({ className, label, hint, error, id, ...props }, ref) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = [hint ? `${inputId}-hint` : null, error ? `${inputId}-error` : null]
      .filter(Boolean)
      .join(" ");

    const field = (
      <input
        ref={ref}
        id={inputId}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={cn(baseField, error && "border-status-danger", className)}
        {...props}
      />
    );

    if (!label && !hint && !error) return field;

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-text-muted">
            {label}
          </label>
        )}
        {field}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-text-faint">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-status-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }>(
  function Textarea({ className, label, error, id, rows = 4, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={fieldId} className="text-xs font-medium text-text-muted">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          aria-invalid={error ? true : undefined}
          className={cn(baseField, "resize-y font-normal", error && "border-status-danger", className)}
          {...props}
        />
        {error && (
          <p className="text-xs text-status-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }>(
  function Select({ className, label, hint, id, children, ...props }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={fieldId} className="text-xs font-medium text-text-muted">
            {label}
          </label>
        )}
        <select ref={ref} id={fieldId} className={cn(baseField, className)} {...props}>
          {children}
        </select>
        {hint && <p className="text-xs text-text-faint">{hint}</p>}
      </div>
    );
  }
);

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-text-faint">{hint}</p>}
      {error && (
        <p className="text-xs text-status-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Checkbox rendered as a switch with correct ARIA and keyboard behaviour. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  return (
    <div className="flex items-start gap-3">
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-border bg-surface-elevated",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
      <label htmlFor={switchId} className="cursor-pointer select-none">
        <span className="block text-sm font-medium text-text">{label}</span>
        {description && <span className="block text-xs text-text-muted">{description}</span>}
      </label>
    </div>
  );
}