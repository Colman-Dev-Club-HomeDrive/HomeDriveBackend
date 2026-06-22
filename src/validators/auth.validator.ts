import type { NextFunction, Request, Response } from 'express';
import type { RegisterUserBody } from '../types/user.types.js';

const MIN_PASSWORD_LENGTH = 8;

export function validateRegister(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { email, name, password } = req.body as Partial<RegisterUserBody>;

  if (!email || !name || !password) {
    return res.status(400).json({ message: 'email, name, and password are required' });
  }
  if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'email, name, and password must be strings' });
  }
  if (!email.trim() || !name.trim() || !password.trim()) {
    return res.status(400).json({ message: 'email, name, and password cannot be empty' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: 'password must be at least 8 characters' });
  }

  return next();
}
