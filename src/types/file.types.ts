export type IndexFileBody = {
  path: string;
  workspaceId?: string;
};

export type RenameFileBody = {
  name: string;
};

export type BrowseQuery = {
  path?: string;
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

export type BrowseEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  extension: string;
  mimeType: string;
};
