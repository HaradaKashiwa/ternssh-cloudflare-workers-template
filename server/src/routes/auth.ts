import { Hono } from "hono";
import { getAuthMode, IdentityError, unauthorizedResponse } from "../auth/identity";
import {
  getBasicAuthCredentials,
  updateBasicAuthCredentials,
} from "../db/basic-auth-credentials";
import type { Variables } from "../types";

const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

function jsonError(c: { json: (body: unknown, status?: number) => Response }, status: number, message: string) {
  return c.json({ error: message }, status);
}

function validateCredentialUpdate(body: {
  currentPassword?: unknown;
  username?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}):
  | {
      currentPassword: string;
      username?: string;
      newPassword?: string;
    }
  | { error: string } {
  if (typeof body.currentPassword !== "string" || !body.currentPassword) {
    return { error: "Current password is required" };
  }

  const username =
    body.username === undefined
      ? undefined
      : typeof body.username === "string"
        ? body.username.trim()
        : null;
  if (username === null) {
    return { error: "Username must be a string" };
  }
  if (username !== undefined) {
    if (!username) return { error: "Username is required" };
    if (username.length > MAX_USERNAME_LENGTH) {
      return {
        error: `Username must be at most ${MAX_USERNAME_LENGTH} characters`,
      };
    }
  }

  const newPassword =
    body.newPassword === undefined
      ? undefined
      : typeof body.newPassword === "string"
        ? body.newPassword
        : null;
  if (newPassword === null) {
    return { error: "New password must be a string" };
  }

  if (newPassword !== undefined) {
    if (!newPassword) return { error: "New password is required" };
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      };
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return {
        error: `New password must be at most ${MAX_PASSWORD_LENGTH} characters`,
      };
    }
    if (typeof body.confirmPassword !== "string") {
      return { error: "Password confirmation is required" };
    }
    if (newPassword !== body.confirmPassword) {
      return { error: "Passwords do not match" };
    }
  }

  return {
    currentPassword: body.currentPassword,
    username,
    newPassword,
  };
}

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoutes.get("/credentials", async (c) => {
  const mode = await getAuthMode(c.env);
  if (mode !== "basic") {
    return jsonError(c, 404, "Not available in this auth mode");
  }

  const credentials = await getBasicAuthCredentials(c.env.DB);
  if (!credentials) {
    return jsonError(c, 404, "Credentials not configured");
  }

  return c.json({ username: credentials.username });
});

authRoutes.put("/credentials", async (c) => {
  const mode = await getAuthMode(c.env);
  if (mode !== "basic") {
    return jsonError(c, 404, "Not available in this auth mode");
  }

  let body: {
    currentPassword?: unknown;
    username?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return jsonError(c, 400, "Invalid JSON body");
  }

  const validated = validateCredentialUpdate(body);
  if ("error" in validated) {
    return jsonError(c, 400, validated.error);
  }

  try {
    const result = await updateBasicAuthCredentials(c.env.DB, validated);
    return c.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update credentials";
    const status = message === "Current password is incorrect" ? 403 : 400;
    return jsonError(c, status, message);
  }
});

authRoutes.post("/logout", (c) => {
  return unauthorizedResponse(
    new IdentityError("Logged out", 401, "basic"),
    true,
  );
});
