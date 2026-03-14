import { useState, useCallback } from "react";
import type { HealthStatus } from "@ucad/contracts";

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const refreshHealth = useCallback(async (): Promise<void> => {
    setHealth(await window.ucad.getHealth());
  }, []);

  return { health, refreshHealth };
}
