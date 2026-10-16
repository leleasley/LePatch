"use client";

import { useEffect } from "react";

let bodyScrollLockCount = 0;
let previousOverflow = "";
let previousPaddingRight = "";

function lockBodyScroll() {
  if (typeof document === "undefined") return;

  if (bodyScrollLockCount === 0) {
    const body = document.body;
    const docEl = document.documentElement;
    const scrollbarWidth = Math.max(0, window.innerWidth - docEl.clientWidth);

    previousOverflow = body.style.overflow;
    previousPaddingRight = body.style.paddingRight;

    body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight || "0");
      body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }
  }

  bodyScrollLockCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === "undefined" || bodyScrollLockCount === 0) return;

  bodyScrollLockCount -= 1;

  if (bodyScrollLockCount === 0) {
    const body = document.body;
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
  }
}

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [locked]);
}
