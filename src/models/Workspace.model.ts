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
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

export const WorkspaceModel = model<WorkspaceProps>('Workspace', WorkspaceSchema);
