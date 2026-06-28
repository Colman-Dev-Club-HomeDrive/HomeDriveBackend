import { Router } from 'express';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspaceStats,
  getWorkspaceById,
  listWorkspaces,
  reorderWorkspaces,
  updateWorkspace,
} from '../controllers/workspace.controller.js';
import {
  validateCreateWorkspace,
  validateWorkspaceId,
  validateUpdateWorkspace,
} from '../validators/workspace.validator.js';

export const workspacesRouter = Router();

workspacesRouter.post('/', validateCreateWorkspace, createWorkspace);
workspacesRouter.get('/', listWorkspaces);
// /reorder must come before /:id so Express doesn't treat "reorder" as an id
workspacesRouter.patch('/reorder', reorderWorkspaces);
workspacesRouter.get('/:id/stats', validateWorkspaceId, getWorkspaceStats);
workspacesRouter.get('/:id', validateWorkspaceId, getWorkspaceById);
workspacesRouter.patch('/:id', validateWorkspaceId, validateUpdateWorkspace, updateWorkspace);
workspacesRouter.delete('/:id', validateWorkspaceId, deleteWorkspace);
