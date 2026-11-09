import Link from "next/link";
import { Fragment, type ReactNode } from "react";

/**
 * The top of every portal page: breadcrumbs (ancestors only), the title with
 * an optional badge, a lead line, and the page's actions (right of the title
 * from 640px, below it on phones).
 */
export function PageHeader({
  title,
  crumbs,
  badge,
  lead,
  actions,
}: {
  title: ReactNode;
  crumbs?: { href: string; label: string }[];
  badge?: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 text-sm">
          <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.href}>
                {index > 0 && <li aria-hidden="true">/</li>}
                <li className="min-w-0 max-w-full">
                  <Link
                    href={crumb.href}
                    className="block truncate font-medium text-ink underline-offset-4 hover:underline"
                  >
                    {crumb.label}
                  </Link>
                </li>
              </Fragment>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-display-page break-words">{title}</h1>
            {badge}
          </div>
          {lead && <p className="mt-2 max-w-2xl text-lg">{lead}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
