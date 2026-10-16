"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useBodyScrollLock } from "@/lib/body-scroll-lock";
import { cn } from "@/lib/cn";

type ModalVariant = "dialog" | "drawer" | "fullscreen";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name. Rendered as the dialog label; pass when there is no visible title. */
  title?: string;
  variant?: ModalVariant;
  panelClassName?: string;
  overlayClassName?: string;
  containerClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalShell({
  open,
  onClose,
  children,
  title,
  variant = "dialog",
  panelClassName,
  overlayClassName,
  containerClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockScroll = true,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open && lockScroll);

  // Escape to close, Tab cycles inside the dialog.
  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && closeOnEscape) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [closeOnEscape, onClose, open]);

  // Move focus into the dialog on open and return it on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const target =
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      panel?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel;
    target?.focus();

    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={cn("modal-root", variant === "drawer" && "modal-root-drawer", containerClassName)}>
      <div className={cn("modal-overlay", overlayClassName)} onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn("modal-panel", `modal-panel-${variant}`, panelClassName)}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
