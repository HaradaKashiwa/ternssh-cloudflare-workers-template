import { DEFAULT_SITE_NAME, normalizeSiteName } from "./site-name";
import type { User } from "../types";

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  return db
    .prepare(
      "SELECT id, email, display_name, site_name, created_at, updated_at FROM users WHERE id = ?",
    )
    .bind(id)
    .first<User>();
}

export async function updateUserSiteName(
  db: D1Database,
  userId: string,
  siteName: string,
): Promise<User> {
  const normalized = normalizeSiteName(siteName);

  await db
    .prepare(
      "UPDATE users SET site_name = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(normalized, userId)
    .run();

  const user = await getUserById(db, userId);
  if (!user) throw new Error("User not found");
  return user;
}

export async function resetUserSiteName(
  db: D1Database,
  userId: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE users SET site_name = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(DEFAULT_SITE_NAME, userId)
    .run();
}

export async function ensureDefaultUser(db: D1Database): Promise<User> {
  const existing = await getUserById(db, "default");
  if (existing) return existing;

  await db
    .prepare(
      "INSERT INTO users (id, email, display_name, site_name) VALUES ('default', NULL, 'Default', ?)",
    )
    .bind(DEFAULT_SITE_NAME)
    .run();

  const user = await getUserById(db, "default");
  if (!user) throw new Error("Failed to create default user");
  return user;
}
