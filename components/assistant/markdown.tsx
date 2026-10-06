import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  h1: ({ children }) => <h3 className="mt-2 text-base font-semibold text-foreground text-balance">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-2 text-base font-semibold text-foreground text-balance">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-1 text-sm font-semibold text-foreground text-balance">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-1 text-sm font-semibold text-foreground">{children}</h4>,
  p: ({ children }) => <p className="leading-relaxed text-pretty">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="text-foreground">{children}</em>,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-mono marker:text-xs marker:text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1 leading-relaxed [&>ol]:mt-1.5 [&>p]:inline [&>ul]:mt-1.5">{children}</li>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-2 rounded-md bg-surface-2 px-4 py-3 text-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="border-border" />,
  code: ({ children, className }) =>
    className ? (
      <code className={`${className} font-mono text-xs`}>{children}</code>
    ) : (
      <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-max border-collapse text-left text-sm tabular-nums">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border text-xs text-muted-foreground">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium first:pl-0">{children}</th>,
  td: ({ children }) => <td className="border-b border-border/60 px-3 py-2 align-top first:pl-0">{children}</td>,
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm text-foreground/90">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
