import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Long-form article rendering. Typography is tuned for reading, not density —
 * generous line height, comfortable measure, and no horizontal scroll on mobile.
 */
export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="text-[17px] leading-[1.75] text-foreground/90 break-words [&>*+*]:mt-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="font-display text-2xl font-bold mt-10 mb-3 text-foreground" {...p} />,
          h2: (p) => <h2 className="font-display text-2xl font-bold mt-10 mb-3 text-foreground" {...p} />,
          h3: (p) => <h3 className="font-display text-lg font-bold mt-8 mb-2 text-foreground" {...p} />,
          p: (p) => <p {...p} />,
          ul: (p) => <ul className="list-disc pl-6 space-y-2" {...p} />,
          ol: (p) => <ol className="list-decimal pl-6 space-y-2" {...p} />,
          li: (p) => <li className="leading-[1.7]" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          blockquote: (p) => (
            <blockquote
              className="border-l-2 border-primary/50 pl-4 italic text-muted-foreground"
              {...p}
            />
          ),
          a: (p) => (
            <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />
          ),
          code: (p) => (
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]" {...p} />
          ),
          hr: () => <hr className="my-8 border-border" />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-border px-3 py-2 text-left font-semibold" {...p} />,
          td: (p) => <td className="border border-border px-3 py-2 align-top" {...p} />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
