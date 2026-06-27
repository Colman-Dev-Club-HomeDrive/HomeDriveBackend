export type IndexFileBody = {
  path?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  extension?: string;
  isDirectory?: boolean;
  workspaceId?: string;
  shareWith?: string;
};

export type RenameFileBody = {
  name: string;
};

export type ListFilesQuery = {
  workspaceId?: string;
  mediaType?: MediaType;
};

export type MediaType = 'documents' | 'photos' | 'videos' | 'audio';

export type MediaTypeCount = {
  mediaType: MediaType;
  count: number;
};
