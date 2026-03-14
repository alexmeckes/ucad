import type { AdapterEvent } from "@ucad/contracts";

interface CommandBlockProps {
  event: AdapterEvent;
}

export function CommandBlock({ event }: CommandBlockProps) {
  const command = (event.payload.command as string) ?? "";
  const exitCode = event.payload.exitCode as number | undefined;

  if (event.type === "command_started") {
    return (
      <div className="msg msg-command">
        <div className="msg-header">
          <span className="msg-role msg-role-command">$</span>
          <span className="msg-command-text">{command}</span>
        </div>
      </div>
    );
  }

  if (event.type === "command_finished") {
    if (exitCode === undefined || exitCode === 0) return null;
    return (
      <div className="msg msg-command">
        <div className="msg-header">
          <span className="msg-role msg-role-command">$</span>
          <span className="msg-command-text">{command}</span>
          <span className="msg-exit-code exit-err">exit {exitCode}</span>
        </div>
      </div>
    );
  }

  return null;
}
