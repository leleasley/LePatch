import { describe, expect, it } from "vitest";
import { parsePagination, DEFAULT_PER_PAGE, MAX_PER_PAGE } from "@/lib/pagination";

function params(query: string) {
  return new URLSearchParams(query);
}

describe("parsePagination", () => {
  it("defaults when no values are supplied", () => {
    const result = parsePagination(params(""));
    expect(result).toEqual({ page: 1, perPage: DEFAULT_PER_PAGE, skip: 0, take: DEFAULT_PER_PAGE });
  });

  it("computes skip from page and perPage", () => {
    expect(parsePagination(params("page=3&perPage=20"))).toEqual({
      page: 3,
      perPage: 20,
      skip: 40,
      take: 20,
    });
  });

  it("clamps the page size to the maximum", () => {
    expect(parsePagination(params("perPage=100000")).perPage).toBe(MAX_PER_PAGE);
  });

  it("clamps a zero or negative page size to 1", () => {
    expect(parsePagination(params("perPage=0")).perPage).toBe(1);
    expect(parsePagination(params("perPage=-5")).perPage).toBe(1);
  });

  it("falls back for garbage input", () => {
    expect(parsePagination(params("page=abc")).page).toBe(1);
    expect(parsePagination(params("perPage=abc")).perPage).toBe(DEFAULT_PER_PAGE);
  });

  it("clamps a zero page to the first page", () => {
    expect(parsePagination(params("page=0")).page).toBe(1);
    expect(parsePagination(params("page=-3")).page).toBe(1);
  });

  it("honours custom defaults and caps", () => {
    const result = parsePagination(params(""), 50, 200);
    expect(result.perPage).toBe(50);
    expect(parsePagination(params("perPage=150"), 50, 200).perPage).toBe(150);
  });
});