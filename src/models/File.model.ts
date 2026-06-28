import { Schema, model, Types, type HydratedDocument } from 'mongoose';

type FileProps = {
  name: string;
  path?: string;
  size: number;
  mimeType: string;
  extension: string;
  isDirectory: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  workspaceId?: Types.ObjectId;
  ownerId: Types.ObjectId;
  collaboration?: string;
};

export type FileDocument = HydratedDocument<FileProps>;

const FileSchema = new Schema<FileProps>(
  {
    name: { type: String, required: true, trim: true },
    path: { type: String, default: '', trim: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    extension: { type: String, default: '' },
    isDirectory: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    collaboration: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

export const FileModel = model<FileProps>('File', FileSchema);
