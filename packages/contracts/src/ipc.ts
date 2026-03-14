import type { AgentAdapter } from "./adapter";
import type { SaveAdapterSettingsRequest } from "./external-adapters";
import type { HealthStatus } from "./health";
import type { PermissionResolution } from "./permissions";
import type { ForkSessionRequest, StartSessionRequest, UserTurnRequest } from "./sessions";

export interface ProjectCreateRequest {
  name: string;
  rootPath: string;
}

export interface IpcChannels {
  "app.launchContext": undefined;
  "session.create": StartSessionRequest;
  "session.sendTurn": UserTurnRequest;
  "session.fork": ForkSessionRequest;
  "session.list": { projectId: string };
  "session.events": { sessionId: string };
  "session.interrupt": { sessionId: string };
  "permission.resolve": PermissionResolution;
  "review.getDiff": { sessionId: string; scope: "uncommitted" | "last_turn" | "branch"; baseRef?: string };
  "review.stage": { sessionId: string; filePath?: string; patch?: string };
  "review.revert": { sessionId: string; filePath?: string; patch?: string };
  "adapter.list": undefined;
  "settings.adapters.get": undefined;
  "settings.adapters.save": SaveAdapterSettingsRequest;
  "health.get": undefined;
  "project.create": ProjectCreateRequest;
  "project.list": undefined;
}

export type AdapterListResponse = Array<ReturnType<AgentAdapter["metadata"]>>;
