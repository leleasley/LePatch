import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("creates stable URL slugs", () => {
    expect(slugify("Nginx Proxy Manager NginxProxyManager/nginx-proxy-manager")).toBe(
      "nginx-proxy-manager-nginxproxymanager-nginx-proxy-manager"
    );
  });

  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("foo@bar!baz")).toBe("foo-bar-baz");
  });

  it("collapses multiple spaces/hyphens into one", () => {
    expect(slugify("a   b---c")).toBe("a-b-c");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello-world--")).toBe("hello-world");
  });

  it("truncates at 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(slugify("!!! @@@ ###")).toBe("");
  });

  it("preserves numbers", () => {
    expect(slugify("v1.2.3-alpha")).toBe("v1-2-3-alpha");
  });
});
