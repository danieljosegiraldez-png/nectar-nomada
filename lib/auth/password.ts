import argon2 from "argon2";

/** SECURITY.md §1 — Argon2id, not bcrypt/scrypt. */
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  return argon2.verify(hash, plainPassword);
}
