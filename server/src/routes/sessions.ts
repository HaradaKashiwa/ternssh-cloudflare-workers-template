import { Hono } from "hono";
import { getServer } from "../db/servers";
import { newId } from "../lib/id";
import { jsonError } from "../lib/http";
import type { Variables } from "../types";

export const sessionRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

sessionRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ serverId?: string }>();

  if (!body.serverId) {
    return jsonError(c, 400, "serverId is required");
  }

  const server = await getServer(c.env.DB, user.id, body.serverId);
  if (!server) {
    return jsonError(c, 404, "server not found");
  }

  const sessionId = newId();
  await c.env.DB
    .prepare(
      "INSERT INTO sessions (id, user_id, server_id, status) VALUES (?, ?, ?, 'active')",
    )
    .bind(sessionId, user.id, server.id)
    .run();

  const wsUrl = new URL(c.req.url);
  wsUrl.pathname = `/api/v1/sessions/${sessionId}/ws`;
  const sftpUrl = new URL(c.req.url);
  sftpUrl.pathname = `/api/v1/sessions/${sessionId}/sftp/ws`;

  return c.json({
    sessionId,
    wsUrl: wsUrl.pathname,
    sftpWsUrl: sftpUrl.pathname,
    status: "created",
  });
});

async function forwardToSessionDo(
  c: {
    env: Env;
    get: (key: "user") => { id: string };
    req: { param: (key: string) => string; raw: Request };
  },
  sessionId: string,
) {
  const user = c.get("user");

  const session = await c.env.DB
    .prepare(
      "SELECT id, user_id, server_id, status FROM sessions WHERE id = ? AND user_id = ?",
    )
    .bind(sessionId, user.id)
    .first<{ id: string; user_id: string; server_id: string; status: string }>();

  if (!session) {
    return jsonError(c as never, 404, "session not found");
  }

  const doId = c.env.SSH_SESSION.idFromName(`${user.id}:${sessionId}`);
  const stub = c.env.SSH_SESSION.get(doId);
  return stub.fetch(c.req.raw);
}

sessionRoutes.get("/:id/status", async (c) => {
  return forwardToSessionDo(c, c.req.param("id"));
});

sessionRoutes.get("/:id/sftp/ws", async (c) => {
  return forwardToSessionDo(c, c.req.param("id"));
});

sessionRoutes.get("/:id/ws", async (c) => {
  return forwardToSessionDo(c, c.req.param("id"));
});
