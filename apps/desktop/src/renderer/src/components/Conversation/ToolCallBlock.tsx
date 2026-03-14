import { useState } from "react";
import type { AdapterEvent } from "@ucad/contracts";

interface ToolCallBlockProps {
  event: AdapterEvent;
}

export function ToolCallBlock({ event }: ToolCallBlockProps) {
  const toolName = (event.payload.toolName as string) ?? (event.payload.name as string) ?? "tool";
  const args = event.payload.arguments ?? event.payload.args;
  const result = event.payload.result ?? event.payload.output;
  const argsStr = args ? (typeof args === "string" ? args : JSON.stringify(args, null, 2)) : null;
  const resultStr = result ? (typeof result === "string" ? result : JSON.stringify(result, null, 2)) : null;
  const isResult = event.type === "tool_call_result";
  const success = isResult ? (event.payload.success !== false && event.payload.error == null) : null;

  const [argsOpen, setArgsOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);

  return (
    <div className="msg msg-tool">
      <div className="msg-header">
        <span className="msg-role msg-role-tool">{toolName}</span>
        {isResult && success !== null && (
          <span className={`tool-result-indicator ${success ? "tool-result-ok" : "tool-result-err"}`}>
            {success ? "ok" : "failed"}
          </span>
        )}
        <span className="msg-time">{new Date(event.timestampIso).toLocaleTimeString()}</span>
      </div>
      {argsStr && (
        <div className="tool-collapsible">
          <button className="tool-toggle" onClick={() => setArgsOpen((v) => !v)}>
            {argsOpen ? "\u25BE" : "\u25B8"} arguments
          </button>
          {argsOpen && <pre className="msg-tool-args">{argsStr}</pre>}
        </div>
      )}
      {resultStr && (
        <div className="tool-collapsible">
          <button className="tool-toggle" onClick={() => setResultOpen((v) => !v)}>
            {resultOpen ? "\u25BE" : "\u25B8"} output
          </button>
          {resultOpen && <pre className="msg-tool-result">{resultStr}</pre>}
        </div>
      )}
    </div>
  );
}
