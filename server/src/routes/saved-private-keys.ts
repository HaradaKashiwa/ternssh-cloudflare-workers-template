import { Hono } from "hono";
import {
  deleteSavedPrivateKey,
  listSavedPrivateKeys,
  upsertSavedPrivateKey,
} from "../db/saved-private-keys";
import { jsonError } from "../lib/http";
import type { Variables } from "../types";

export const savedPrivateKeyRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

savedPrivateKeyRoutes.get("/", async (c) => {
  const user = c.get("user");
  const keys = await listSavedPrivateKeys(c.env.DB, user.id);
  return c.json({ keys });
});

savedPrivateKeyRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name?: string; value?: string }>();

  if (!body.value?.trim()) {
    return jsonError(c, 400, "value is required");
  }

  try {
    const key = await upsertSavedPrivateKey(c.env.DB, user.id, {
      name: body.name?.trim() ?? "",
      value: body.value,
    });
    return c.json({ key }, 201);
  } catch (error) {
    return jsonError(
      c,
      400,
      error instanceof Error ? error.message : "failed to save private key",
    );
  }
});

savedPrivateKeyRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const keyId = c.req.param("id");
  const ok = await deleteSavedPrivateKey(c.env.DB, user.id, keyId);
  if (!ok) return jsonError(c, 404, "saved private key not found");
  return c.json({ ok: true });
});
