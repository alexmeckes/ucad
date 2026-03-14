const style: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  color: "var(--text-muted)",
  background: "var(--surface-raised)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  lineHeight: "18px",
};

export function KeyboardHint({ keys }: { keys: string }) {
  return <kbd style={style}>{keys}</kbd>;
}
