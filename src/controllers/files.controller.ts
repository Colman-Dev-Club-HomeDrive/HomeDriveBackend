import type { Request, Response } from 'express';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { lookup as mimeLookup } from 'mime-types';
import mongoose from 'mongoose';
import { FileModel } from '../models/File.model.js';
import { WorkspaceModel } from '../models/Workspace.model.js';
import type { AuthLocals } from '../types/auth.types.js';
import type {
  BrowseEntry,
  BrowseQuery,
  IndexFileBody,
  ListFilesQuery,
  MediaType,
  MediaTypeCount,
  RenameFileBody,
  StorageStatsResponse,
} from '../types/file.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

// Resolve allowed root paths from env, defaulting to the OS root
const ALLOWED_PATHS: string[] = process.env.ALLOWED_PATHS
  ? process.env.ALLOWED_PATHS.split(',').map((p) => nodePath.resolve(p.trim()))
  : [nodePath.parse(process.cwd()).root];

const DEFAULT_WORKSPACE_COLOR = '#3b82f6';

function isPathAllowed(resolvedPath: string): boolean {
  return ALLOWED_PATHS.some((allowed) => resolvedPath.startsWith(allowed));
}

function resolveStorageStatsPath(): string {
  const [firstAllowedPath] = ALLOWED_PATHS;
  if (firstAllowedPath) {
    return firstAllowedPath;
  }

  return nodePath.parse(process.cwd()).root;
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

async function indexPathTree(params: {
  path: string;
  ownerId: string;
  workspaceId?: string;
  shareWith?: string;
}): Promise<number> {
  const stat = await fs.stat(params.path);
  const isDirectory = stat.isDirectory();
  const name = nodePath.basename(params.path);
  const extension = isDirectory ? '' : nodePath.extname(name).toLowerCase();
  const mimeType = isDirectory ? 'inode/directory' : (mimeLookup(name) || 'application/octet-stream');

  await FileModel.create({
    name,
    path: params.path,
    size: isDirectory ? 0 : stat.size,
    mimeType,
    extension,
    isDirectory,
    ownerId: params.ownerId,
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.shareWith ? { collaboration: params.shareWith } : {}),
  });

  let createdCount = 1;

  if (isDirectory) {
    const entries = await fs.readdir(params.path, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = nodePath.join(params.path, entry.name);
      createdCount += await indexPathTree({
        path: entryPath,
        ownerId: params.ownerId,
        workspaceId: params.workspaceId,
        shareWith: params.shareWith,
      });
    }
  }

  return createdCount;
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
    const ownerId = (res as Response<unknown, AuthLocals>).locals.auth?.userId;
    if (!ownerId) {
      return res.status(401).json({ message: 'unauthorized' });
    }

    const { path: rawPath, workspaceId, shareWith } = req.body as IndexFileBody;
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

    let resolvedWorkspaceId = workspaceId;

    if (isDirectory && !resolvedWorkspaceId) {
      const workspace = await WorkspaceModel.create({
        name: nodePath.basename(resolvedPath),
        icon: 'folder',
        color: DEFAULT_WORKSPACE_COLOR,
        ownerId,
        position: await WorkspaceModel.countDocuments(),
        ...(shareWith ? { collaboration: shareWith } : {}),
      });
      resolvedWorkspaceId = String(workspace._id);
    }

    const createdCount = await indexPathTree({
      path: resolvedPath,
      ownerId,
      workspaceId: resolvedWorkspaceId,
      shareWith,
    });

    if (resolvedWorkspaceId) {
      await WorkspaceModel.findByIdAndUpdate(resolvedWorkspaceId, { $inc: { fileCount: createdCount } });
    }

    const file = await FileModel.findOne({ path: resolvedPath });
    if (!file) {
      return res.status(500).json({ message: 'server error' });
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

// GET /api/files/storage
export async function getStorageStats(_req: Request, res: Response) {
  try {
    const statsPath = resolveStorageStatsPath();
    const fsStats = await fs.statfs(statsPath);

    const capacityBytes = fsStats.bsize * fsStats.blocks;
    const availableBytes = fsStats.bsize * fsStats.bavail;
    const serverUsedBytes = Math.max(capacityBytes - availableBytes, 0);

    const [{ metadataUsedBytes = 0 } = { metadataUsedBytes: 0 }] = await FileModel.aggregate<
      Pick<StorageStatsResponse, 'metadataUsedBytes'>
    >([
      { $match: { isDirectory: false } },
      { $group: { _id: null, metadataUsedBytes: { $sum: '$size' } } },
      { $project: { _id: 0, metadataUsedBytes: 1 } },
    ]);

    return res.json({
      statsPath,
      capacityBytes,
      availableBytes,
      serverUsedBytes,
      metadataUsedBytes,
    } satisfies StorageStatsResponse);
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
    console.log('📂 Opening file with id:', id);
    
    const file = await FileModel.findById(id);
    if (!file) {
      console.log('❌ File not found:', id);
      return res.status(404).json({ message: 'file not found' });
    }

    console.log('📂 File found:', { name: file.name, path: file.path, isDirectory: file.isDirectory });

    // Verify the file still exists on disk before attempting to open
    const stat = await fs.stat(file.path).catch(() => null);
    if (!stat) {
      console.log('❌ File does not exist on disk:', file.path);
      return res.status(410).json({ message: 'file no longer exists on disk' });
    }

    console.log('✅ File exists on disk, opening...');
    
    // Dynamic import required because `open` is ESM-only
    const { default: open } = await import('open');
    await open(file.path);

    console.log('✅ File opened successfully');
    return res.json({ message: 'file opened' });
  } catch (error) {
    console.error('❌ Error opening file:', error);
    if (error instanceof Error) {
      return res.status(500).json({ message: 'server error', detail: error.message });
    }
    return res.status(500).json({ message: 'server error' });
  }
}

// GET /api/files/:id/download
export async function downloadFile(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const file = await FileModel.findById(id);
    if (!file) return res.status(404).json({ message: 'file not found' });

    if (file.isDirectory) {
      return res.status(400).json({ message: 'directories cannot be downloaded' });
    }

    const stat = await fs.stat(file.path).catch(() => null);
    if (!stat) {
      return res.status(410).json({ message: 'file no longer exists on disk' });
    }

    return res.download(file.path, file.name);
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
