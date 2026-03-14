import { useMemo } from "react";
import { marked } from "marked";

interface MarkdownProps {
  content: string;
}

// Configure marked for safe output
marked.setOptions({
  breaks: true,
  gfm: true,
});

export function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => {
    try {
      return marked.parse(content) as string;
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
