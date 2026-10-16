import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { validateCsrf, rejectedCsrfResponse } from "@/lib/csrf";
import { handleApiError } from "@/lib/http";
import { assertApiSession, requireAdmin } from "@/lib/auth";

export function mutationHandler(
  fn: (request: Request, ...args: any[]) => Promise<NextResponse>,
  skipCsrf = false
) {
  return async (request: Request, ...args: any[]) => {
    if (!skipCsrf && !validateCsrf(request)) return rejectedCsrfResponse();
    try {
      return await fn(request, ...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

export function userMutationHandler<T extends any[]>(
  fn: (context: { request: NextRequest; session: Awaited<ReturnType<typeof assertApiSession>> }, ...args: T) => Promise<NextResponse>
) {
  return mutationHandler(async (request: Request, ...args: T) => {
    const nextRequest = request as NextRequest;
    const session = await assertApiSession();
    return fn({ request: nextRequest, session }, ...args);
  });
}

export function adminMutationHandler<T extends any[]>(
  fn: (context: { request: NextRequest; user: Awaited<ReturnType<typeof requireAdmin>> }, ...args: T) => Promise<NextResponse>
) {
  return mutationHandler(async (request: Request, ...args: T) => {
    const nextRequest = request as NextRequest;
    const user = await requireAdmin();
    return fn({ request: nextRequest, user }, ...args);
  });
}

export function setupRequestHandler<T extends any[]>(
  fn: (context: { request: NextRequest }, ...args: T) => Promise<NextResponse>,
  skipCsrf = false
) {
  return mutationHandler(async (request: Request, ...args: T) => {
    return fn({ request: request as NextRequest }, ...args);
  }, skipCsrf);
}

export function webhookRequestHandler<T extends any[]>(
  fn: (context: { request: NextRequest }, ...args: T) => Promise<NextResponse>
) {
  return async (request: NextRequest, ...args: T) => {
    try {
      return await fn({ request }, ...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

