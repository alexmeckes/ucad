import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownProps {
  content: string;
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function Markdown({ content }: MarkdownProps) {
  const html = useMemo(() => {
    try {
      const raw = marked.parse(content) as string;
      return DOMPurify.sanitize(raw);
    } catch {
      return DOMPurify.sanitize(content);
    }
  }, [content]);

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
