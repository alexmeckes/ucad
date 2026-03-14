import { useCallback } from "react";
import type { AdapterEvent } from "@ucad/contracts";

export function usePermissions(
  permissionEvent: AdapterEvent | null,
  selectedSessionId: string,
  clearPermissionEvent: () => void
) {
  const resolvePermission = useCallback(
    async (
      decision: "allow" | "allow_with_scope" | "deny",
      scope?: "once" | "turn" | "session" | "workspace"
    ): Promise<void> => {
      const requestId = permissionEvent?.payload?.requestId as string | undefined;
      if (!requestId || !selectedSessionId) return;
      await window.ucad.resolvePermission({
        requestId,
        sessionId: selectedSessionId,
        decision,
        scope,
        decidedBy: "user",
      });
      clearPermissionEvent();
    },
    [permissionEvent, selectedSessionId, clearPermissionEvent]
  );

  return { resolvePermission };
}
