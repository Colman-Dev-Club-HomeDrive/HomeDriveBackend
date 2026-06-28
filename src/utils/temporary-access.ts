import type { SharedAccessRole, SharedAccessUser } from '../config/shared-access-users.js';
import { SHARED_ACCESS_USERS } from '../config/shared-access-users.js';
import { SharedAccessModel } from '../models/SharedAccess.model.js';

let seedPromise: Promise<void> | null = null;

export function normalizeEmail(email?: string | null): string {
  return (email ?? '').trim().toLowerCase();
}

async function ensureSharedAccessSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await Promise.all(
        SHARED_ACCESS_USERS.map(async (entry) => {
          const normalizedEmail = normalizeEmail(entry.email);
          await SharedAccessModel.updateOne(
            { email: normalizedEmail },
            { $setOnInsert: { email: normalizedEmail, role: entry.role } },
            { upsert: true },
          );
        }),
      );
    })();
  }

  await seedPromise;
}

export async function canAccessSharedData(email?: string | null): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  await ensureSharedAccessSeeded();
  const exists = await SharedAccessModel.exists({ email: normalized });
  return Boolean(exists);
}

export async function canManageSharedAccess(email?: string | null): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  await ensureSharedAccessSeeded();
  const user = await SharedAccessModel.findOne({ email: normalized }).select('role').lean();
  return user?.role === 'manager';
}

export async function canUploadFiles(email?: string | null): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  await ensureSharedAccessSeeded();
  const user = await SharedAccessModel.findOne({ email: normalized }).select('role').lean();
  return user?.role === 'manager' || user?.role === 'editor';
}

export async function canDownloadFiles(email?: string | null): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  await ensureSharedAccessSeeded();
  const user = await SharedAccessModel.findOne({ email: normalized }).select('role').lean();
  return user?.role === 'manager' || user?.role === 'editor' || user?.role === 'viewer';
}

export async function listSharedAccessUsers(): Promise<SharedAccessUser[]> {
  await ensureSharedAccessSeeded();
  const users = await SharedAccessModel.find().select('email role -_id').sort({ email: 1 }).lean();
  return users.map((user) => ({ email: normalizeEmail(user.email), role: user.role }));
}

export async function addSharedAccessViewer(email: string): Promise<SharedAccessUser[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return listSharedAccessUsers();
  }

  await ensureSharedAccessSeeded();

  const existing = await SharedAccessModel.findOne({ email: normalized }).select('_id').lean();
  if (!existing) {
    await SharedAccessModel.create({ email: normalized, role: 'viewer' });
  }

  return listSharedAccessUsers();
}

export async function getSharedAccessRole(email: string): Promise<SharedAccessRole | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;

  await ensureSharedAccessSeeded();
  const user = await SharedAccessModel.findOne({ email: normalized }).select('role').lean();
  return user?.role;
}

export async function updateSharedAccessRole(email: string, role: SharedAccessRole): Promise<SharedAccessUser[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return listSharedAccessUsers();
  }

  await ensureSharedAccessSeeded();

  await SharedAccessModel.updateOne({ email: normalized }, { $set: { role } });
  return listSharedAccessUsers();
}

export async function countSharedAccessByRole(role: SharedAccessRole): Promise<number> {
  await ensureSharedAccessSeeded();
  return SharedAccessModel.countDocuments({ role });
}

export async function removeSharedAccessUser(email: string): Promise<SharedAccessUser[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return listSharedAccessUsers();
  }

  await ensureSharedAccessSeeded();
  await SharedAccessModel.deleteOne({ email: normalized });
  return listSharedAccessUsers();
}
