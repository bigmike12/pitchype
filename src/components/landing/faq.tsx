import { Plus } from "lucide-react";

import { HOME_FAQ, type FaqItem } from "@/lib/faq";
import { CONTACT_EMAIL } from "@/lib/site";

export type { FaqItem };

export function Faq({
  items = HOME_FAQ,
  title = "Questions, answered",
}: {
  items?: FaqItem[];
  title?: string;
}) {
  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="container-page grid gap-10 section-y lg:grid-cols-12"
    >
      <div className="lg:col-span-4">
        <h2 id="faq-title" className="text-display-lg reveal">
          {title}
        </h2>
        <p className="mt-4 text-lg">
          Something else on your mind? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>

      <div className="space-y-2 lg:col-span-8">
        {items.map(({ question, answer }) => (
          <details
            key={question}
            className="group rounded-card px-5 panel reveal open:shadow-lift sm:px-6"
          >
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-4 [&::-webkit-details-marker]:hidden">
              <h3 className="text-lg font-semibold">{question}</h3>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-soft group-open:bg-ink group-open:text-white motion-safe:transition-colors">
                <Plus
                  aria-hidden="true"
                  className="size-4 group-open:rotate-45 motion-safe:transition-transform"
                />
              </span>
            </summary>
            <p className="max-w-[42rem] pb-6 motion-safe:animate-[fade-up_0.5s_var(--ease-out-expo)]">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
