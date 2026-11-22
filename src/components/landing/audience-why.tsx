import { ComparisonTable, type ComparisonRow } from "./why-pitchype";

/** "The usual way against Pitchype" for one side of the marketplace. */
export function AudienceWhy({
  id,
  title,
  lead,
  rows,
}: {
  id: string;
  title: string;
  lead: string;
  rows: ComparisonRow[];
}) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="container-page section-y"
    >
      <div className="max-w-3xl">
        <h2 id={titleId} className="text-display-lg">
          {title}
        </h2>
        <p className="mt-4 max-w-[40rem] text-lg">{lead}</p>
      </div>
      <ComparisonTable rows={rows} />
    </section>
  );
}
