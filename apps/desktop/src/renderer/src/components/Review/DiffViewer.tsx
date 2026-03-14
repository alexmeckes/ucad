interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff) {
    return <div className="diff-viewer-empty">No diff loaded</div>;
  }

  const lines = diff.split("\n");

  return (
    <pre className="diff-viewer">
      {lines.map((line, i) => {
        let cls = "dv-line";
        if (line.startsWith("+") && !line.startsWith("+++")) cls += " dv-add";
        else if (line.startsWith("-") && !line.startsWith("---")) cls += " dv-del";
        else if (line.startsWith("@@")) cls += " dv-hunk";
        else if (line.startsWith("diff ") || line.startsWith("index ")) cls += " dv-meta";
        return (
          <div key={i} className={cls}>
            {line}
          </div>
        );
      })}
    </pre>
  );
}
