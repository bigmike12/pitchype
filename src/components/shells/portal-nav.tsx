"use client";

import {
  CircleHelp,
  ClipboardList,
  House,
  Inbox,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { CreatorPhoto } from "@/components/creators/creator-photo";
import { buttonVariants } from "@/components/ui/button";
import {
  isNavActive,
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
  profile: UserRound,
  inbox: Inbox,
  admin: ShieldCheck,
};

type MainAction = { href: string; label: string } | null;
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
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isNavActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] text-ink motion-safe:transition-[background-color,box-shadow]",
                active
                  ? "bg-surface font-semibold shadow-card ring-1 ring-hairline"
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
              <PendingDot />
            </Link>
          </li>
        );
      })}
    </ul>
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
          <span className="block text-xs text-muted">Account</span>
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

/** The sidebar's links and account block (desktop). */
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
      <nav aria-label="Main" className="flex-1">
        <NavLinks items={items} />
      </nav>
      <AccountBlock viewer={viewer} signOutAction={signOutAction} />
    </div>
  );
}

function MainActionLink({
  action,
  onNavigate,
  className,
}: {
  action: NonNullable<MainAction>;
  onNavigate?: () => void;
  className?: string;
}) {
  const Icon = action.href.endsWith("/new") ? Plus : Search;
  return (
    <Link
      href={action.href}
      onClick={onNavigate}
      className={buttonVariants({ className })}
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
}: {
  viewer: PortalViewer;
  items: NavItem[];
  mainAction: MainAction;
  signOutAction: SignOut;
}) {
  const pathname = usePathname();
  const section = sectionLabel(viewer.role, pathname);

  return (
    <>
      {section && (
        <p className="hidden truncate font-medium text-ink lg:block">
          {section}
        </p>
      )}
      <div className="ml-auto flex items-center gap-2">
        {mainAction && (
          <MainActionLink action={mainAction} className="max-sm:hidden" />
        )}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          aria-label="Help: email us"
          title="Help: email us"
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <CircleHelp aria-hidden="true" />
        </a>
        <MobileNav
          viewer={viewer}
          items={items}
          mainAction={mainAction}
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
          <nav aria-label="Main" className="mt-2 flex-1">
            <NavLinks items={items} onNavigate={close} />
            {mainAction && (
              <MainActionLink
                action={mainAction}
                onNavigate={close}
                className="mt-4 w-full"
              />
            )}
          </nav>
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
