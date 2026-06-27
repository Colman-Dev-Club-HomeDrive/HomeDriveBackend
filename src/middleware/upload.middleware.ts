import multer from 'multer';
import nodePath from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

// Resolve upload directory relative to project root
const uploadDir = nodePath.resolve(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    // Generate unique filename: timestamp-uuid-extension
    const timestamp = Date.now();
    const uuid = randomUUID().slice(0, 8);
    const ext = nodePath.extname(file.originalname);
    cb(null, `${timestamp}-${uuid}${ext}`);
  },
});

// Create multer instance
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB max file size
  },
});

// Export the upload directory path for indexing
export const getUploadDirPath = (): string => uploadDir;

// Export a function to get the full path of an uploaded file
export const getUploadedFilePath = (filename: string): string => {
  return nodePath.join(uploadDir, filename);
};
