export interface NoteListOptions {
  offset?: number;
  limit?: number;
  folder?: string;
  sort?: 'modified' | 'created' | 'name';
  order?: 'asc' | 'desc';
}

export interface NoteRead {
  path: string;
  content: string;
  version: string;
  totalLines: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  title: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  links: string[];
}

export type AgentApi = ReturnType<typeof import('./client.js').createAgentApiClient>;
