import { Hono } from "hono";
import { getAuthMode } from "../auth/identity";
import { createBasicAuthCredentials } from "../db/basic-auth-credentials";

const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

function validateSetupInput(body: {
  username?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
}): { username: string; password: string } | { error: string } {
  if (typeof body.username !== "string" || !body.username.trim()) {
    return { error: "Username is required" };
  }

  if (typeof body.password !== "string" || !body.password) {
    return { error: "Password is required" };
  }

  if (typeof body.confirmPassword !== "string") {
    return { error: "Password confirmation is required" };
  }

  const username = body.username.trim();
  if (username.length > MAX_USERNAME_LENGTH) {
    return { error: `Username must be at most ${MAX_USERNAME_LENGTH} characters` };
  }

  if (body.password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    };
  }

  if (body.password.length > MAX_PASSWORD_LENGTH) {
    return {
      error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    };
  }

  if (body.password !== body.confirmPassword) {
    return { error: "Passwords do not match" };
  }

  return { username, password: body.password };
}

export const onboardingRoutes = new Hono<{ Bindings: Env }>();

onboardingRoutes.get("/status", async (c) => {
  return c.json({ authMode: await getAuthMode(c.env) });
});

onboardingRoutes.post("/setup", async (c) => {
  const mode = await getAuthMode(c.env);
  if (mode !== "onboarding") {
    return c.json({ error: "Setup already completed" }, 403);
  }

  let body: {
    username?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const validated = validateSetupInput(body);
  if ("error" in validated) {
    return c.json({ error: validated.error }, 400);
  }

  try {
    await createBasicAuthCredentials(
      c.env.DB,
      validated.username,
      validated.password,
    );
    return c.json({ ok: true }, 201);
  } catch (error) {
    console.error("onboarding setup failed", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create credentials",
      },
      500,
    );
  }
});
