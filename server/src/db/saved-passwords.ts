import { newId } from "../lib/id";

export interface SavedPasswordRecord {
  id: string;
  user_id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPasswordPublic {
  id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

function toPublic(record: SavedPasswordRecord): SavedPasswordPublic {
  return {
    id: record.id,
    name: record.name,
    value: record.value,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function listSavedPasswords(
  db: D1Database,
  userId: string,
): Promise<SavedPasswordPublic[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_passwords
       WHERE user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(userId)
    .all<SavedPasswordRecord>();

  return (results ?? []).map(toPublic);
}

export async function upsertSavedPassword(
  db: D1Database,
  userId: string,
  input: { name: string; value: string },
): Promise<SavedPasswordPublic> {
  const name = input.name.trim() || "Password";
  const value = input.value;

  const existing = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_passwords
       WHERE user_id = ? AND value = ?`,
    )
    .bind(userId, value)
    .first<SavedPasswordRecord>();

  if (existing) {
    await db
      .prepare(
        `UPDATE saved_passwords
         SET name = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
      .bind(name, existing.id, userId)
      .run();

    const updated = await db
      .prepare(
        `SELECT id, user_id, name, value, created_at, updated_at
         FROM saved_passwords WHERE id = ? AND user_id = ?`,
      )
      .bind(existing.id, userId)
      .first<SavedPasswordRecord>();

    if (!updated) throw new Error("failed to update saved password");
    return toPublic(updated);
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO saved_passwords (id, user_id, name, value)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, userId, name, value)
    .run();

  const created = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_passwords WHERE id = ? AND user_id = ?`,
    )
    .bind(id, userId)
    .first<SavedPasswordRecord>();

  if (!created) throw new Error("failed to create saved password");
  return toPublic(created);
}

export async function deleteSavedPassword(
  db: D1Database,
  userId: string,
  passwordId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM saved_passwords WHERE id = ? AND user_id = ?")
    .bind(passwordId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
