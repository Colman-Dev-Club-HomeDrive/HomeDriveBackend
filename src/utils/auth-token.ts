import type { Request } from 'express';
import { AUTH_COOKIE_NAME } from './auth-cookie.js';

function parseBearerToken(rawAuthorization?: string): string | undefined {
  if (!rawAuthorization) return undefined;
  if (!rawAuthorization.toLowerCase().startsWith('bearer ')) return undefined;
  return rawAuthorization.slice('bearer '.length).trim();
}

export function getRequestAuthToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
    return cookieToken;
  }

  return parseBearerToken(req.headers.authorization);
}
