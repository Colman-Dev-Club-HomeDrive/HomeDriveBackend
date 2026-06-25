import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/auth.types.js';

function parseBearerToken(rawAuthorization?: string): string | undefined {
  if (!rawAuthorization) return undefined;
  if (!rawAuthorization.toLowerCase().startsWith('bearer ')) return undefined;
  return rawAuthorization.slice('bearer '.length).trim();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ message: 'server configuration error' });
  }

  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({ message: 'missing or invalid authorization header' });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;
    if (!decoded?.userId) {
      return res.status(401).json({ message: 'invalid token payload' });
    }

    res.locals.auth = decoded;
    return next();
  } catch {
    return res.status(401).json({ message: 'invalid or expired token' });
  }
}
