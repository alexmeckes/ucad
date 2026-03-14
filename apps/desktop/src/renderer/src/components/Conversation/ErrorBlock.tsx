import type { AdapterEvent } from "@ucad/contracts";

interface ErrorBlockProps {
  event: AdapterEvent;
}

export function ErrorBlock({ event }: ErrorBlockProps) {
  const message = (event.payload.message as string) ?? (event.payload.error as string) ?? JSON.stringify(event.payload);

  return (
    <div className="msg msg-error">
      <div className="msg-header">
        <span className="msg-role msg-role-error">error</span>
        <span className="msg-time">{new Date(event.timestampIso).toLocaleTimeString()}</span>
      </div>
      <div className="msg-body msg-body-error">{message}</div>
    </div>
  );
}
