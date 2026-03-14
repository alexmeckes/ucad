interface UserMessageProps {
  content: string;
  timestamp: string;
}

export function UserMessage({ content, timestamp }: UserMessageProps) {
  return (
    <div className="msg msg-user">
      <div className="msg-header">
        <span className="msg-role msg-role-user">you</span>
        <span className="msg-time">{new Date(timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="msg-body msg-body-user">{content}</div>
    </div>
  );
}
