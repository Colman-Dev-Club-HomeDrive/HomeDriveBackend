import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { lookup as mimeLookup } from 'mime-types';
import mongoose from 'mongoose';
import { FileModel } from '../models/File.model.js';
import { WorkspaceModel } from '../models/Workspace.model.js';
import type { BrowseEntry, BrowseQuery, IndexFileBody, ListFilesQuery, MediaType, MediaTypeCount, RenameFileBody } from '../types/file.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

// TODO: remove once auth is wired up
const FIXED_USER_ID = '6854abcd1234567890abcdef';

// Resolve allowed root paths from env, defaulting to the OS root
const ALLOWED_PATHS: string[] = process.env.ALLOWED_PATHS
  ? process.env.ALLOWED_PATHS.split(',').map((p) => nodePath.resolve(p.trim()))
  : [nodePath.parse(process.cwd()).root];

function isPathAllowed(resolvedPath: string): boolean {
  return ALLOWED_PATHS.some((allowed) => resolvedPath.startsWith(allowed));
}

function getMediaFilter(mediaType?: MediaType) {
  switch (mediaType) {
    case 'documents':
      return { isDirectory: false, mimeType: { $not: /^(image|video|audio)\// } };
    case 'photos':
      return { isDirectory: false, mimeType: /^image\// };
    case 'videos':
      return { isDirectory: false, mimeType: /^video\// };
    case 'audio':
      return { isDirectory: false, mimeType: /^audio\// };
    default:
      return {};
  }
}

// GET /api/files/browse?path=...
export async function browseDirectory(req: Request, res: Response) {
  try {
    const { path: rawPath } = req.query as BrowseQuery;
    const targetPath = nodePath.resolve(rawPath ?? nodePath.parse(process.cwd()).root);

    if (!isPathAllowed(targetPath)) {
      return res.status(403).json({ message: 'access to this path is not allowed' });
    }

    const stat = await fs.stat(targetPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return res.status(400).json({ message: 'path is not a valid directory' });
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    const result: BrowseEntry[] = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = nodePath.join(targetPath, entry.name);
        const isDirectory = entry.isDirectory();
        let size = 0;

        if (!isDirectory) {
          const fileStat = await fs.stat(fullPath).catch(() => null);
          size = fileStat?.size ?? 0;
        }

        const extension = isDirectory ? '' : nodePath.extname(entry.name).toLowerCase();
        const mimeType = isDirectory ? 'inode/directory' : (mimeLookup(entry.name) || 'application/octet-stream');

        return { name: entry.name, path: fullPath, isDirectory, size, extension, mimeType };
      }),
    );

    // Directories first, then files — both alphabetical
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return res.json({ path: targetPath, entries: result });
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// POST /api/files
export async function indexFile(req: Request, res: Response) {
  try {
    const { path: rawPath, workspaceId } = req.body as IndexFileBody;
    const resolvedPath = nodePath.resolve(rawPath);

    if (!isPathAllowed(resolvedPath)) {
      return res.status(403).json({ message: 'access to this path is not allowed' });
    }

    const stat = await fs.stat(resolvedPath).catch(() => null);
    if (!stat) {
      return res.status(400).json({ message: 'path does not exist on disk' });
    }

    const isDirectory = stat.isDirectory();

    // Prevent duplicate indexing of the same path
    const existing = await FileModel.findOne({ path: resolvedPath });
    if (existing) {
      return res.status(409).json({ message: 'already indexed', file: existing });
    }

    const name = nodePath.basename(resolvedPath);
    const extension = isDirectory ? '' : nodePath.extname(name).toLowerCase();
    const mimeType = isDirectory ? 'inode/directory' : (mimeLookup(name) || 'application/octet-stream');

    const file = await FileModel.create({
      name,
      path: resolvedPath,
      size: isDirectory ? 0 : stat.size,
      mimeType,
      extension,
      isDirectory,
      ownerId: FIXED_USER_ID,
      ...(workspaceId ? { workspaceId } : {}),
    });

    // Keep workspace fileCount accurate
    if (workspaceId) {
      await WorkspaceModel.findByIdAndUpdate(workspaceId, { $inc: { fileCount: 1 } });
    }

    return res.status(201).json(file);
  } catch (error) {
    console.error('indexFile failed:', error);

    // Duplicate key from Mongo index (most commonly duplicate path)
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    ) {
      return res.status(409).json({ message: 'already indexed' });
    }

    if (error instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ message: 'invalid file data', detail: error.message });
    }

    if (error instanceof mongoose.Error.CastError) {
      return res.status(400).json({ message: 'invalid request data', detail: error.message });
    }

    if (error instanceof Error && process.env.NODE_ENV !== 'production') {
      return res.status(500).json({ message: 'server error', detail: error.message });
    }

    return res.status(500).json({ message: 'server error' });
  }
}

// GET /api/files
export async function listFiles(req: Request, res: Response) {
  try {
    const { workspaceId, mediaType } = req.query as ListFilesQuery;
    const filter = {
      ...(workspaceId ? { workspaceId } : {}),
      ...getMediaFilter(mediaType),
    };
    const files = await FileModel.find(filter).sort({ createdAt: -1 });
    return res.json(files);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// GET /api/files/media-types
export async function getMediaTypeCounts(req: Request, res: Response) {
  try {
    const { workspaceId } = req.query as ListFilesQuery;
    const baseMatch = {
      ...(workspaceId ? { workspaceId } : {}),
      isDirectory: false,
    };

    const counts = await FileModel.aggregate<MediaTypeCount>([
      { $match: baseMatch },
      {
        $addFields: {
          mediaType: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: '$mimeType', regex: /^image\// } }, then: 'photos' },
                { case: { $regexMatch: { input: '$mimeType', regex: /^video\// } }, then: 'videos' },
                { case: { $regexMatch: { input: '$mimeType', regex: /^audio\// } }, then: 'audio' },
              ],
              default: 'documents',
            },
          },
        },
      },
      { $group: { _id: '$mediaType', count: { $sum: 1 } } },
      { $project: { _id: 0, mediaType: '$_id', count: 1 } },
    ]);

    return res.json(counts);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// GET /api/files/:id
export async function getFileById(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const file = await FileModel.findById(id);
    if (!file) return res.status(404).json({ message: 'file not found' });
    return res.json(file);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// DELETE /api/files/:id
export async function deleteFile(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const file = await FileModel.findByIdAndDelete(id);
    if (!file) return res.status(404).json({ message: 'file not found' });

    // Keep workspace fileCount accurate
    if (file.workspaceId) {
      await WorkspaceModel.findByIdAndUpdate(file.workspaceId, { $inc: { fileCount: -1 } });
    }

    return res.json({ message: 'file removed' });
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// POST /api/files/:id/open
export async function openFile(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const file = await FileModel.findById(id);
    if (!file) return res.status(404).json({ message: 'file not found' });

    // Verify the file still exists on disk before attempting to open
    const stat = await fs.stat(file.path).catch(() => null);
    if (!stat) {
      return res.status(410).json({ message: 'file no longer exists on disk' });
    }

    // Dynamic import required because `open` is ESM-only
    const { default: open } = await import('open');
    await open(file.path);

    return res.json({ message: 'file opened' });
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// PATCH /api/files/:id
export async function renameFile(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const { name: rawName } = req.body as RenameFileBody;
    const nextName = rawName.trim();

    const file = await FileModel.findById(id);
    if (!file) return res.status(404).json({ message: 'file not found' });

    const currentPath = file.path;
    const parentDir = nodePath.dirname(currentPath);
    const nextPath = nodePath.join(parentDir, nextName);

    if (!isPathAllowed(nextPath)) {
      return res.status(403).json({ message: 'access to this path is not allowed' });
    }

    if (currentPath === nextPath) {
      return res.json(file);
    }

    const duplicateIndexedPath = await FileModel.findOne({
      _id: { $ne: file._id },
      path: nextPath,
    });
    if (duplicateIndexedPath) {
      return res.status(409).json({ message: 'another indexed item already uses this path' });
    }

    const existingOnDisk = await fs.stat(nextPath).catch(() => null);
    if (existingOnDisk) {
      return res.status(409).json({ message: 'a file with that name already exists in this location' });
    }

    await fs.rename(currentPath, nextPath);

    file.name = nextName;
    file.path = nextPath;
    file.extension = file.isDirectory ? '' : nodePath.extname(nextName).toLowerCase();
    file.mimeType = file.isDirectory ? 'inode/directory' : (mimeLookup(nextName) || 'application/octet-stream');
    await file.save();

    if (file.isDirectory) {
      const escapedPath = currentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const descendants = await FileModel.find({
        _id: { $ne: file._id },
        path: { $regex: `^${escapedPath}[\\\\/]` },
      });

      if (descendants.length > 0) {
        await Promise.all(
          descendants.map(async (descendant) => {
            descendant.path = `${nextPath}${descendant.path.slice(currentPath.length)}`;
            await descendant.save();
          }),
        );
      }
    }

    return res.json(file);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}
