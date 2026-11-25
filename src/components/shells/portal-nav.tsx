"use client";

import {
  CircleHelp,
  ClipboardList,
  BadgeCheck,
  Banknote,
  EyeOff,
  Gavel,
  Flag,
  House,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  ReceiptText,
  Scale,
  ScanFace,
  ShieldAlert,
  SquareKanban,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Search,
  ChevronsUpDown,
  ShieldCheck,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isItemActive,
  isNavActive,
  navGroups,
  sectionLabel,
  type NavIcon,
  type NavItem,
  type PortalViewer,
} from "@/lib/portal";
import { CONTACT_EMAIL } from "@/lib/site";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  campaigns: Megaphone,
  creators: Search,
  applications: ClipboardList,
  board: SquareKanban,
  profile: UserRound,
  inbox: Inbox,
  wallet: Wallet,
  admin: ShieldCheck,
  overview: LayoutDashboard,
  standing: ShieldAlert,
  verification: BadgeCheck,
  identity: ScanFace,
  reports: Flag,
  hidden: EyeOff,
  escrow: LockKeyhole,
  disputes: Gavel,
  payouts: Banknote,
  ledger: ReceiptText,
  reconciliation: Scale,
};

type MainAction = { href: string; label: string } | null;

const ROLE_LABEL: Record<PortalViewer["role"], string> = {
  business: "Business",
  influencer: "Creator",
  admin: "Admin",
};

// What escrow means for the person reading it; admins don't need telling.
const ESCROW_NOTE: Record<
  PortalViewer["role"],
  { title: string; body: string } | null
> = {
  business: {
    title: "Protected by escrow",
    body: "Your payment is held by Pitchype until the job is done.",
  },
  influencer: {
    title: "Paid through escrow",
    body: "The business pays before you start. Pitchype holds the money until the job is done.",
  },
  admin: null,
};

/** The sidebar's quiet reassurance card: a tinted fill, ink text. */
function EscrowNote({ role }: { role: PortalViewer["role"] }) {
  const note = ESCROW_NOTE[role];
  if (!note) return null;
  return (
    <div className="mb-3 rounded-card bg-linear-to-br from-brand-lilac/55 to-brand-sky/55 p-3 text-[0.8125rem] leading-snug text-ink">
      <p className="flex items-center gap-1.5 font-semibold">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {note.title}
      </p>
      <p className="mt-1">{note.body}</p>
    </div>
  );
}
type SignOut = () => Promise<void>;

function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      {navGroups(items).map(({ group, items: links }) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">
            {group}
          </p>
          <ul className="space-y-0.5">
            {links.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isItemActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // 44px on touch screens, tighter beside a mouse.
                      "group flex min-h-11 items-center gap-2.5 rounded-[0.625rem] px-3 text-sm motion-safe:transition-[background-color,color,box-shadow] lg:min-h-[2.375rem]",
                      active
                        ? "panel font-semibold text-ink"
                        : "font-medium text-body hover:bg-ink/[0.04] hover:text-ink",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[1.125rem] shrink-0",
                        active
                          ? "text-brand-violet"
                          : "text-muted group-hover:text-ink",
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                    {item.badge ? (
                      <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[0.6875rem] font-semibold text-white">
                        {item.badge}
                        <span className="sr-only">
                          {` ${item.badgeLabel ?? "unread"}`}
                        </span>
                      </span>
                    ) : null}
                    <PendingDot />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * A small violet dot on a nav link while its page is on the way (only when
 * the page wasn't prefetched; otherwise the page's skeleton shows at once).
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto size-1.5 rounded-full bg-brand-violet motion-safe:transition-opacity",
        pending ? "opacity-100 motion-safe:animate-pulse" : "opacity-0",
      )}
    />
  );
}

function AccountBlock({
  viewer,
  signOutAction,
  onNavigate,
}: {
  viewer: PortalViewer;
  signOutAction: SignOut;
  onNavigate?: () => void;
}) {
  return (
    <div className="rounded-card p-1.5 panel">
      <Link
        href="/account"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-[0.625rem] px-2 py-1.5 hover:bg-surface-soft"
      >
        <CreatorPhoto
          name={viewer.name}
          url={viewer.photoUrl}
          sizes="32px"
          className="size-8 shrink-0 rounded-full"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">
            {viewer.name}
          </span>
          <span className="block text-xs text-muted">
            {ROLE_LABEL[viewer.role]} account
          </span>
        </span>
      </Link>
      <form
        action={signOutAction}
        className="mt-1 border-t border-hairline pt-1"
      >
        <button
          type="submit"
          className="flex min-h-11 w-full items-center gap-3 rounded-[0.625rem] px-3 text-sm font-medium text-body hover:bg-surface-soft hover:text-ink"
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </form>
    </div>
  );
}

/**
 * The account menu in the desktop sidebar: the person's name opens a small
 * menu with their account and sign-out. The phone drawer keeps the flat
 * AccountBlock, because a portal menu inside its modal dialog would sit
 * behind the dialog's inert layer.
 */
