"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { pendingAppNameStorageKey } from "@/lib/pending-navigation";

type LinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  appName: string;
};

export function AppDetailLink({ href, appName, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    try {
      window.sessionStorage.setItem(pendingAppNameStorageKey, appName);
    } catch {
      // Ignore storage failures; navigation still works.
    }
    onClick?.(event);
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}
