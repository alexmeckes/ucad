import { Markdown } from "../shared/Markdown";
import { stripAnsi } from "../shared/stripAnsi";

interface AssistantMessageProps {
  content: string;
  adapter: string;
  timestamp: string;
}

export function AssistantMessage({ content, adapter, timestamp }: AssistantMessageProps) {
  const clean = stripAnsi(content);
  if (!clean.trim()) return null;

  return (
    <div className="msg msg-assistant">
      <div className="msg-header">
        <span className="msg-role msg-role-assistant">{adapter}</span>
        <span className="msg-time">{new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="msg-body">
        <Markdown content={clean} />
      </div>
    </div>
  );
}
