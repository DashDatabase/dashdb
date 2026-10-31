import { faqPageLd, type FaqItem } from '@/lib/json-ld';
import { JsonLd } from './json-ld';

/** Questions as native disclosure widgets (no JavaScript), plus FAQPage structured data. */
export function Faq({ items }: { items: readonly FaqItem[] }) {
  return (
    <>
      <div className="divide-y rounded-lg border">
        {items.map((item) => (
          <details
            key={item.question}
            className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              {item.question}
              <span
                aria-hidden="true"
                className="text-xl leading-none text-text-muted transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-text-muted">{item.answer}</p>
          </details>
        ))}
      </div>
      <JsonLd data={faqPageLd(items)} />
    </>
  );
}
