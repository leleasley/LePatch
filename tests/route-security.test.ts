import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const apiRoot = path.join(process.cwd(), "src/app/api");

/**
 * Matches BOTH handler styles used in this codebase:
 *   export async function POST() {}
 *   export const POST = adminMutationHandler(...)
 *
 * The previous pattern only matched `export async function`, which silently
 * skipped 13 mutating routes — including every integration endpoint.
 */
const mutatingRoutePattern = new RegExp(
  String.raw`export\s+(?:async\s+function\s+(POST|PUT|PATCH|DELETE)\b|(?:const|let|var)\s+(POST|PUT|PATCH|DELETE)\s*=)`,
  "g"
);

function mutatingMethods(source: string): string[] {
  return Array.from(source.matchAll(mutatingRoutePattern), (match) => match[1] || match[2]);
}

const exemptions = new Map<string, string>([
  ["src/app/api/auth/login/route.ts", "public login endpoint"],
  ["src/app/api/auth/logout/route.ts", "logout accepts stale sessions and clears cookies"],
  ["src/app/api/auth/mfa-verify/route.ts", "public MFA pre-session endpoint"],
  ["src/app/api/setup/complete/route.ts", "first-user setup endpoint guarded by user count"],
  ["src/app/api/setup/test/route.ts", "first-user setup endpoint guarded by user count"],
  ["src/app/api/webauthn/auth/verify/route.ts", "public passkey auth endpoint"],
  ["src/app/api/webhook/telegram/route.ts", "external Telegram webhook endpoint"],
]);

function routeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(fullPath);
    return entry.name === "route.ts" ? [fullPath] : [];
  });
}

interface RouteFile {
  file: string;
  relative: string;
  source: string;
  methods: string[];
}

function loadRoutes(root: string): RouteFile[] {
  return routeFiles(root)
    .map((file) => {
      const source = fs.readFileSync(file, "utf8");
      return { file, relative: path.relative(process.cwd(), file), source, methods: mutatingMethods(source) };
    })
    .filter((route) => route.methods.length > 0);
}

describe("mutating API route protection", () => {
  it("finds the mutating routes it is meant to guard", () => {
    // Guards against the regex silently matching nothing again.
    const routes = loadRoutes(apiRoot);
    expect(routes.length).toBeGreaterThan(30);

    const viaConst = routes.filter((route) => route.source.includes("MutationHandler") || route.source.includes("RequestHandler"));
    expect(viaConst.length).toBeGreaterThan(0);
  });

  it("requires CSRF validation or an explicit non-browser exemption", () => {
    const offenders = loadRoutes(apiRoot)
      .filter(({ relative }) => !exemptions.has(relative))
      .filter(({ source }) => {
        const hasCsrfProtection =
          source.includes("validateCsrf(") ||
          /(mutationHandler|userMutationHandler|adminMutationHandler)\(/.test(source);
        return !hasCsrfProtection;
      })
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("declares an authentication category for every mutating route", () => {
    const offenders = loadRoutes(apiRoot)
      .filter(({ relative }) => !exemptions.has(relative))
      .filter(({ source }) => {
        const hasAuth =
          /(requireAdmin|requireModerator|requireSession|assertApiSession|getCurrentUser|assertCanManageApps|verifyMfaSetupToken|createMfaToken)\(/.test(source) ||
          /(userMutationHandler|adminMutationHandler|setupRequestHandler|webhookRequestHandler)\(/.test(source);
        return !hasAuth;
      })
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("requires admin auth on mutating admin routes", () => {
    const offenders = loadRoutes(path.join(apiRoot, "admin"))
      .filter(({ source }) => {
        const hasAdminAuth =
          /(requireAdmin|requireModerator)\(/.test(source) || source.includes("adminMutationHandler(");
        return !hasAdminAuth;
      })
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("requires audit logging for mutating admin routes", () => {
    const offenders = loadRoutes(path.join(apiRoot, "admin"))
      .filter(({ source }) => !source.includes("createAuditLog("))
      .map(({ relative, methods }) => `${relative} (${methods.join(", ")})`);

    expect(offenders).toEqual([]);
  });

  it("never exposes notification channel configuration to non-admins", () => {
    // Regression guard: the deleted /api/notifications route returned the
    // decrypted Discord webhook URL and Telegram bot token to any session.
    const offenders: string[] = [];
    for (const route of routeFiles(apiRoot)) {
      const source = fs.readFileSync(route, "utf8");
      if (!/decryptJson/.test(source)) continue;
      if (!/export\s+(?:async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b|(?:const|let|var)\s+(GET|POST|PUT|PATCH|DELETE)\s*=)/.test(source)) {
        continue;
      }
      if (!/(requireAdmin|requireModerator)\(/.test(source) && !source.includes("adminMutationHandler(")) {
        offenders.push(path.relative(process.cwd(), route));
      }
    }
    expect(offenders).toEqual([]);
  });
});