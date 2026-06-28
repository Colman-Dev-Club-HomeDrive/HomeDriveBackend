import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { IndexFileBody, RenameFileBody, ShareFileBody } from '../types/file.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

export function validateIndexFile(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { path, name, size, mimeType, extension, isDirectory, workspaceId, shareWith } = req.body as Partial<IndexFileBody>;
  const hasPath = typeof path === 'string' && path.trim() !== '';
  const hasName = typeof name === 'string' && name.trim() !== '';

  if (!hasPath && !hasName) {
    return res.status(400).json({ message: 'path or name is required' });
  }
  if (size !== undefined && (typeof size !== 'number' || Number.isNaN(size) || size < 0)) {
    return res.status(400).json({ message: 'size must be a non-negative number when provided' });
  }
  if (mimeType !== undefined && (typeof mimeType !== 'string' || mimeType.trim() === '')) {
    return res.status(400).json({ message: 'mimeType must be a non-empty string when provided' });
  }
  if (extension !== undefined && typeof extension !== 'string') {
    return res.status(400).json({ message: 'extension must be a string when provided' });
  }
  if (isDirectory !== undefined && typeof isDirectory !== 'boolean') {
    return res.status(400).json({ message: 'isDirectory must be a boolean when provided' });
  }
  if (!hasPath && isDirectory !== true && size === undefined) {
    return res.status(400).json({ message: 'size is required for metadata-only file indexing' });
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

export function validateShareFile(req: Request, res: Response, next: NextFunction) {
  if (!req.body) return res.status(400).json({ message: 'body is required' });

  const { shareWith } = req.body as Partial<ShareFileBody>;
  if (typeof shareWith !== 'string') {
    return res.status(400).json({ message: 'shareWith must be a string' });
  }

  return next();
}
