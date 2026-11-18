// What the /r/[code] redirect does with one hit: check the code, classify the
// visitor, record the hit, and decide where to send them. The database and
// the secret come in as `deps`, so this can be unit-tested. The visitor always
// lands on the business's page when the link exists, even if recording fails:
// a lost click is better than a broken post.

import {
  classifyClient,
  clickSource,
  destinationWithTags,
  hashUserAgent,
  hashVisitor,
  LINK_CODE,
  referrerHost,
  type ClickSource,
  type ClientClass,
} from "../../../lib/clicks.ts";

export type LinkTarget = {
  destination: string;
  utmTags: boolean;
  campaignId: string;
};

export type RecordInput = {
  code: string;
  visitorHash: string;
  uaHash: string | null;
  referrerHost: string | null;
  source: ClickSource;
  clientClass: ClientClass;
};

export type LinkHitDeps = {
  /** CLICK_HASH_SECRET; without it nothing is recorded. */
  secret: string | undefined;
  /** Records the hit; null for an unknown code. */
  record: (input: RecordInput) => Promise<LinkTarget | null>;
  /** Reads the link's destination without recording anything. */
  lookup: (code: string) => Promise<LinkTarget | null>;
  log: (line: string) => void;
};

export type LinkHitResult = { status: 302; location: string } | { status: 404 };

export async function handleLinkHit(
  req: { code: string; method: string; ip: string; headers: Headers },
  deps: LinkHitDeps,
): Promise<LinkHitResult> {
  if (!LINK_CODE.test(req.code)) return { status: 404 };

  const userAgent = req.headers.get("user-agent");
  const referrer = req.headers.get("referer");

  let target: LinkTarget | null = null;
  let recorded = false;
  if (deps.secret) {
    try {
      target = await deps.record({
        code: req.code,
        visitorHash: hashVisitor(deps.secret, req.ip, userAgent ?? ""),
        uaHash: userAgent ? hashUserAgent(deps.secret, userAgent) : null,
        referrerHost: referrerHost(referrer),
        source: clickSource(referrer, userAgent),
        clientClass: classifyClient(req.method, userAgent, {
          purpose: req.headers.get("purpose"),
          secPurpose: req.headers.get("sec-purpose"),
        }),
      });
      recorded = true;
    } catch {
      deps.log(`tracked link ${req.code}: recording the click failed`);
    }
  } else {
    deps.log(
      `tracked link ${req.code}: CLICK_HASH_SECRET is not set; click not recorded`,
    );
  }

  if (!recorded) {
    try {
      target = await deps.lookup(req.code);
    } catch {
      return { status: 404 };
    }
  }
  if (!target) return { status: 404 };

  try {
    return {
      status: 302,
      location: destinationWithTags(target.destination, {
        utmTags: target.utmTags,
        campaignId: target.campaignId,
        code: req.code,
      }),
    };
  } catch {
    deps.log(
      `tracked link ${req.code}: the stored destination isn't a valid URL`,
    );
    return { status: 404 };
  }
}
