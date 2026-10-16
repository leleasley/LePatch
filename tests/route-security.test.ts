import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.join(process.cwd(), "src/app/api");
const mutatingRoutePattern = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g;

const explicitExemptions = new Map<string, { category: "agent" | "public-auth" | "setup" | "webhook"; reason: string }>([
  ["src/app/api/auth/login/route.ts", { category: "public-auth", reason: "public login endpoint" }],
  ["src/app/api/auth/logout/route.ts", { category: "public-auth", reason: "logout accepts stale sessions and clears cookies" }],
  ["src/app/api/auth/mfa-check/route.ts", { category: "public-auth", reason: "public MFA pre-session endpoint" }],
  ["src/app/api/auth/mfa-verify/route.ts", { category: "public-auth", reason: "public MFA pre-session endpoint" }],
  ["src/app/api/setup/complete/route.ts", { category: "setup", reason: "first-user setup endpoint guarded by user count" }],
  ["src/app/api/setup/test/route.ts", { category: "setup", reason: "first-user setup endpoint guarded by user count" }],
  ["src/app/api/webauthn/auth/verify/route.ts", { category: "public-auth", reason: "public passkey auth endpoint" }],
  ["src/app/api/webhook/telegram/route.ts", { category: "webhook", reason: "external Telegram webhook endpoint" }],
]);

const auditExemptions = new Map<string, string>([
]);

function routeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  });
}

describe("mutating API route protection", () => {
  it("requires CSRF validation or an explicit non-browser exemption", () => {
    const offenders = routeFiles(apiRoot)
      .map((file) => {
        const source = fs.readFileSync(file, "utf8");
        const methods = Array.from(source.matchAll(mutatingRoutePattern), (match) => match[1]);
        return { file, source, methods };
      })
      .filter(({ methods }) => methods.length > 0)
      .filter(({ file, source }) => {
        const relative = path.relative(process.cwd(), file);
        if (explicitExemptions.has(relative)) return false;
        const hasCsrfProtection =
          source.includes("validateCsrf(") ||
          /(mutationHandler|userMutationHandler|adminMutationHandler)\(/.test(source);
        return !hasCsrfProtection;
      })
      .map(({ file, methods }) => `${path.relative(process.cwd(), file)} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("declares an authentication category for every mutating route", () => {
    const offenders = routeFiles(apiRoot)
      .map((file) => {
        const source = fs.readFileSync(file, "utf8");
        const relative = path.relative(process.cwd(), file);
        const methods = Array.from(source.matchAll(mutatingRoutePattern), (match) => match[1]);
        return { file, relative, source, methods };
      })
      .filter(({ methods }) => methods.length > 0)
      .filter(({ relative, source }) => {
        if (explicitExemptions.has(relative)) return false;
        const hasAuth =
          /(requireAdmin|requireModerator|assertApiSession|getCurrentUser|requireSession|authenticateAgentRequest|verifyMfaSetupToken)\(/.test(source) ||
          /(userMutationHandler|adminMutationHandler|agentRequestHandler|setupRequestHandler|webhookRequestHandler)\(/.test(source);
        return !hasAuth;
      })
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("requires admin auth on mutating admin routes", () => {
    const offenders = routeFiles(path.join(apiRoot, "admin"))
      .map((file) => {
        const source = fs.readFileSync(file, "utf8");
        const methods = Array.from(source.matchAll(mutatingRoutePattern), (match) => match[1]);
        return { file, source, methods };
      })
      .filter(({ methods }) => methods.length > 0)
      .filter(({ source }) => {
        const hasAdminAuth =
          /(requireAdmin|requireModerator)\(/.test(source) ||
          source.includes("adminMutationHandler(");
        return !hasAdminAuth;
      })
      .map(({ file, methods }) => `${path.relative(process.cwd(), file)} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("requires audit logging or explicit exemption for mutating admin/server routes", () => {
    const scopedRoots = [path.join(apiRoot, "admin")];
    const offenders = scopedRoots
      .flatMap(routeFiles)
      .map((file) => {
        const source = fs.readFileSync(file, "utf8");
        const relative = path.relative(process.cwd(), file);
        const methods = Array.from(source.matchAll(mutatingRoutePattern), (match) => match[1]);
        return { relative, source, methods };
      })
      .filter(({ methods }) => methods.length > 0)
      .filter(({ relative, source }) => {
        if (auditExemptions.has(relative)) return false;
        return !source.includes("createAuditLog(");
      })
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });
});
