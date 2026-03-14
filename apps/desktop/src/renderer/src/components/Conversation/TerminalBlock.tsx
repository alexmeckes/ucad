interface TerminalBlockProps {
  content: string;
  timestamp: string;
}

export function TerminalBlock({ content, timestamp }: TerminalBlockProps) {
  if (!content) return null;

  return (
    <div className="msg msg-terminal">
      <div className="msg-header">
        <span className="msg-role msg-role-terminal">output</span>
        <span className="msg-time">{new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <pre className="msg-terminal-content">{content}</pre>
    </div>
  );
}
