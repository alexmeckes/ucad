export type UnifiedEventType =
  | "assistant_message"
  | "tool_call_requested"
  | "tool_call_result"
  | "command_started"
  | "command_output"
  | "command_finished"
  | "file_patch_proposed"
  | "file_patch_applied"
  | "permission_requested"
  | "permission_resolved"
  | "session_state_changed"
  | "error";

export interface UnifiedEvent {
  eventId: string;
  sessionId: string;
  projectId: string;
  timestampIso: string;
  sourceAdapterId: string;
  type: UnifiedEventType;
  payload: Record<string, unknown>;
}

export interface AdapterEvent extends UnifiedEvent {
  raw?: string;
}
