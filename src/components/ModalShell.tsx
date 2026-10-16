"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useBodyScrollLock } from "@/lib/body-scroll-lock";

type ModalVariant = "dialog" | "drawer" | "fullscreen";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: ModalVariant;
  panelClassName?: string;
  overlayClassName?: string;
  containerClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ModalShell({
  open,
  onClose,
  children,
  variant = "dialog",
  panelClassName,
  overlayClassName,
  containerClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
  lockScroll = true,
}: ModalShellProps) {
  useBodyScrollLock(open && lockScroll);

  useEffect(() => {
    if (!open || !closeOnEscape) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className={cx("modal-root", variant === "drawer" && "modal-root-drawer", containerClassName)}>
      <div
        className={cx("modal-overlay", overlayClassName)}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div className={cx("modal-panel", `modal-panel-${variant}`, panelClassName)}>
        {children}
      </div>
    </div>,
    document.body
  );
}
