const PBKDF2_ITERATIONS = 100_000;

export interface BasicAuthCredentials {
  username: string;
  passwordHash: string;
  salt: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(hash);
}

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashBytes = await derivePasswordHash(password, salt);
  return {
    hash: bytesToBase64(hashBytes),
    salt: bytesToBase64(salt),
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
): Promise<boolean> {
  const salt = base64ToBytes(storedSalt);
  const expected = base64ToBytes(storedHash);
  const actual = await derivePasswordHash(password, salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function hasBasicAuthCredentials(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 FROM basic_auth_credentials WHERE id = 'default' LIMIT 1")
    .first();
  return row !== null;
}

export async function getBasicAuthCredentials(
  db: D1Database,
): Promise<BasicAuthCredentials | null> {
  const row = await db
    .prepare(
      "SELECT username, password_hash, salt FROM basic_auth_credentials WHERE id = 'default' LIMIT 1",
    )
    .first<{ username: string; password_hash: string; salt: string }>();

  if (!row) return null;

  return {
    username: row.username,
    passwordHash: row.password_hash,
    salt: row.salt,
  };
}

export async function createBasicAuthCredentials(
  db: D1Database,
  username: string,
  password: string,
): Promise<void> {
  if (await hasBasicAuthCredentials(db)) {
    throw new Error("Credentials already exist");
  }

  const { hash, salt } = await hashPassword(password);
  const result = await db
    .prepare(
      `INSERT INTO basic_auth_credentials (id, username, password_hash, salt)
       VALUES ('default', ?, ?, ?)`,
    )
    .bind(username, hash, salt)
    .run();

  if (!result.success) {
    throw new Error("Failed to create credentials");
  }
}

export async function updateBasicAuthCredentials(
  db: D1Database,
  input: {
    currentPassword: string;
    username?: string;
    newPassword?: string;
  },
): Promise<{ username: string }> {
  const credentials = await getBasicAuthCredentials(db);
  if (!credentials) {
    throw new Error("Credentials not configured");
  }

  const currentValid = await verifyPassword(
    input.currentPassword,
    credentials.passwordHash,
    credentials.salt,
  );
  if (!currentValid) {
    throw new Error("Current password is incorrect");
  }

  const nextUsername = input.username?.trim() || credentials.username;
  const passwordChanging = Boolean(input.newPassword);

  if (nextUsername === credentials.username && !passwordChanging) {
    throw new Error("No changes to save");
  }

  let passwordHash = credentials.passwordHash;
  let salt = credentials.salt;
  if (passwordChanging && input.newPassword) {
    const hashed = await hashPassword(input.newPassword);
    passwordHash = hashed.hash;
    salt = hashed.salt;
  }

  const result = await db
    .prepare(
      `UPDATE basic_auth_credentials
       SET username = ?, password_hash = ?, salt = ?, updated_at = datetime('now')
       WHERE id = 'default'`,
    )
    .bind(nextUsername, passwordHash, salt)
    .run();

  if (!result.success) {
    throw new Error("Failed to update credentials");
  }

  return { username: nextUsername };
}
