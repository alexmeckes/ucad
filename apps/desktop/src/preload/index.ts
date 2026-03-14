import { contextBridge, ipcRenderer } from "electron";
import type {
  AdapterEvent,
  AdapterSettingsState,
  ForkSessionRequest,
  PermissionResolution,
  ProjectCreateRequest,
  SaveAdapterSettingsRequest,
  StartSessionRequest,
  UserTurnRequest
} from "@ucad/contracts";

const api = {
  getLaunchContext: (): Promise<{ cwd: string }> => ipcRenderer.invoke("app.launchContext"),
  getHealth: () => ipcRenderer.invoke("health.get"),
  listAdapters: () => ipcRenderer.invoke("adapter.list"),
  getAdapterSettings: (): Promise<AdapterSettingsState> => ipcRenderer.invoke("settings.adapters.get"),
  saveAdapterSettings: (req: SaveAdapterSettingsRequest): Promise<AdapterSettingsState> =>
    ipcRenderer.invoke("settings.adapters.save", req),

  createProject: (req: ProjectCreateRequest) => ipcRenderer.invoke("project.create", req),
  listProjects: () => ipcRenderer.invoke("project.list"),

  listSessions: (projectId: string) => ipcRenderer.invoke("session.list", { projectId }),
  listSessionEvents: (sessionId: string) => ipcRenderer.invoke("session.events", { sessionId }),

  createSession: (req: StartSessionRequest) => ipcRenderer.invoke("session.create", req),
  sendTurn: (req: UserTurnRequest) => ipcRenderer.invoke("session.sendTurn", req),
  forkSession: (req: ForkSessionRequest) => ipcRenderer.invoke("session.fork", req),
  interruptSession: (sessionId: string) => ipcRenderer.invoke("session.interrupt", { sessionId }),

  resolvePermission: (req: PermissionResolution) => ipcRenderer.invoke("permission.resolve", req),

  getDiff: (req: unknown) => ipcRenderer.invoke("review.getDiff", req),
  stageReview: (req: unknown) => ipcRenderer.invoke("review.stage", req),
  revertReview: (req: unknown) => ipcRenderer.invoke("review.revert", req),

  generateSessionId: () => ipcRenderer.invoke("session.generateId"),

  onEvent: (listener: (event: AdapterEvent) => void) => {
    const wrapped = (_: unknown, payload: AdapterEvent) => listener(payload);
    ipcRenderer.on("orchestrator:event", wrapped);
    return () => ipcRenderer.off("orchestrator:event", wrapped);
  }
};

contextBridge.exposeInMainWorld("ucad", api);
