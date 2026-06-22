import type { Request, Response } from 'express';
import { WorkspaceModel } from '../models/Workspace.model.js';
import { UserModel } from '../models/User.model.js';
import type { CreateWorkspaceBody, UpdateWorkspaceBody } from '../types/workspace.types.js';
import type { ObjectIdParams } from '../types/common.types.js';

// TODO: remove once auth is wired up
const FIXED_USER_ID = '6854abcd1234567890abcdef';

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
