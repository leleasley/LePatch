/**
 * Shared pagination parsing for list endpoints.
 *
 * Ten routes previously hand-rolled `Math.max(1, parseInt(...))` with
 * inconsistent caps. Keeping it in one place means every list endpoint agrees
 * on defaults, maximum page size, and the derived `skip`.
 */
export const DEFAULT_PER_PAGE = 25;
export const MAX_PER_PAGE = 100;

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaultPerPage = DEFAULT_PER_PAGE,
  maxPerPage = MAX_PER_PAGE
) {
  const page = clampInt(searchParams.get("page"), 1, 1, 100_000);
  const perPage = clampInt(searchParams.get("perPage"), defaultPerPage, 1, maxPerPage);
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}