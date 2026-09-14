import bcrypt from 'bcryptjs';

// Password hashing helpers — bcrypt with a per-user random salt. Existing
// plaintext records (accounts created before this change) are detected on
// login and transparently upgraded to bcrypt hashes.

const ROUNDS = 10;
// bcrypt hashes are 60 chars starting with $2a$/$2b$/$2y$; anything else is
// treated as legacy plaintext.
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function isHashed(password: string): boolean {
  return BCRYPT_PREFIX.test(password);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

/** Constant-time-ish verify; handles legacy plaintext records. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  return plain === stored; // legacy plaintext row
}
