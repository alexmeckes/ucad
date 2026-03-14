import { useEffect, useRef } from "react";
import type { AdapterEvent } from "@ucad/contracts";
import type { ConversationItem } from "../../hooks/useEvents";
import type { Session } from "../../hooks/useSessions";
import { MessageBubble } from "./MessageBubble";
import { PermissionOverlay } from "./PermissionOverlay";
import "./Conversation.css";

interface ConversationProps {
  items: ConversationItem[];
  rawEvents: AdapterEvent[];
  permissionEvent: AdapterEvent | null;
  onResolvePermission: (
    decision: "allow" | "allow_with_scope" | "deny",
    scope?: "once" | "turn" | "session" | "workspace"
  ) => Promise<void>;
  isWaiting: boolean;
  projectName: string | null;
  session: Session | null;
  adapters: Array<{ id: string; name: string }>;
  onQuickCreateSession: (adapterId: string) => void;
}

function adapterLabel(adapterId: string): string {
  switch (adapterId) {
    case "claude-cli": return "Claude";
    case "codex-cli": return "Codex";
    case "gemini-cli": return "Gemini";
    default: return adapterId.replace(/-cli$/, "").replace(/^\w/, (c) => c.toUpperCase());
  }
}

export function Conversation({ items, rawEvents, permissionEvent, onResolvePermission, isWaiting, projectName, session, adapters, onQuickCreateSession }: ConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length, rawEvents.length, isWaiting]);

  const adapter = session ? adapterLabel(session.adapterId) : null;
  const titleParts = session?.title?.split(" \u00b7 ") ?? [];
  const model = titleParts.length > 1 ? titleParts[1] : null;
  const stateKey = session?.state?.toLowerCase() ?? "";

  return (
    <div className="conversation" data-testid="events-list">
      {/* Thread header */}
      {session && (
        <div className="conversation-header">
          <div className="conversation-header-left">
            <span className={`conversation-header-dot session-state-${stateKey}`} />
            <span className="conversation-header-adapter">{adapter}</span>
            {model && <span className="conversation-header-model">{model}</span>}
          </div>
          {projectName && (
            <span className="conversation-header-project">{projectName}</span>
          )}
        </div>
      )}

      <div className="conversation-messages">
        {items.length === 0 && (
          <div className="conversation-empty">
            {session ? (
              <>
                <div className="conversation-empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="conversation-empty-title">
                  {adapter} is ready
                </div>
                <div className="conversation-empty-hint">
                  {projectName
                    ? `Working in ${projectName}. Send a message to start.`
                    : "Send a message to start."
                  }
                </div>
              </>
            ) : (
              <>
                <div className="conversation-empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="conversation-empty-title">No thread selected</div>
                <div className="conversation-empty-hint">
                  Select a thread from the sidebar or create a new one.
                </div>
              </>
            )}
          </div>
        )}
        {items.map((item) => (
          <MessageBubble key={item.id} item={item} />
        ))}
        {permissionEvent && (
          <PermissionOverlay
            event={permissionEvent}
            onResolve={onResolvePermission}
          />
        )}
        {isWaiting && (
          <div className="msg-thinking">
            <div className="thinking-dots">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
