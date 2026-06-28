import { compare, hash } from 'bcryptjs';

const SALT_ROUNDS = 10;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, storedPassword: string): Promise<boolean> {
  if (BCRYPT_HASH_PATTERN.test(storedPassword)) {
    return compare(plainPassword, storedPassword);
  }

  return plainPassword === storedPassword;
}
