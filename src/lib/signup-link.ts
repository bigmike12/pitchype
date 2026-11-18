// Where the marketing site's audience pages live, and which sign-up link
// belongs to each. A visitor on one of these pages has already said which side
// they are on, so sign-up doesn't ask again.

export const BUSINESS_PAGE = "/for-business";
export const CREATOR_PAGE = "/for-creators";

// Whole path segments only (so "/for-businesses" doesn't count), the same rule
// as isUnder() in src/proxy.ts. Anything under a page counts, so a later
// "/for-business/ugc" keeps the role.
const isUnder = (path: string, page: string) =>
  path === page || path.startsWith(`${page}/`);

export function signupHrefFor(pathname: string): string {
  if (isUnder(pathname, BUSINESS_PAGE)) return "/signup?role=business";
  if (isUnder(pathname, CREATOR_PAGE)) return "/signup?role=influencer";
  return "/signup";
}
