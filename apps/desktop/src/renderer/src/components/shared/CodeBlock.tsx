import { useEffect, useRef } from "react";
import hljs from "highlight.js";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = code;
      if (language) {
        try {
          const result = hljs.highlight(code, { language });
          ref.current.innerHTML = result.value;
        } catch {
          // fallback: leave as text
        }
      } else {
        try {
          const result = hljs.highlightAuto(code);
          ref.current.innerHTML = result.value;
        } catch {
          // fallback
        }
      }
    }
  }, [code, language]);

  return (
    <pre
      style={{
        margin: 0,
        padding: "10px 12px",
        background: "var(--surface)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        overflow: "auto",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <code ref={ref} style={{ fontFamily: "var(--font-mono)" }}>
        {code}
      </code>
    </pre>
  );
}
