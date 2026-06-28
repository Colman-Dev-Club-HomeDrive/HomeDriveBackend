import type { NextFunction, Request, Response } from 'express';
import type { ChangePasswordBody, LoginUserBody } from '../types/auth.types.js';
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

export function validateLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { email, password } = req.body as Partial<LoginUserBody>;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ message: 'email and password must be strings' });
  }
  if (!email.trim() || !password.trim()) {
    return res.status(400).json({ message: 'email and password cannot be empty' });
  }

  return next();
}

export function validateChangePassword(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { currentPassword, newPassword, confirmNewPassword } = req.body as Partial<ChangePasswordBody>;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({
      message: 'currentPassword, newPassword, and confirmNewPassword are required',
    });
  }
  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    typeof confirmNewPassword !== 'string'
  ) {
    return res.status(400).json({
      message: 'currentPassword, newPassword, and confirmNewPassword must be strings',
    });
  }
  if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
    return res.status(400).json({
      message: 'currentPassword, newPassword, and confirmNewPassword cannot be empty',
    });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'newPassword and confirmNewPassword do not match' });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: 'newPassword must be at least 8 characters' });
  }

  req.body = {
    currentPassword: currentPassword.trim(),
    newPassword: newPassword.trim(),
    confirmNewPassword: confirmNewPassword.trim(),
  };

  return next();
}
