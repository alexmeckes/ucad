import type { AdapterEvent } from "@ucad/contracts";

interface DiffBlockProps {
  event: AdapterEvent;
}

export function DiffBlock({ event }: DiffBlockProps) {
  const filePath = (event.payload.filePath as string) ?? (event.payload.path as string) ?? "";
  const diff = (event.payload.diff as string) ?? (event.payload.patch as string) ?? "";

  const lines = diff.split("\n");

  return (
    <div className="msg msg-diff">
      <div className="msg-header">
        <span className="msg-role msg-role-diff">diff</span>
        {filePath && <span className="msg-diff-path">{filePath}</span>}
      </div>
      <pre className="msg-diff-content">
        {lines.map((line, i) => {
          let cls = "diff-line";
          if (line.startsWith("+") && !line.startsWith("+++")) cls += " diff-add";
          else if (line.startsWith("-") && !line.startsWith("---")) cls += " diff-del";
          else if (line.startsWith("@@")) cls += " diff-hunk";
          return (
            <div key={i} className={cls}>
              {line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
