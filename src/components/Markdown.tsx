// The content renderer: GFM markdown + KaTeX math ($…$ / $$…$$) + vault
// images. Fenced code blocks whose language matches a registered content
// renderer (TikZ, Mermaid… in later phases) are routed through the registry.

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { contentRenderers } from "../domain/registries";
import { normalizeImageSrc, vaultImageUrl } from "../lib/images";
import { useAsync } from "../lib/useAsync";

const FAILED = "__image-load-failed__";

function VaultImage({ src, alt }: { src?: string; alt?: string }) {
  const rel = src ? normalizeImageSrc(src) : null;
  const url = useAsync(
    () => (rel ? vaultImageUrl(rel).catch(() => FAILED) : Promise.resolve(null)),
    [rel],
  );
  const failed = url === FAILED;

  if (!src) return null;
  if (rel === null) {
    // External URL — render as-is.
    return <img src={src} alt={alt} className="max-w-full rounded-md" />;
  }
  if (failed) {
    return (
      <span className="inline-block rounded bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
        missing image: {rel}
      </span>
    );
  }
  return url ? (
    <img src={url} alt={alt} className="max-w-full rounded-md" />
  ) : (
    <span className="inline-block h-24 w-40 animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800" />
  );
}

function Code({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? "")?.[1];
  if (lang) {
    const renderer = contentRenderers.all().find((r) => r.languages.includes(lang));
    if (renderer) {
      return <renderer.Component code={String(children ?? "")} />;
    }
  }
  return (
    <code className={`${className ?? ""} rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-neutral-800`}>
      {children}
    </code>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-styles space-y-3 leading-relaxed [&_.katex-display]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: (props) => <VaultImage src={props.src as string} alt={props.alt} />,
          code: (props) => <Code className={props.className}>{props.children}</Code>,
          a: (props) => (
            <a {...props} target="_blank" rel="noreferrer" className="text-accent underline" />
          ),
          h1: (props) => <h1 className="text-xl font-semibold" {...props} />,
          h2: (props) => <h2 className="text-lg font-semibold" {...props} />,
          h3: (props) => <h3 className="font-semibold" {...props} />,
          ul: (props) => <ul className="list-disc pl-5" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="border-l-2 border-edge pl-3 text-neutral-600 dark:text-neutral-400"
              {...props}
            />
          ),
          table: (props) => <table className="border-collapse text-sm" {...props} />,
          th: (props) => (
            <th className="border border-edge px-2 py-1 text-left" {...props} />
          ),
          td: (props) => (
            <td className="border border-edge px-2 py-1" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
