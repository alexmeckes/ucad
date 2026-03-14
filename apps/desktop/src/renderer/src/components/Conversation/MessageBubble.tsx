import type { ConversationItem } from "../../hooks/useEvents";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { TerminalBlock } from "./TerminalBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { DiffBlock } from "./DiffBlock";
import { ErrorBlock } from "./ErrorBlock";
import { StateChangeNotice } from "./StateChangeNotice";

interface MessageBubbleProps {
  item: ConversationItem;
}

export function MessageBubble({ item }: MessageBubbleProps) {
  if (item.kind === "user") {
    return <UserMessage content={item.userContent ?? ""} timestamp={item.timestamp} />;
  }

  if (item.kind === "terminal_output") {
    return <TerminalBlock content={item.terminalContent ?? ""} timestamp={item.timestamp} />;
  }

  const event = item.event;
  if (!event) return null;

  switch (event.type) {
    case "assistant_message":
      return (
        <AssistantMessage
          content={(event.payload.message as string) ?? (event.payload.content as string) ?? JSON.stringify(event.payload)}
          adapter={event.sourceAdapterId}
          timestamp={event.timestampIso}
        />
      );

    // Hide internal command blocks - these are adapter implementation details
    case "command_started":
    case "command_finished": {
      // Only show command_finished with non-zero exit code as an error
      if (event.type === "command_finished") {
        const exitCode = event.payload.exitCode as number | undefined;
        if (exitCode !== undefined && exitCode !== 0) {
          return <ErrorBlock event={{
            ...event,
            payload: { message: `Process exited with code ${exitCode}` },
          }} />;
        }
      }
      return null;
    }

    case "tool_call_requested":
    case "tool_call_result":
      return <ToolCallBlock event={event} />;

    case "file_patch_proposed":
    case "file_patch_applied":
      return <DiffBlock event={event} />;

    case "error":
      return <ErrorBlock event={event} />;

    case "session_state_changed":
      return <StateChangeNotice event={event} />;

    case "permission_requested":
      return (
        <div className="msg-state-change">
          <span className="state-pill state-pill-perm">
            permission requested
            {event.payload.capability && (
              <span className="state-pill-detail"> &middot; {String(event.payload.capability).replace(/_/g, " ")}</span>
            )}
          </span>
        </div>
      );

    case "permission_resolved": {
      const decision = (event.payload.decision as string) ?? "unknown";
      const scope = event.payload.scope as string | undefined;
      const capability = event.payload.capability as string | undefined;
      const isAllow = decision.startsWith("allow");
      return (
        <div className="msg-state-change">
          <span className={`state-pill ${isAllow ? "state-pill-perm-allow" : "state-pill-perm-deny"}`}>
            {isAllow ? "allowed" : "denied"}
            {scope && <span className="state-pill-detail"> &middot; {scope}</span>}
            {capability && <span className="state-pill-detail"> &middot; {capability.replace(/_/g, " ")}</span>}
          </span>
        </div>
      );
    }

    default:
      return null;
  }
}
