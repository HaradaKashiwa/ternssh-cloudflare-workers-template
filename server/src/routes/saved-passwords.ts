import { Hono } from "hono";
import {
  deleteSavedPassword,
  listSavedPasswords,
  upsertSavedPassword,
} from "../db/saved-passwords";
import { jsonError } from "../lib/http";
import type { Variables } from "../types";

export const savedPasswordRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

savedPasswordRoutes.get("/", async (c) => {
  const user = c.get("user");
  const passwords = await listSavedPasswords(c.env.DB, user.id);
  return c.json({ passwords });
});

savedPasswordRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; value?: string }>();

  if (body.value === undefined || body.value === "") {
    return jsonError(c, 400, "value is required");
  }

  try {
    const password = await upsertSavedPassword(c.env.DB, user.id, {
      name: body.name?.trim() ?? "",
      value: body.value,
    });
    return c.json({ password }, 201);
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to save password",
    );
  }
});

savedPasswordRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const passwordId = c.req.param("id");
  const ok = await deleteSavedPassword(c.env.DB, user.id, passwordId);
  if (!ok) return jsonError(c, 404, "saved password not found");
  return c.json({ ok: true });
});
