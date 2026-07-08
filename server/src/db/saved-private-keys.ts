import { newId } from "../lib/id";

export interface SavedPrivateKeyRecord {
  id: string;
  user_id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPrivateKeyPublic {
  id: string;
  name: string;
  value: string;
  created_at: string;
  updated_at: string;
}

function toPublic(record: SavedPrivateKeyRecord): SavedPrivateKeyPublic {
  return {
    id: record.id,
    name: record.name,
    value: record.value,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function listSavedPrivateKeys(
  db: D1Database,
  userId: string,
): Promise<SavedPrivateKeyPublic[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_private_keys
       WHERE user_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
    )
    .bind(userId)
    .all<SavedPrivateKeyRecord>();

  return (results ?? []).map(toPublic);
}

export async function upsertSavedPrivateKey(
  db: D1Database,
  userId: string,
  input: { name: string; value: string },
): Promise<SavedPrivateKeyPublic> {
  const name = input.name.trim() || "Private key";
  const value = input.value.trim();

  const existing = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_private_keys
       WHERE user_id = ? AND value = ?`,
    )
    .bind(userId, value)
    .first<SavedPrivateKeyRecord>();

  if (existing) {
    await db
      .prepare(
        `UPDATE saved_private_keys
         SET name = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
      )
      .bind(name, existing.id, userId)
      .run();

    const updated = await db
      .prepare(
        `SELECT id, user_id, name, value, created_at, updated_at
         FROM saved_private_keys WHERE id = ? AND user_id = ?`,
      )
      .bind(existing.id, userId)
      .first<SavedPrivateKeyRecord>();

    if (!updated) throw new Error("failed to update saved private key");
    return toPublic(updated);
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO saved_private_keys (id, user_id, name, value)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, userId, name, value)
    .run();

  const created = await db
    .prepare(
      `SELECT id, user_id, name, value, created_at, updated_at
       FROM saved_private_keys WHERE id = ? AND user_id = ?`,
    )
    .bind(id, userId)
    .first<SavedPrivateKeyRecord>();

  if (!created) throw new Error("failed to create saved private key");
  return toPublic(created);
}

export async function deleteSavedPrivateKey(
  db: D1Database,
  userId: string,
  keyId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM saved_private_keys WHERE id = ? AND user_id = ?")
    .bind(keyId, userId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
