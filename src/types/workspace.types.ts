import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@homedrive/types';

export type CreateWorkspaceBody = CreateWorkspaceDto & {
  ownerId?: string;
};

export type UpdateWorkspaceBody = UpdateWorkspaceDto;

export type WorkspaceMediaStats = {
  mediaType: 'documents' | 'photos' | 'videos' | 'audio';
  count: number;
  bytes: number;
};

export type WorkspaceUserStats = {
  ownerId: string;
  ownerName: string;
  files: number;
  bytes: number;
};

export type WorkspaceStatsResponse = {
  workspaceId: string;
  totalFiles: number;
  totalBytes: number;
  mediaBreakdown: WorkspaceMediaStats[];
  userBreakdown: WorkspaceUserStats[];
  updatedAt: string;
};
