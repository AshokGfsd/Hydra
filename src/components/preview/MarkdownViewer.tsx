'use client';

import { useEffect, useRef, useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  inline?: boolean;
}

export default function MarkdownViewer({ content, className = '', inline = false }: MarkdownViewerProps) {
  const ref = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';
    try {
      return inline ? (marked.parseInline(content) as string) : (marked.parse(content) as string);
    } catch {
      return content;
    }
  }, [content, inline]);

  useEffect(() => {
    if (!ref.current) return;
    try {
      (window as any).Prism?.highlightAllUnder?.(ref.current);
    } catch {}
  }, [html]);

  return (
    <div
      ref={ref}
      className={`md-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
