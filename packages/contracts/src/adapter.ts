import type { AdapterEvent } from "./events";
import type { SessionRef, StartSessionRequest, UserTurnRequest } from "./sessions";

export type AdapterKind = "cli" | "harness";

export interface AdapterCapabilities {
  structuredEvents: boolean;
  structuredTools: boolean;
  supportsForkHints: boolean;
  supportsResume: boolean;
  supportsInterrupt: boolean;
  supportsPatch: boolean;
  supportsMcpPassthrough: boolean;
}

export interface AdapterDiagnostics {
  adapterId: string;
  command?: string;
  binaryFound: boolean;
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  latencyMs: number | null;
  healthy: boolean;
  detail?: string;
  installHintCommand?: string;
  authHintCommand?: string;
}

export interface AgentAdapter {
  metadata(): { id: string; name: string; kind: AdapterKind; version?: string };
  capabilities(): AdapterCapabilities;
  diagnostics?(): Promise<AdapterDiagnostics>;
  start(req: StartSessionRequest): Promise<void>;
  sendTurn(req: UserTurnRequest): Promise<void>;
  interrupt(req: SessionRef): Promise<void>;
  resume(req: SessionRef): Promise<void>;
  stop(req: SessionRef): Promise<void>;
  streamEvents(req: SessionRef): AsyncIterable<AdapterEvent>;
}
