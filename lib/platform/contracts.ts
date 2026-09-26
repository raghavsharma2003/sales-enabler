export interface PlatformRecord<T = Record<string, unknown>> {
  id: string;
  kind: string;
  status: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: T;
}
export type WorkspaceEntity = { id: string; createdAt: string; status?: string; [key: string]: unknown };
export interface WorkspaceData {
  user: { id: string; email: string; role?: 'owner' | 'operator' | 'viewer'; emailVerified?: boolean; verificationRequired?: boolean };
  organization: { id: string; name: string };
  contacts: WorkspaceEntity[];
  knowledge: WorkspaceEntity[];
  memories: WorkspaceEntity[];
  actions: WorkspaceEntity[];
  sessions: WorkspaceEntity[];
  agents: WorkspaceEntity[];
}
export interface PlatformViewProps {
  records: PlatformRecord[];
  workspace: WorkspaceData;
  act: (action: string, body?: Record<string, unknown>) => Promise<unknown>;
  busy: boolean;
  navigate: (section: string, recordId?: string) => void;
  focusId?: string;
}
