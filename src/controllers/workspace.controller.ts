import type { Request, Response } from 'express';
import { WorkspaceModel } from '../models/Workspace.model.js';
import { UserModel } from '../models/User.model.js';
import mongoose from 'mongoose';
import { FileModel } from '../models/File.model.js';
import type {
  CreateWorkspaceBody,
  UpdateWorkspaceBody,
  WorkspaceMediaStats,
  WorkspaceStatsResponse,
  WorkspaceUserStats,
} from '../types/workspace.types.js';
import type { ObjectIdParams } from '../types/common.types.js';
import type { AuthLocals } from '../types/auth.types.js';

// TODO: remove once auth is wired up
const FIXED_USER_ID = '6854abcd1234567890abcdef';

function normalizeCollaborators(rawValue?: string): string[] {
  if (!rawValue) return [];

  const unique = new Set<string>();
  for (const part of rawValue.split(',')) {
    const normalized = part.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

// CREATE workspace
export async function createWorkspace(req: Request, res: Response) {
  try {
    const { name, icon, color, shareWith } = req.body as CreateWorkspaceBody;
    const ownerId = (req.body as CreateWorkspaceBody).ownerId ?? FIXED_USER_ID;

    let resolvedOwnerId: string;
    if (ownerId === FIXED_USER_ID) {
      resolvedOwnerId = FIXED_USER_ID;
    } else {
      const owner = await UserModel.findById(ownerId);
      if (!owner) return res.status(404).json({ message: 'owner not found' });
      resolvedOwnerId = String(owner._id);
    }

    const count = await WorkspaceModel.countDocuments();
    const workspace = await WorkspaceModel.create({
      name,
      icon,
      color,
      ownerId: resolvedOwnerId,
      position: count,
      ...(shareWith ? { collaboration: shareWith } : {}),
    });

    return res.status(201).json(workspace);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// READ all workspaces — pinned first (oldest pin at top), then unpinned by position
export async function listWorkspaces(_req: Request, res: Response) {
  try {
    const workspaces = await WorkspaceModel.find().sort({ pinned: -1, pinnedAt: 1, position: 1 });
    return res.json(workspaces);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// READ one
export async function getWorkspaceById(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const workspace = await WorkspaceModel.findById(id);
    if (!workspace) return res.status(404).json({ message: 'workspace not found' });

    return res.json(workspace);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// GET /api/workspaces/:id/stats
export async function getWorkspaceStats(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const auth = (res as Response<unknown, AuthLocals>).locals.auth;
    if (!auth?.userId) {
      return res.status(401).json({ message: 'unauthorized' });
    }

    const workspace = await WorkspaceModel.findById(id).select('ownerId collaboration');
    if (!workspace) {
      return res.status(404).json({ message: 'workspace not found' });
    }

    const requester = await UserModel.findById(auth.userId).select('email');
    if (!requester) {
      return res.status(401).json({ message: 'unauthorized' });
    }

    const collaboratorEmails = normalizeCollaborators(workspace.collaboration);
    const requesterEmail = requester.email.toLowerCase();
    const isOwner = String(workspace.ownerId) === auth.userId;
    const isCollaborator = collaboratorEmails.includes(requesterEmail);

    if (!isOwner && !isCollaborator) {
      return res.status(403).json({ message: 'forbidden' });
    }

    const workspaceObjectId = new mongoose.Types.ObjectId(id);

    const mediaRows = await FileModel.aggregate<WorkspaceMediaStats>([
      { $match: { workspaceId: workspaceObjectId, isDirectory: false } },
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
      { $group: { _id: '$mediaType', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
      { $project: { _id: 0, mediaType: '$_id', count: 1, bytes: 1 } },
    ]);

    const userRows = await FileModel.aggregate<{ ownerId: mongoose.Types.ObjectId; files: number; bytes: number }>([
      { $match: { workspaceId: workspaceObjectId, isDirectory: false } },
      { $group: { _id: '$ownerId', files: { $sum: 1 }, bytes: { $sum: '$size' } } },
      { $project: { _id: 0, ownerId: '$_id', files: 1, bytes: 1 } },
      { $sort: { bytes: -1 } },
    ]);

    const mediaDefaults: Record<WorkspaceMediaStats['mediaType'], WorkspaceMediaStats> = {
      documents: { mediaType: 'documents', count: 0, bytes: 0 },
      photos: { mediaType: 'photos', count: 0, bytes: 0 },
      videos: { mediaType: 'videos', count: 0, bytes: 0 },
      audio: { mediaType: 'audio', count: 0, bytes: 0 },
    };
    for (const row of mediaRows) {
      mediaDefaults[row.mediaType] = row;
    }

    const mediaBreakdown: WorkspaceMediaStats[] = [
      mediaDefaults.documents,
      mediaDefaults.photos,
      mediaDefaults.videos,
      mediaDefaults.audio,
    ];

    const ownerIds = userRows.map((row) => row.ownerId);
    const users = ownerIds.length
      ? await UserModel.find({ _id: { $in: ownerIds } }).select('name')
      : [];
    const ownerNameById = new Map(users.map((user) => [String(user._id), user.name]));

    const userBreakdown: WorkspaceUserStats[] = userRows.map((row) => ({
      ownerId: String(row.ownerId),
      ownerName: ownerNameById.get(String(row.ownerId)) ?? 'Unknown user',
      files: row.files,
      bytes: row.bytes,
    }));

    const totalFiles = mediaBreakdown.reduce((sum, row) => sum + row.count, 0);
    const totalBytes = mediaBreakdown.reduce((sum, row) => sum + row.bytes, 0);
    const updatedAt = new Date();

    await WorkspaceModel.findByIdAndUpdate(id, {
      $set: {
        statsSnapshot: {
          totalFiles,
          totalBytes,
          mediaBreakdown,
          userBreakdown,
          updatedAt,
        },
      },
    });

    return res.json({
      workspaceId: id,
      totalFiles,
      totalBytes,
      mediaBreakdown,
      userBreakdown,
      updatedAt: updatedAt.toISOString(),
    } satisfies WorkspaceStatsResponse);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// UPDATE workspace
export async function updateWorkspace(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const { name, color, description, collaboration, pinned } = req.body as Partial<UpdateWorkspaceBody>;

    // Build $set and $unset separately so we can clear pinnedAt when unpinning
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, unknown> = {};

    if (name !== undefined) $set.name = name;
    if (color !== undefined) $set.color = color;
    if (description !== undefined) $set.description = description;
    if (collaboration !== undefined) $set.collaboration = collaboration;
    if (pinned === true) {
      $set.pinned = true;
      $set.pinnedAt = new Date();
    } else if (pinned === false) {
      $set.pinned = false;
      $unset.pinnedAt = '';
    }

    const updated = await WorkspaceModel.findByIdAndUpdate(
      id,
      { $set, ...( Object.keys($unset).length ? { $unset } : {}) },
      { new: true },
    );

    if (!updated) return res.status(404).json({ message: 'workspace not found' });
    return res.json(updated);
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// DELETE workspace
export async function deleteWorkspace(req: Request, res: Response) {
  try {
    const { id } = req.params as ObjectIdParams;
    const workspace = await WorkspaceModel.findByIdAndDelete(id);
    if (!workspace) return res.status(404).json({ message: 'workspace not found' });

    return res.status(204).send();
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}

// REORDER workspaces — body: { ids: string[] } in desired order
export async function reorderWorkspaces(req: Request, res: Response) {
  try {
    const { ids } = req.body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'ids must be a non-empty array' });
    }

    const bulkOps = ids.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { position: index } },
      },
    }));

    await WorkspaceModel.bulkWrite(bulkOps);
    return res.status(204).send();
  } catch {
    return res.status(500).json({ message: 'server error' });
  }
}
