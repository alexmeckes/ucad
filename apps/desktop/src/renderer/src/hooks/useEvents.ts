import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { AdapterEvent } from "@ucad/contracts";
import { stripAnsi, cleanTerminalOutput, stripUserEcho } from "../components/shared/stripAnsi";

export interface ConversationItem {
  kind: "user" | "event" | "terminal_output";
  id: string;
  timestamp: string;
  userContent?: string;
  event?: AdapterEvent;
  terminalContent?: string;
}

/**
 * Light cleaning: strip ANSI, normalize whitespace, remove blank lines.
 * Used as fallback when aggressive cleaning removes everything.
 */
function lightClean(raw: string): string {
  let result = stripAnsi(raw);
  result = result
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").replace(/ {2,}/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

/**
 * Build conversation items from raw events with smart consolidation.
 * - Suppresses all terminal output before the first user turn (TUI startup noise)
 * - Accumulates consecutive command_output events into single terminal blocks
 * - Strips ANSI codes, TUI noise, and PTY echo of user input
 * - Falls back to light cleaning if aggressive cleaning removes all content
 */
function buildConversationItems(
  events: AdapterEvent[],
  selectedSessionId: string
): ConversationItem[] {
  const filtered = events.filter(
    (e) => e.sessionId === selectedSessionId || !selectedSessionId
  );

  const items: ConversationItem[] = [];
  let outputBuffer = "";
  let outputStartTime = "";
  let outputFirstId = "";
  let seenUserTurn = false;
  let lastUserContent = "";

  const flushOutput = () => {
    if (!outputBuffer) return;

    // Suppress all pre-first-turn output (TUI startup: dashboard, MCP prompt, etc.)
    if (!seenUserTurn) {
      outputBuffer = "";
      outputStartTime = "";
      outputFirstId = "";
      return;
    }

    // Try aggressive cleaning first
    let cleaned = cleanTerminalOutput(outputBuffer);

    // Strip the echo of the last user input
    if (lastUserContent) {
      if (cleaned) {
        cleaned = stripUserEcho(cleaned, lastUserContent);
      }
      lastUserContent = "";
    }

    // Fallback: if aggressive cleaning produced nothing but raw buffer had content,
    // use light cleaning (strip ANSI only, no noise filtering)
    if (!cleaned) {
      const light = lightClean(outputBuffer);
      if (light.length > 0) {
        // Strip echo from light-cleaned version too
        cleaned = stripUserEcho(light, lastUserContent || "");
        if (!cleaned) cleaned = light;
      }
    }

    if (cleaned) {
      items.push({
        kind: "terminal_output",
        id: `term-${outputFirstId}`,
        timestamp: outputStartTime,
        terminalContent: cleaned,
      });
    }
    outputBuffer = "";
    outputStartTime = "";
    outputFirstId = "";
  };

  for (const event of filtered) {
    // Handle synthetic user turns
    if (event.payload?.__userTurn) {
      flushOutput();
      seenUserTurn = true;
      lastUserContent = (event.payload.content as string) ?? "";
      items.push({
        kind: "user",
        id: event.eventId,
        timestamp: event.timestampIso,
        userContent: lastUserContent,
      });
      continue;
    }

    // Accumulate command_output into buffer
    if (event.type === "command_output") {
      const output = (event.payload.output as string) ?? "";
      if (!outputBuffer) {
        outputStartTime = event.timestampIso;
        outputFirstId = event.eventId;
      }
      outputBuffer += output;
      continue;
    }

    // All other event types: flush accumulated output first
    flushOutput();

    // Skip command_started for user_turn (redundant with synthetic user message)
    if (
      event.type === "command_started" &&
      event.payload.command === "user_turn"
    ) {
      continue;
    }

    // Skip command_finished unless non-zero exit code
    if (event.type === "command_finished") {
      const exitCode = event.payload.exitCode as number | undefined;
      if (exitCode === undefined || exitCode === 0) continue;
    }

    // Skip session_state_changed to RUNNING (initial state, shown via assistant_message)
    if (
      event.type === "session_state_changed" &&
      event.payload.state === "RUNNING"
    ) {
      continue;
    }

    items.push({
      kind: "event",
      id: event.eventId,
      timestamp: event.timestampIso,
      event,
    });
  }

  // Flush any remaining output
  flushOutput();

  return items;
}

export function useEvents(selectedSessionId: string) {
  const [events, setEvents] = useState<AdapterEvent[]>([]);
  const [permissionEvent, setPermissionEvent] = useState<AdapterEvent | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const turnMapRef = useRef<Map<string, string>>(new Map());

  const refreshEvents = useCallback(
    async (sessionId: string): Promise<void> => {
      const next = await window.ucad.listSessionEvents(sessionId);
      setEvents(next);
    },
    []
  );

  useEffect(() => {
    const unsubscribe = window.ucad.onEvent((event) => {
      setEvents((prev) => [...prev, event]);
      if (event.type === "permission_requested") {
        setPermissionEvent(event);
      }
      if (event.type === "permission_resolved") {
        setPermissionEvent(null);
      }
      // Clear waiting state when we get a response
      if (event.type === "assistant_message" || event.type === "command_finished" || event.type === "error") {
        setIsWaiting(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      void refreshEvents(selectedSessionId);
    }
  }, [selectedSessionId, refreshEvents]);

  const sendTurn = useCallback(
    async (content: string): Promise<void> => {
      if (!selectedSessionId || !content) return;
      const turnId = crypto.randomUUID();
      turnMapRef.current.set(turnId, content);

      // Inject synthetic user message event for the conversation
      const syntheticEvent: AdapterEvent = {
        eventId: `user-${turnId}`,
        sessionId: selectedSessionId,
        projectId: "",
        timestampIso: new Date().toISOString(),
        sourceAdapterId: "__user__",
        type: "assistant_message", // reused to carry user text in-band
        payload: { __userTurn: true, content },
      };
      setEvents((prev) => [...prev, syntheticEvent]);
      setIsWaiting(true);

      const result = await window.ucad.sendTurn({
        sessionId: selectedSessionId,
        turnId,
        content,
      });
      // Fallback: if sendTurn returns a permission request before the event fires,
      // create a minimal permission event so the overlay appears immediately.
      if (result.awaitingApproval && result.permissionRequestId) {
        setPermissionEvent((prev) => {
          if (prev) return prev; // event handler already set it
          return {
            eventId: `perm-fallback-${result.permissionRequestId}`,
            sessionId: selectedSessionId,
            projectId: "",
            timestampIso: new Date().toISOString(),
            sourceAdapterId: "__system__",
            type: "permission_requested",
            payload: { requestId: result.permissionRequestId },
          };
        });
      }
    },
    [selectedSessionId]
  );

  const conversationItems = useMemo(
    () => buildConversationItems(events, selectedSessionId),
    [events, selectedSessionId]
  );

  const clearPermissionEvent = useCallback(() => setPermissionEvent(null), []);

  return {
    events,
    conversationItems,
    isWaiting,
    permissionEvent,
    clearPermissionEvent,
    refreshEvents,
    sendTurn,
  };
}
