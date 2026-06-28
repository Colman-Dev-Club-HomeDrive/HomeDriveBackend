import { Router } from 'express';
import {
  downloadFile,
  getMediaTypeCounts,
  getStorageStats,
  indexFile,
  listTrashFiles,
  listFiles,
  getFileById,
  deleteFile,
  permanentlyDeleteFile,
  openFile,
  renameFile,
  restoreFile,
  shareFile,
  uploadFile,
} from '../controllers/files.controller.js';
import { validateFileId, validateIndexFile, validateRenameFile, validateShareFile } from '../validators/files.validator.js';
import { upload } from '../middleware/upload.middleware.js';

export const filesRouter = Router();
filesRouter.get('/media-types', getMediaTypeCounts);
filesRouter.get('/storage', getStorageStats);
filesRouter.get('/', listFiles);
filesRouter.get('/trash', listTrashFiles);
filesRouter.post('/upload', upload.single('file'), uploadFile);
filesRouter.post('/', validateIndexFile, indexFile);
filesRouter.get('/:id/download', validateFileId, downloadFile);
filesRouter.get('/:id', validateFileId, getFileById);
filesRouter.patch('/:id', validateFileId, validateRenameFile, renameFile);
filesRouter.patch('/:id/share', validateFileId, validateShareFile, shareFile);
filesRouter.patch('/:id/restore', validateFileId, restoreFile);
filesRouter.delete('/:id', validateFileId, deleteFile);
filesRouter.delete('/:id/permanent', validateFileId, permanentlyDeleteFile);
filesRouter.post('/:id/open', validateFileId, openFile);
