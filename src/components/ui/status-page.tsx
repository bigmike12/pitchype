import type { ReactNode } from "react";

/**
 * A whole page that says one thing: this page isn't here (404) or something
 * broke (500). `code` is the large decorative number; the heading carries the
 * meaning. `reference` is the error's digest, which support can match to the
 * server log. Nothing about the error itself is shown.
 *
 * On the public site it is the page (a `main` on the hero's aurora); with
 * `inPortal` it sits inside the portal's own `main`, without the backdrop.
 */
export function StatusPage({
  code,
  title,
  children,
  actions,
  reference,
  inPortal = false,
}: {
  code: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  reference?: string;
  inPortal?: boolean;
}) {
  const content = (
    <div className="enter">
      <p
        aria-hidden="true"
        className="font-display text-[clamp(5.5rem,22vw,12rem)] leading-[0.9] font-semibold tracking-[-0.06em] text-gradient"
      >
        {code}
      </p>
      <h1 className="mt-4 max-w-[20ch] text-display-lg">{title}</h1>
      <div className="mt-4 max-w-xl text-lg">{children}</div>
      {actions && (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">{actions}</div>
      )}
      {reference && (
        <p className="mt-8 text-sm text-muted">
          Reference: <span className="font-mono text-ink">{reference}</span>
        </p>
      )}
    </div>
  );

  if (inPortal) return <div className="py-6 sm:py-10">{content}</div>;

  return (
    <main id="main" className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 aurora [mask-image:linear-gradient(#000_30%,transparent_95%)] motion-safe:animate-aurora"
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 dot-grid" />
      <div className="container-page py-16 sm:py-24 lg:py-28">{content}</div>
    </main>
  );
}
