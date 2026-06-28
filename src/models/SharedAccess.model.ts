import { Schema, model, type HydratedDocument } from 'mongoose';
import { SHARED_ACCESS_ROLES, type SharedAccessRole } from '../config/shared-access-users.js';

type SharedAccessProps = {
  email: string;
  role: SharedAccessRole;
};

export type SharedAccessDocument = HydratedDocument<SharedAccessProps>;

const SharedAccessSchema = new Schema<SharedAccessProps>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, required: true, enum: SHARED_ACCESS_ROLES, default: 'viewer' },
  },
  {
    timestamps: true,
  },
);

export const SharedAccessModel = model<SharedAccessProps>('SharedAccess', SharedAccessSchema);