function AccountMenu({
  viewer,
  signOutAction,
}: {
  viewer: PortalViewer;
  signOutAction: SignOut;
}) {
  const pathname = usePathname();
  // The account pages have no link of their own in the nav, so this is how
  // the sidebar shows where you are.
  const onAccount = isNavActive(pathname, "/account");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-current={onAccount ? "page" : undefined}
        className={cn(
          "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-card p-2 text-left panel outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-ink data-[state=open]:bg-surface-soft",
          onAccount && "ring-1 ring-brand-violet",
        )}
      >
        <CreatorPhoto
          name={viewer.name}
          url={viewer.photoUrl}
          sizes="32px"
          className="size-8 shrink-0 rounded-full"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {viewer.name}
          </span>
          <span className="block text-xs text-muted">
            {ROLE_LABEL[viewer.role]}
          </span>
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width)"
      >
        <DropdownMenuLabel>{viewer.name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound aria-hidden="true" />
            Account settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          {/* Radix closes (and unmounts) the menu on select, which removes
              this form before the browser submits it. Keep it open; the
              redirect after signing out replaces the page. */}
          <DropdownMenuItem
            asChild
            onSelect={(event) => event.preventDefault()}
          >
            <button type="submit" className="w-full">
              <LogOut aria-hidden="true" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The sidebar's links and account menu (desktop). */
export function SidebarNav({
  viewer,
  items,
  signOutAction,
}: {
  viewer: PortalViewer;
  items: NavItem[];
  signOutAction: SignOut;
}) {
  return (
    <div className="flex flex-1 flex-col px-3 pb-4">
      <nav aria-label="Main" className="flex-1 pt-2">
        <NavLinks items={items} />
      </nav>
      <EscrowNote role={viewer.role} />
      <AccountMenu viewer={viewer} signOutAction={signOutAction} />
      {/* Secondary links, in a lighter style than the navigation above. */}
      <nav
        aria-label="Help and legal"
        className="mt-3 flex flex-wrap border-t border-hairline pt-1 text-xs text-muted"
      >
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex min-h-11 items-center px-2 hover:text-ink"
        >
          Help
        </a>
        <Link
          href="/terms"
          className="inline-flex min-h-11 items-center px-2 hover:text-ink"
        >
          Terms
        </Link>
        <Link
          href="/privacy"
          className="inline-flex min-h-11 items-center px-2 hover:text-ink"
        >
          Privacy
        </Link>
      </nav>
    </div>
  );
}

function MainActionLink({
  action,
  onNavigate,
  size,
  className,
}: {
  action: NonNullable<MainAction>;
  onNavigate?: () => void;
  size?: "sm";
  className?: string;
}) {
  const Icon = action.href.endsWith("/new") ? Plus : Search;
  return (
    <Link
      href={action.href}
      onClick={onNavigate}
      className={buttonVariants({ size, className })}
    >
      <Icon aria-hidden="true" />
      {action.label}
    </Link>
  );
}

/**
 * The top bar's role-dependent part: the section name (desktop), the main
 * action and Help, and the menu button that opens the drawer (phones).
 */
export function TopBarContent({
  viewer,
  items,
  mainAction,
  signOutAction,
  wallet,
  bell,
}: {
  viewer: PortalViewer;
  items: NavItem[];
  mainAction: MainAction;
  signOutAction: SignOut;
  /** The creator's balance, linking to their wallet (creators only). */
  wallet?: ReactNode;
  /** The notifications bell (businesses and creators). */
  bell?: ReactNode;
}) {
  const pathname = usePathname();
  const section = sectionLabel(viewer.role, pathname);
  // The home page's hero already carries the one primary action, so the top
  // bar doesn't repeat it there.
  const action = pathname === "/home" ? null : mainAction;

  return (
    <>
      {section && (
        <p className="hidden truncate text-sm font-semibold text-ink lg:block">
          {section}
        </p>
      )}
      <div className="ml-auto flex items-center gap-2">
        {action && (
          <MainActionLink action={action} size="sm" className="max-sm:hidden" />
        )}
        {wallet}
        {bell}
        <MobileNav
          viewer={viewer}
          items={items}
          mainAction={action}
          signOutAction={signOutAction}
        />
      </div>
    </>
  );
}

/**
 * The phone and tablet menu: a native modal dialog, which brings focus
 * trapping, Escape to close, an inert page behind it and focus returning to
 * the button. It also closes on navigation, on a tap outside it, and when
 * the window grows wide enough for the sidebar.
 */
function MobileNav({
  viewer,
  items,
  mainAction,
  signOutAction,
}: {
  viewer: PortalViewer;
  items: NavItem[];
  mainAction: MainAction;
  signOutAction: SignOut;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (wide.matches) dialogRef.current?.close();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
        className={buttonVariants({ variant: "ghost", size: "icon" })}
      >
        <Menu aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Menu"
        // A click on the dialog element itself is a click on the backdrop:
        // the panel inside fills the whole dialog.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none rounded-r-frame bg-canvas p-0 text-body shadow-pop backdrop:bg-ink/30 backdrop:backdrop-blur-sm open:motion-safe:animate-[drawer-in_0.35s_var(--ease-out-expo)]"
      >
        <div className="flex h-full flex-col px-3 pb-4">
          <div className="flex h-14 shrink-0 items-center justify-between pl-2">
            <Wordmark />
            <button
              type="button"
              aria-label="Close menu"
              onClick={close}
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <X aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Main" className="mt-2 flex-1 overflow-y-auto">
            <NavLinks items={items} onNavigate={close} />
            {mainAction && (
              <MainActionLink
                action={mainAction}
                onNavigate={close}
                className="mt-4 w-full"
              />
            )}
          </nav>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mb-2 flex min-h-11 items-center gap-2.5 rounded-[0.625rem] px-3 text-sm font-medium text-body hover:bg-ink/[0.04] hover:text-ink"
          >
            <CircleHelp
              className="size-[1.125rem] shrink-0 text-muted"
              aria-hidden="true"
            />
            Help: email us
          </a>
          <AccountBlock
            viewer={viewer}
            signOutAction={signOutAction}
            onNavigate={close}
          />
        </div>
      </dialog>
    </div>
  );
}
