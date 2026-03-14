/** Format adapter ID into a short display name */
export function adapterLabel(adapterId: string): string {
  switch (adapterId) {
    case "claude-cli": return "Claude";
    case "codex-cli": return "Codex";
    case "gemini-cli": return "Gemini";
    default: return adapterId.replace(/-cli$/, "").replace(/^\w/, (c) => c.toUpperCase());
  }
}
