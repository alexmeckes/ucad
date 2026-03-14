import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { AdapterEvent } from "@ucad/contracts";
import type { ConversationItem } from "../../hooks/useEvents";
import type { Session } from "../../hooks/useSessions";
import { MessageBubble } from "./MessageBubble";
import { PermissionOverlay } from "./PermissionOverlay";
import { adapterLabel } from "../../utils/adapterLabel";
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

/** Extract searchable text from a conversation item */
function itemText(item: ConversationItem): string {
  if (item.userContent) return item.userContent;
  if (item.terminalContent) return item.terminalContent;
  const p = item.event?.payload;
  if (p) {
    const content = (p as Record<string, unknown>).content;
    const output = (p as Record<string, unknown>).output;
    const message = (p as Record<string, unknown>).message;
    return [content, output, message].filter(Boolean).join(" ");
  }
  return "";
}

export function Conversation({ items, rawEvents, permissionEvent, onResolvePermission, isWaiting, projectName, session, adapters, onQuickCreateSession }: ConversationProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length, rawEvents.length, isWaiting]);

  // Cmd+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((v) => {
          if (!v) setTimeout(() => searchRef.current?.focus(), 0);
          return !v;
        });
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  const matchingIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    const ids = new Set<string>();
    for (const item of items) {
      if (itemText(item).toLowerCase().includes(q)) {
        ids.add(item.id);
      }
    }
    return ids;
  }, [items, searchQuery]);

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
          <div className="conversation-header-right">
            {searchOpen && (
              <input
                ref={searchRef}
                className="conversation-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                autoFocus
              />
            )}
            {matchingIds && (
              <span className="conversation-search-count">
                {matchingIds.size} match{matchingIds.size !== 1 ? "es" : ""}
              </span>
            )}
            <button
              className={`conversation-search-btn${searchOpen ? " active" : ""}`}
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) setSearchQuery("");
              }}
              title="Search (Cmd+F)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {projectName && (
              <span className="conversation-header-project">{projectName}</span>
            )}
          </div>
        </div>
      )}

      <div className="conversation-messages">
        {session?.state?.toUpperCase() === "INTERRUPTED" && items.length > 0 && (
          <div className="conversation-resume-banner">
            <span>This thread was interrupted.</span>
            <span className="conversation-resume-hint">Send a message to resume.</span>
          </div>
        )}
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
          <div
            key={item.id}
            className={matchingIds && !matchingIds.has(item.id) ? "search-dimmed" : ""}
          >
            <MessageBubble item={item} />
          </div>
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
