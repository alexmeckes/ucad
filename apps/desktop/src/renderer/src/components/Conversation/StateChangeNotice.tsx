import type { AdapterEvent } from "@ucad/contracts";

interface StateChangeNoticeProps {
  event: AdapterEvent;
}

export function StateChangeNotice({ event }: StateChangeNoticeProps) {
  const fromState = (event.payload.fromState as string) ?? "";
  const toState = (event.payload.toState as string) ?? (event.payload.state as string) ?? "";

  return (
    <div className="msg-state-change">
      <span className="state-pill">
        {fromState && <span className="state-from">{fromState}</span>}
        {fromState && " \u2192 "}
        <span className="state-to">{toState}</span>
      </span>
    </div>
  );
}
