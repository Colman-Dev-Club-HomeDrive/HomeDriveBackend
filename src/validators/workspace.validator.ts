import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { WorkspaceIcon } from '@homedrive/types';
import type { CreateWorkspaceBody, UpdateWorkspaceBody } from '../types/workspace.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

const VALID_ICONS: WorkspaceIcon[] = ['folder', 'link', 'document', 'code'];

export function validateCreateWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { name, icon, color, ownerId } = req.body as Partial<CreateWorkspaceBody>;

  if (!name || !icon || !color) {
    return res.status(400).json({ message: 'name, icon, and color are required' });
  }
  if (!VALID_ICONS.includes(icon as WorkspaceIcon)) {
    return res.status(400).json({ message: `icon must be one of: ${VALID_ICONS.join(', ')}` });
  }
  if (ownerId && !mongoose.isValidObjectId(ownerId)) {
    return res.status(400).json({ message: 'ownerId is not a valid ObjectId' });
  }

  return next();
}

export function validateWorkspaceId(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params as Partial<ObjectIdParams>;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'invalid id' });
  return next();
}

export function validateUpdateWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { name, color, description, collaboration, pinned } = req.body as Partial<UpdateWorkspaceBody>;

  if (!name && !color && !description && !collaboration && pinned === undefined) {
    return res.status(400).json({ message: 'provide at least one field to update' });
  }

  return next();
}
