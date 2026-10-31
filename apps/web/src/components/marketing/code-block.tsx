/** A titled, keyboard-scrollable code sample for server-rendered pages. */
export function CodeBlock({ title, code, label }: { title: string; code: string; label: string }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border bg-surface">
      <figcaption className="border-b px-4 py-2 text-xs font-medium text-text-muted">
        {title}
      </figcaption>
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto p-4 font-mono text-[13px] leading-6 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}
