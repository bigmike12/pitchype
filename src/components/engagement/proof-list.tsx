// The links and screenshots attached to a round of work or a dispute
// statement. Links open in a new tab and carry no ranking weight (`nofollow`),
// because anyone can type any link; screenshots are signed URLs that stop
// working after ten minutes.

export function ProofLinks({ links }: { links: string[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="space-y-1">
      {links.map((link) => (
        <li key={link} className="min-w-0">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="link break-all"
          >
            {link}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ProofShots({
  files,
  label,
}: {
  files: { url: string }[];
  /** Starts each picture's alt text, e.g. "round 2" gives "Screenshot 1 of round 2". */
  label: string;
}) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file, index) => (
        <li key={file.url}>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="block overflow-hidden rounded-lg border border-hairline"
          >
            {/* A short-lived signed URL: next/image would cache and
                re-serve it past its expiry. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={file.url}
              alt={`Screenshot ${index + 1} of ${label}`}
              width={96}
              height={96}
              loading="lazy"
              className="size-24 object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
