import type { Request, Response } from 'express';
import type { AuthLocals } from '../types/auth.types.js';
import { UserModel } from '../models/User.model.js';
import { SharedAccessModel } from '../models/SharedAccess.model.js';
import {
  addSharedAccessViewer,
  canAccessSharedData,
  canManageSharedAccess,
  countSharedAccessByRole,
  getSharedAccessRole,
  listSharedAccessUsers,
  normalizeEmail,
  removeSharedAccessUser,
  updateSharedAccessRole,
} from '../utils/temporary-access.js';
import type { SharedAccessRole } from '../config/shared-access-users.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ROLES: SharedAccessRole[] = ['manager', 'editor', 'viewer'];

// GET /api/access/admin/users
export async function listAccessAdminUsers(_req: Request, res: Response) {
  const auth = (res as Response<unknown, AuthLocals>).locals.auth;
  if (!auth?.email) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if (!(await canManageSharedAccess(auth.email))) {
    return res.status(403).json({ message: 'forbidden' });
  }

  const users = await SharedAccessModel.find()
    .select('email role createdAt updatedAt -_id')
    .sort({ createdAt: -1 })
    .lean();

  return res.json({ users });
}

// GET /api/access/users
export async function listAccessUsers(_req: Request, res: Response) {
  const auth = (res as Response<unknown, AuthLocals>).locals.auth;
  if (!auth?.email) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if (!(await canAccessSharedData(auth.email))) {
    return res.status(403).json({ message: 'forbidden' });
  }

  return res.json({ users: await listSharedAccessUsers() });
}

// POST /api/access/users
export async function addAccessUser(req: Request, res: Response) {
  const auth = (res as Response<unknown, AuthLocals>).locals.auth;
  if (!auth?.email) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if (!(await canManageSharedAccess(auth.email))) {
    return res.status(403).json({ message: 'forbidden' });
  }

  const email = normalizeEmail((req.body as { email?: string }).email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'valid email is required' });
  }

  const existingUser = await UserModel.findOne({ email }).select('_id email').lean();
  if (!existingUser) {
    return res.status(404).json({ message: 'user not found' });
  }

  const users = await addSharedAccessViewer(existingUser.email);
  return res.status(201).json({ users });
}

// PATCH /api/access/users/role
export async function updateAccessUserRole(req: Request, res: Response) {
  const auth = (res as Response<unknown, AuthLocals>).locals.auth;
  if (!auth?.email) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if (!(await canManageSharedAccess(auth.email))) {
    return res.status(403).json({ message: 'forbidden' });
  }

  const email = normalizeEmail((req.body as { email?: string }).email);
  const role = (req.body as { role?: SharedAccessRole }).role;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'valid email is required' });
  }

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: 'valid role is required' });
  }

  if (normalizeEmail(auth.email) === email) {
    return res.status(400).json({ message: 'cannot change your own role' });
  }

  if (!(await getSharedAccessRole(email))) {
    return res.status(404).json({ message: 'access user not found' });
  }

  const users = await updateSharedAccessRole(email, role);
  return res.json({ users });
}

// DELETE /api/access/users
export async function removeAccessUser(req: Request, res: Response) {
  const auth = (res as Response<unknown, AuthLocals>).locals.auth;
  if (!auth?.email) {
    return res.status(401).json({ message: 'unauthorized' });
  }

  if (!(await canManageSharedAccess(auth.email))) {
    return res.status(403).json({ message: 'forbidden' });
  }

  const email = normalizeEmail((req.body as { email?: string }).email);
  if (!email || !EMAIL_PATTERN.test(email)) {
    return res.status(400).json({ message: 'valid email is required' });
  }

  if (normalizeEmail(auth.email) === email) {
    return res.status(400).json({ message: 'cannot remove your own owner access' });
  }

  const role = await getSharedAccessRole(email);
  if (!role) {
    return res.status(404).json({ message: 'access user not found' });
  }

  if (role === 'manager') {
    const managerCount = await countSharedAccessByRole('manager');
    if (managerCount <= 1) {
      return res.status(400).json({ message: 'cannot remove the last owner' });
    }
  }

  const users = await removeSharedAccessUser(email);

  return res.json({ users });
}
