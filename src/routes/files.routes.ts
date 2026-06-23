import { Router } from 'express';
import {
  browseDirectory,
  indexFile,
  listFiles,
  getFileById,
  deleteFile,
  openFile,
  renameFile,
} from '../controllers/files.controller.js';
import { validateFileId, validateIndexFile, validateRenameFile } from '../validators/files.validator.js';

export const filesRouter = Router();

// /browse must come before /:id so Express doesn't treat "browse" as an id
filesRouter.get('/browse', browseDirectory);
filesRouter.get('/', listFiles);
filesRouter.post('/', validateIndexFile, indexFile);
filesRouter.get('/:id', validateFileId, getFileById);
filesRouter.patch('/:id', validateFileId, validateRenameFile, renameFile);
filesRouter.delete('/:id', validateFileId, deleteFile);
filesRouter.post('/:id/open', validateFileId, openFile);
