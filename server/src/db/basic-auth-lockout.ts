const MAX_FAILURES = 3;
const LOCK_MS = 60 * 60 * 1000;

interface LockoutRow {
  client_key: string;
  failed_attempts: number;
  locked_until: string | null;
}

export function getBasicAuthClientKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP")?.trim() ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function getLockout(
  db: D1Database,
  clientKey: string,
): Promise<LockoutRow | null> {
  return db
    .prepare(
      "SELECT client_key, failed_attempts, locked_until FROM basic_auth_lockouts WHERE client_key = ?",
    )
    .bind(clientKey)
    .first<LockoutRow>();
}

async function upsertLockout(
  db: D1Database,
  clientKey: string,
  failedAttempts: number,
  lockedUntil: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO basic_auth_lockouts (client_key, failed_attempts, locked_until, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(client_key) DO UPDATE SET
         failed_attempts = excluded.failed_attempts,
         locked_until = excluded.locked_until,
         updated_at = datetime('now')`,
    )
    .bind(clientKey, failedAttempts, lockedUntil)
    .run();
}

function isLocked(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  const until = Date.parse(lockedUntil);
  return !Number.isNaN(until) && until > Date.now();
}

export async function isBasicAuthClientLocked(
  db: D1Database,
  clientKey: string,
): Promise<boolean> {
  return (await getBasicAuthLockoutState(db, clientKey)).locked;
}

export async function getBasicAuthLockoutState(
  db: D1Database,
  clientKey: string,
): Promise<{ locked: boolean; retryAfterSeconds: number | null }> {
  const row = await getLockout(db, clientKey);
  if (!row) return { locked: false, retryAfterSeconds: null };

  if (!isLocked(row.locked_until)) {
    if (row.locked_until) {
      await db
        .prepare("DELETE FROM basic_auth_lockouts WHERE client_key = ?")
        .bind(clientKey)
        .run();
    }
    return { locked: false, retryAfterSeconds: null };
  }

  const until = Date.parse(row.locked_until ?? "");
  const retryAfterSeconds = Number.isNaN(until)
    ? null
    : Math.max(1, Math.ceil((until - Date.now()) / 1000));

  return { locked: true, retryAfterSeconds };
}

export async function recordBasicAuthFailure(
  db: D1Database,
  clientKey: string,
): Promise<void> {
  const row = await getLockout(db, clientKey);
  const attempts = (row?.failed_attempts ?? 0) + 1;

  if (attempts >= MAX_FAILURES) {
    await upsertLockout(
      db,
      clientKey,
      attempts,
      new Date(Date.now() + LOCK_MS).toISOString(),
    );
    return;
  }

  await upsertLockout(db, clientKey, attempts, null);
}

export async function clearBasicAuthLockout(
  db: D1Database,
  clientKey: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM basic_auth_lockouts WHERE client_key = ?")
    .bind(clientKey)
    .run();
}
