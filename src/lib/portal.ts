// The signed-in portal's navigation: which links each role gets, which one is
// active, and the top bar's main action. No framework imports, so it can be
// unit-tested; the shell maps `icon` to a Lucide icon.

export type PortalRole = "business" | "influencer" | "admin";

export type NavIcon = "home" | "campaigns" | "creators" | "profile" | "admin";

export type NavItem = { href: string; label: string; icon: NavIcon };

/** Who the shell is drawn for. */
export type PortalViewer = {
  role: PortalRole;
  /** Business name, creator display name, "Admin", or the email's first part before onboarding. */
  name: string;
  email: string;
  photoUrl: string | null;
  /** Signed up but no profile yet: every portal page sends them to onboarding. */
  needsOnboarding: boolean;
};

const NAV: Record<PortalRole, NavItem[]> = {
  business: [
    { href: "/home", label: "Home", icon: "home" },
    { href: "/business/campaigns", label: "Campaigns", icon: "campaigns" },
    { href: "/business/creators", label: "Find creators", icon: "creators" },
  ],
  influencer: [
    { href: "/home", label: "Home", icon: "home" },
    { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
    { href: "/profile", label: "Your profile", icon: "profile" },
  ],
  admin: [{ href: "/admin", label: "Admin", icon: "admin" }],
};

const MAIN_ACTION: Record<PortalRole, { href: string; label: string } | null> =
  {
    business: { href: "/business/campaigns/new", label: "New campaign" },
    influencer: { href: "/campaigns", label: "Find campaigns" },
    admin: null,
  };

export function navFor(role: PortalRole): NavItem[] {
  return NAV[role];
}

export function mainActionFor(
  role: PortalRole,
): { href: string; label: string } | null {
  return MAIN_ACTION[role];
}

/** Active on its own path and everything under it; Home only on /home. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The section name shown in the top bar. */
export function sectionLabel(
  role: PortalRole,
  pathname: string,
): string | null {
  const active = navFor(role).find((item) => isNavActive(pathname, item.href));
  if (active) return active.label;
  if (pathname === "/account") return "Account";
  return null;
}

export function greeting(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hi ${first}` : "Hi there";
}
