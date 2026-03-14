import type {
  AdapterEvent,
  AdapterSettingsState,
  ForkSessionRequest,
  HealthStatus,
  PermissionResolution,
  ProjectCreateRequest,
  SaveAdapterSettingsRequest,
  StartSessionRequest,
  UserTurnRequest
} from "@ucad/contracts";

declare global {
  interface Window {
    ucad: {
      getLaunchContext: () => Promise<{ cwd: string }>;
      getHealth: () => Promise<HealthStatus>;
      listAdapters: () => Promise<Array<{ id: string; name: string; kind: string; version?: string }>>;
      getAdapterSettings: () => Promise<AdapterSettingsState>;
      saveAdapterSettings: (req: SaveAdapterSettingsRequest) => Promise<AdapterSettingsState>;

      createProject: (req: ProjectCreateRequest) => Promise<{ id: string; name: string; rootPath: string; isGitRepo: boolean }>;
      listProjects: () => Promise<Array<{ id: string; name: string; rootPath: string; isGitRepo: boolean }>>;

      listSessions: (projectId: string) => Promise<Array<{
        id: string;
        projectId: string;
        parentSessionId: string | null;
        adapterId: string;
        mode: string;
        state: string;
        title: string | null;
        workspaceRoot: string | null;
        workspaceStrategy: string | null;
        gitBranch: string | null;
        createdAt: string;
        updatedAt: string;
        archivedAt: string | null;
      }>>;
      listSessionEvents: (sessionId: string) => Promise<AdapterEvent[]>;

      createSession: (req: StartSessionRequest) => Promise<{ sessionId: string; workspaceRoot: string }>;
      sendTurn: (req: UserTurnRequest) => Promise<{ queued: boolean; awaitingApproval?: boolean; permissionRequestId?: string }>;
      forkSession: (req: ForkSessionRequest) => Promise<{ sessionId: string; workspaceRoot: string }>;
      interruptSession: (sessionId: string) => Promise<void>;

      resolvePermission: (req: PermissionResolution) => Promise<{ resumed: boolean }>;

      getDiff: (req: unknown) => Promise<string>;
      stageReview: (req: unknown) => Promise<void>;
      revertReview: (req: unknown) => Promise<void>;

      generateSessionId: () => Promise<string>;

      onEvent: (listener: (event: AdapterEvent) => void) => () => void;
    };
  }
}

export {};
