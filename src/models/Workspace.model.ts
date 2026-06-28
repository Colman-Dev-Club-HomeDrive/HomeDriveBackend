import { Schema, model, Types, type HydratedDocument } from 'mongoose';
import type { WorkspaceIcon } from '@homedrive/types';

type WorkspaceProps = {
  name: string;
  icon: WorkspaceIcon;
  color: string;
  description?: string;
  collaboration?: string;
  pinned: boolean;
  pinnedAt?: Date;
  fileCount: number;
  position: number;
  ownerId: Types.ObjectId;
  statsSnapshot?: {
    totalFiles: number;
    totalBytes: number;
    mediaBreakdown: Array<{
      mediaType: 'documents' | 'photos' | 'videos' | 'audio';
      count: number;
      bytes: number;
    }>;
    userBreakdown: Array<{
      ownerId: string;
      ownerName: string;
      files: number;
      bytes: number;
    }>;
    updatedAt: Date;
  };
};

export type WorkspaceDocument = HydratedDocument<WorkspaceProps>;

const WORKSPACE_ICONS: WorkspaceIcon[] = ['folder', 'link', 'document', 'code'];

const WorkspaceSchema = new Schema<WorkspaceProps>(
  {
    name: { type: String, required: true, trim: true },
    icon: { type: String, enum: WORKSPACE_ICONS, required: true },
    color: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    collaboration: { type: String, trim: true },
    pinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
    fileCount: { type: Number, default: 0 },
    position: { type: Number, default: 0, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    statsSnapshot: {
      type: {
        totalFiles: { type: Number, default: 0 },
        totalBytes: { type: Number, default: 0 },
        mediaBreakdown: {
          type: [
            {
              mediaType: {
                type: String,
                enum: ['documents', 'photos', 'videos', 'audio'],
                required: true,
              },
              count: { type: Number, default: 0 },
              bytes: { type: Number, default: 0 },
              _id: false,
            },
          ],
          default: [],
        },
        userBreakdown: {
          type: [
            {
              ownerId: { type: String, required: true },
              ownerName: { type: String, required: true },
              files: { type: Number, default: 0 },
              bytes: { type: Number, default: 0 },
              _id: false,
            },
          ],
          default: [],
        },
        updatedAt: { type: Date, default: Date.now },
      },
      default: null,
    },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

export const WorkspaceModel = model<WorkspaceProps>('Workspace', WorkspaceSchema);
