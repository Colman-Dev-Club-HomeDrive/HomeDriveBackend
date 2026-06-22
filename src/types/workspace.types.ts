import type { CreateWorkspaceDto, UpdateWorkspaceDto } from '@homedrive/types';

export type CreateWorkspaceBody = CreateWorkspaceDto & {
  ownerId?: string;
};

export type UpdateWorkspaceBody = UpdateWorkspaceDto;
