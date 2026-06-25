import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { IndexFileBody, RenameFileBody } from '../types/file.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

export function validateIndexFile(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { path, workspaceId, shareWith } = req.body as Partial<IndexFileBody>;

  if (!path || typeof path !== 'string' || path.trim() === '') {
    return res.status(400).json({ message: 'path is required' });
  }
  if (workspaceId !== undefined && workspaceId !== null && !mongoose.isValidObjectId(workspaceId)) {
    return res.status(400).json({ message: 'workspaceId is not a valid ObjectId' });
  }
  if (shareWith !== undefined && typeof shareWith !== 'string') {
    return res.status(400).json({ message: 'shareWith must be a string when provided' });
  }

  return next();
}

export function validateFileId(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params as Partial<ObjectIdParams>;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'invalid id' });
  return next();
}

export function validateRenameFile(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { name } = req.body as Partial<RenameFileBody>;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ message: 'name is required' });
  }

  if (name.includes('/') || name.includes('\\')) {
    return res.status(400).json({ message: 'name cannot contain path separators' });
  }

  return next();
}
