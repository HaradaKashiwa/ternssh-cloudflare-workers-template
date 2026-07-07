import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  getBasicAuthCredentials,
  hasBasicAuthCredentials,
  timingSafeEqual,
  verifyPassword,
} from "../db/basic-auth-credentials";
import {
  clearBasicAuthLockout,
  getBasicAuthClientKey,
  getBasicAuthLockoutState,
  recordBasicAuthFailure,
} from "../db/basic-auth-lockout";
import { ensureDefaultUser } from "../db/users";
import type { User } from "../types";

export type AuthMode = "access" | "basic" | "onboarding";

function isAccessConfigured(env: Env): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN?.trim() && env.ACCESS_AUD?.trim());
}

function normalizeTeamDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function normalizeAud(raw: string): string {
  return raw.trim();
}

function basicAuthLockoutError(retryAfterSeconds: number | null): IdentityError {
  return new IdentityError(
    "Too many failed login attempts. Try again in 1 hour.",
    429,
    undefined,
    retryAfterSeconds,
  );
}

export async function getAuthMode(env: Env): Promise<AuthMode> {
  if (isAccessConfigured(env)) {
    return "access";
  }

  if (await hasBasicAuthCredentials(env.DB)) {
    return "basic";
  }

  return "onboarding";
}

async function verifyBasicAuth(
  request: Request,
  env: Env,
): Promise<void> {
  const credentials = await getBasicAuthCredentials(env.DB);
  if (!credentials) {
    throw new IdentityError("Basic authentication not configured", 500);
  }

  const clientKey = getBasicAuthClientKey(request);
  const lockout = await getBasicAuthLockoutState(env.DB, clientKey);
  if (lockout.locked) {
    throw basicAuthLockoutError(lockout.retryAfterSeconds);
  }

  const header = request.headers.get("Authorization");

  if (!header?.startsWith("Basic ")) {
    throw new IdentityError("Basic authentication required", 401, "basic");
  }

  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    await recordBasicAuthFailure(env.DB, clientKey);
    throw new IdentityError("Invalid basic authentication credentials", 401, "basic");
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) {
    await recordBasicAuthFailure(env.DB, clientKey);
    throw new IdentityError("Invalid basic authentication credentials", 401, "basic");
  }

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const usernameMatches = timingSafeEqual(username, credentials.username);
  const passwordMatches = await verifyPassword(
    password,
    credentials.passwordHash,
    credentials.salt,
  );

  if (!usernameMatches || !passwordMatches) {
    await recordBasicAuthFailure(env.DB, clientKey);
    const lockoutAfterFailure = await getBasicAuthLockoutState(env.DB, clientKey);
    if (lockoutAfterFailure.locked) {
      throw basicAuthLockoutError(lockoutAfterFailure.retryAfterSeconds);
    }
    throw new IdentityError("Invalid basic authentication credentials", 401, "basic");
  }

  await clearBasicAuthLockout(env.DB, clientKey);
}

async function verifyAccessJwt(token: string, env: Env): Promise<void> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new IdentityError(
      "ACCESS_TEAM_DOMAIN and ACCESS_AUD must be configured",
      500,
    );
  }

  const teamDomain = normalizeTeamDomain(env.ACCESS_TEAM_DOMAIN);
  const audience = normalizeAud(env.ACCESS_AUD);
  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(
    new URL(`${issuer}/cdn-cgi/access/certs`),
  );

  try {
    await jwtVerify(token, jwks, {
      issuer,
      audience,
    });
  } catch (error) {
    if (error instanceof IdentityError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Access JWT verification failed";
    throw new IdentityError(`Access JWT verification failed: ${message}`, 401);
  }
}

export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<void> {
  const mode = await getAuthMode(env);

  if (mode === "onboarding") {
    throw new IdentityError("Setup required", 403);
  }

  if (mode === "basic") {
    await verifyBasicAuth(request, env);
  }

  if (mode === "access") {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) {
      throw new IdentityError("Missing Cf-Access-Jwt-Assertion header", 401);
    }
    await verifyAccessJwt(token, env);
  }
}

export async function resolveUser(request: Request, env: Env): Promise<User> {
  await authenticateRequest(request, env);
  return ensureDefaultUser(env.DB);
}

export class IdentityError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly challenge?: "basic",
    readonly retryAfterSeconds?: number | null,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

export function unauthorizedResponse(
  error: IdentityError,
  acceptsJson: boolean,
): Response {
  const headers = new Headers();
  if (error.challenge === "basic") {
    headers.set("WWW-Authenticate", 'Basic realm="ternssh"');
  }
  if (error.status === 429 && error.retryAfterSeconds) {
    headers.set("Retry-After", String(error.retryAfterSeconds));
  }

  if (acceptsJson) {
    headers.set("Content-Type", "application/json");
    return Response.json({ error: error.message }, { status: error.status, headers });
  }

  return new Response(error.message, { status: error.status, headers });
}

export async function getDefaultUserSnapshot(env: Env): Promise<User> {
  return ensureDefaultUser(env.DB);
}
