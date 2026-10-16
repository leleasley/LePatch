"use client";

export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-lepatch_csrf|lepatch_csrf)=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function csrfHeaders(): Record<string, string> {
  return { "X-CSRF-Token": getCsrfToken() };
}

export async function csrfFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("X-CSRF-Token", getCsrfToken());
  return fetch(url, { ...init, headers });
}
