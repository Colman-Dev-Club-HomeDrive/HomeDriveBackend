import { Router } from 'express';
import {
  downloadFile,
  getMediaTypeCounts,
  indexFile,
  listFiles,
  getFileById,
  deleteFile,
  openFile,
  renameFile,
  uploadFile,
} from '../controllers/files.controller.js';
import { validateFileId, validateIndexFile, validateRenameFile } from '../validators/files.validator.js';
import { upload } from '../middleware/upload.middleware.js';

export const filesRouter = Router();
filesRouter.get('/media-types', getMediaTypeCounts);
filesRouter.get('/', listFiles);
filesRouter.post('/upload', upload.single('file'), uploadFile);
filesRouter.post('/', validateIndexFile, indexFile);
filesRouter.get('/:id/download', validateFileId, downloadFile);
filesRouter.get('/:id', validateFileId, getFileById);
filesRouter.patch('/:id', validateFileId, validateRenameFile, renameFile);
filesRouter.delete('/:id', validateFileId, deleteFile);
filesRouter.post('/:id/open', validateFileId, openFile);
