// The signed-in portal's navigation: which links each role gets, which one is
// active, and the top bar's main action. No framework imports, so it can be
// unit-tested; the shell maps `icon` to a Lucide icon.

export type PortalRole = "business" | "influencer" | "admin";

export type NavIcon =
  | "home"
  | "campaigns"
  | "creators"
  | "applications"
  | "board"
  | "profile"
  | "inbox"
  | "wallet"
  | "admin"
  | "overview"
  | "standing"
  | "verification"
  | "identity"
  | "reports"
  | "hidden"
  | "escrow"
  | "disputes"
  | "payouts"
  | "ledger"
  | "reconciliation";

/** What waits on an admin, one count per admin link that shows one. */
export type AdminAttention = {
  standing: number;
  campaigns: number;
  verification: number;
  identity: number;
  reports: number;
  disputes: number;
  payouts: number;
};

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  /** The caption the link sits under in the sidebar. */
  group: string;
  /** A count shown on the link, e.g. unread messages. */
  badge?: number;
  /** The word the count is read out as after the number (default "unread"). */
  badgeLabel?: string;
  /** For admin links: which count from the viewer's attention the badge shows. */
  attention?: keyof AdminAttention;
  /**
   * Other paths that belong under this link when they don't sit under its
   * own path, e.g. a hire's page under "Your work".
   */
  under?: string[];
};

/** Who the shell is drawn for. */
export type PortalViewer = {
  role: PortalRole;
  /** Business name, creator display name, "Admin", or the email's first part before onboarding. */
  name: string;
  email: string;
  photoUrl: string | null;
  /** Signed up but no profile yet: every portal page sends them to onboarding. */
  needsOnboarding: boolean;
  /** Unread chat messages, for the Inbox link. */
  unread: number;
  /** What waits on an admin, for the admin's links (null for everyone else). */
  attention: AdminAttention | null;
};

const NAV: Record<PortalRole, NavItem[]> = {
  business: [
    { href: "/home", label: "Home", icon: "home", group: "Hiring" },
    {
      href: "/business/board",
      label: "Hiring board",
      icon: "board",
      group: "Hiring",
      under: ["/business/engagements"],
    },
    {
      href: "/business/campaigns",
      label: "Campaigns",
      icon: "campaigns",
      group: "Hiring",
    },
    {
      href: "/business/creators",
      label: "Find creators",
      icon: "creators",
      group: "Hiring",
    },
    { href: "/inbox", label: "Inbox", icon: "inbox", group: "Hiring" },
    {
      href: "/business/wallet",
      label: "Wallet",
      icon: "wallet",
      group: "Money",
    },
  ],
  influencer: [
    { href: "/home", label: "Home", icon: "home", group: "Work" },
    {
      href: "/campaigns",
      label: "Campaigns",
      icon: "campaigns",
      group: "Work",
    },
    {
      href: "/applications",
      label: "Your work",
      icon: "board",
      group: "Work",
      under: ["/jobs"],
    },
    { href: "/inbox", label: "Inbox", icon: "inbox", group: "Work" },
    { href: "/wallet", label: "Wallet", icon: "wallet", group: "Money" },
    { href: "/profile", label: "Your profile", icon: "profile", group: "You" },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: "overview", group: "Review" },
    {
      href: "/admin/standing",
      label: "Account standing",
      icon: "standing",
      group: "Review",
      attention: "standing",
      badgeLabel: "appeals waiting",
    },
    {
      href: "/admin/campaigns",
      label: "Campaigns",
      icon: "campaigns",
      group: "Review",
      attention: "campaigns",
      badgeLabel: "waiting for review",
    },
    {
      href: "/admin/verification",
      label: "Verification",
      icon: "verification",
      group: "Review",
      attention: "verification",
      badgeLabel: "to verify",
    },
    {
      href: "/admin/identity",
      label: "Identity",
      icon: "identity",
      group: "Review",
      attention: "identity",
      badgeLabel: "to review",
    },
    {
      href: "/admin/reports",
      label: "Reports",
      icon: "reports",
      group: "Review",
      attention: "reports",
      badgeLabel: "open",
    },
    {
      href: "/admin/hidden",
      label: "Hidden profiles",
      icon: "hidden",
      group: "Review",
    },
    { href: "/admin/money", label: "Money", icon: "wallet", group: "Money" },
    {
      href: "/admin/money/escrow",
      label: "Escrow",
      icon: "escrow",
      group: "Money",
      under: ["/admin/money/engagements"],
    },
    {
      href: "/admin/disputes",
      label: "Disputes",
      icon: "disputes",
      group: "Money",
      attention: "disputes",
      badgeLabel: "open",
    },
    {
      href: "/admin/money/payouts",
      label: "Payouts",
      icon: "payouts",
      group: "Money",
      attention: "payouts",
      badgeLabel: "to approve",
    },
    {
      href: "/admin/money/ledger",
      label: "Ledger",
      icon: "ledger",
      group: "Money",
    },
    {
      href: "/admin/money/reconciliation",
      label: "Reconciliation",
      icon: "reconciliation",
      group: "Money",
    },
  ],
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

/** The links under their captions, in order, for the sidebar. */
export function navGroups(
  items: readonly NavItem[],
): { group: string; items: NavItem[] }[] {
  const groups: { group: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

export function mainActionFor(
  role: PortalRole,
): { href: string; label: string } | null {
  return MAIN_ACTION[role];
}

// Front pages whose own sub-pages have links of their own.
const EXACT = ["/home", "/admin", "/admin/money"];

/**
 * Active on its own path and everything under it; Home and the two admin
 * front pages only on their own path (their sub-pages have their own links).
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (EXACT.includes(href)) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether a sidebar link is the current page's: its own path, or one of its `under` paths. */
export function isItemActive(pathname: string, item: NavItem): boolean {
  return [item.href, ...(item.under ?? [])].some((href) =>
    isNavActive(pathname, href),
  );
}

/** The section name shown in the top bar. */
export function sectionLabel(
  role: PortalRole,
  pathname: string,
): string | null {
  const active = navFor(role).find((item) => isItemActive(pathname, item));
  if (active) return active.label;
  // Any other admin money page (the payout check, the ledger export).
  if (role === "admin" && pathname.startsWith("/admin/money/")) return "Money";
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return "Account";
  }
  return null;
}

export function greeting(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first ? `Hi ${first}` : "Hi there";
}
