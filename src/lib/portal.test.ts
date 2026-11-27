import assert from "node:assert/strict";
import { test } from "node:test";

import {
  greeting,
  isNavActive,
  mainActionFor,
  navFor,
  navGroups,
  isItemActive,
  sectionLabel,
} from "./portal.ts";

test("each role gets its own links", () => {
  assert.deepEqual(
    navFor("business").map((i) => [i.href, i.label]),
    [
      ["/home", "Home"],
      ["/business/board", "Hiring board"],
      ["/business/campaigns", "Campaigns"],
      ["/business/creators", "Find creators"],
      ["/inbox", "Inbox"],
      ["/business/wallet", "Wallet"],
      ["/feedback", "Feedback"],
    ],
  );
  assert.deepEqual(
    navFor("influencer").map((i) => [i.href, i.label]),
    [
      ["/home", "Home"],
      ["/campaigns", "Campaigns"],
      ["/applications", "Your work"],
      ["/inbox", "Inbox"],
      ["/wallet", "Wallet"],
      ["/profile", "Your profile"],
      ["/feedback", "Feedback"],
    ],
  );
  assert.deepEqual(
    navFor("admin").map((i) => [i.href, i.label]),
    [
      ["/admin", "Overview"],
      ["/admin/standing", "Account standing"],
      ["/admin/campaigns", "Campaigns"],
      ["/admin/verification", "Verification"],
      ["/admin/identity", "Identity"],
      ["/admin/reports", "Reports"],
      ["/admin/hidden", "Hidden profiles"],
      ["/admin/money", "Money"],
      ["/admin/money/escrow", "Escrow"],
      ["/admin/disputes", "Disputes"],
      ["/admin/money/payouts", "Payouts"],
      ["/admin/money/ledger", "Ledger"],
      ["/admin/money/reconciliation", "Reconciliation"],
    ],
  );
});

test("main action per role", () => {
  assert.deepEqual(mainActionFor("business"), {
    href: "/business/campaigns/new",
    label: "New campaign",
  });
  assert.deepEqual(mainActionFor("influencer"), {
    href: "/campaigns",
    label: "Find campaigns",
  });
  assert.equal(mainActionFor("admin"), null);
});

test("a link is active on its path and below it; Home only on /home", () => {
  assert.equal(isNavActive("/home", "/home"), true);
  assert.equal(
    isNavActive("/business/campaigns/9f1c/edit", "/business/campaigns"),
    true,
  );
  assert.equal(isNavActive("/campaigns", "/campaigns"), true);
  assert.equal(isNavActive("/campaignsx", "/campaigns"), false);
  assert.equal(isNavActive("/wallet", "/wallet"), true);
  assert.equal(isNavActive("/wallet/history", "/wallet"), true);
  assert.equal(isNavActive("/walletx", "/wallet"), false);
  assert.equal(isNavActive("/business/creators", "/business/campaigns"), false);
  assert.equal(isNavActive("/account", "/home"), false);
});

test("Admin and Money are never active together", () => {
  assert.equal(isNavActive("/admin", "/admin"), true);
  assert.equal(isNavActive("/admin/money", "/admin"), false);
  assert.equal(isNavActive("/admin/money", "/admin/money"), true);
  assert.equal(isNavActive("/admin/money/payouts", "/admin/money"), false);
  assert.equal(
    isNavActive("/admin/money/payouts", "/admin/money/payouts"),
    true,
  );
  assert.equal(isNavActive("/admin/standing", "/admin"), false);
  assert.equal(isNavActive("/admin/money/payouts", "/admin"), false);
  assert.equal(isNavActive("/admin/moneyx", "/admin/money"), false);
});

test("the top bar names the section", () => {
  assert.equal(
    sectionLabel("business", "/business/campaigns/9f1c"),
    "Campaigns",
  );
  assert.equal(sectionLabel("admin", "/admin"), "Overview");
  assert.equal(sectionLabel("admin", "/admin/money/ledger"), "Ledger");
  assert.equal(
    sectionLabel("admin", "/admin/money/engagements/9f1c"),
    "Escrow",
  );
  assert.equal(sectionLabel("admin", "/admin/money/payouts/9f1c/x"), "Payouts");
  assert.equal(sectionLabel("influencer", "/account"), "Account");
  assert.equal(sectionLabel("influencer", "/account/standing"), "Account");
  assert.equal(
    sectionLabel("business", "/business/engagements/9f1c/pay"),
    "Hiring board",
  );
  assert.equal(sectionLabel("influencer", "/jobs/9f1c"), "Your work");
  assert.equal(sectionLabel("influencer", "/somewhere-else"), null);
});

test("Disputes is an admin link with its own section name", () => {
  assert.equal(isNavActive("/admin/disputes/9f1c", "/admin/disputes"), true);
  assert.equal(isNavActive("/admin/disputes", "/admin"), false);
  assert.equal(sectionLabel("admin", "/admin/disputes/9f1c"), "Disputes");
  assert.equal(
    navFor("admin").find((i) => i.href === "/admin/disputes")?.icon,
    "disputes",
  );
});

test("greets by first name", () => {
  assert.equal(greeting("Ada Okafor"), "Hi Ada");
  assert.equal(greeting("  Tolu  "), "Hi Tolu");
  assert.equal(greeting(""), "Hi there");
});

test("a thread keeps Inbox active", () => {
  assert.equal(isNavActive("/inbox/9f1c", "/inbox"), true);
  assert.equal(sectionLabel("influencer", "/applications"), "Your work");
});

test("Wallet is a business link, active on its own page", () => {
  assert.equal(isNavActive("/business/wallet", "/business/wallet"), true);
  assert.equal(isNavActive("/business/wallet/x", "/business/wallet"), true);
  assert.equal(isNavActive("/business/walletx", "/business/wallet"), false);
  assert.equal(sectionLabel("business", "/business/wallet"), "Wallet");
  assert.equal(
    navFor("business").find((i) => i.href === "/business/wallet")?.icon,
    "wallet",
  );
});

test("the sidebar groups links under captions, keeping their order", () => {
  assert.deepEqual(
    navGroups(navFor("influencer")).map((g) => [
      g.group,
      g.items.map((i) => i.label),
    ]),
    [
      ["Work", ["Home", "Campaigns", "Your work", "Inbox"]],
      ["Money", ["Wallet"]],
      ["You", ["Your profile"]],
      ["Help", ["Feedback"]],
    ],
  );
  assert.deepEqual(
    navGroups(navFor("business")).map((g) => [g.group, g.items.length]),
    [
      ["Hiring", 5],
      ["Money", 1],
      ["Help", 1],
    ],
  );
  assert.deepEqual(navGroups([]), []);
});

test("a hire's page lights up the sidebar link it belongs to", () => {
  const link = (role: "business" | "influencer" | "admin", href: string) =>
    navFor(role).find((item) => item.href === href)!;
  const board = link("business", "/business/board");
  const work = link("influencer", "/applications");
  const escrow = link("admin", "/admin/money/escrow");
  assert.equal(isItemActive("/business/engagements/9f1c/pay", board), true);
  assert.equal(isItemActive("/business/engagements/9f1c", board), true);
  assert.equal(isItemActive("/jobs/9f1c/dispute", work), true);
  assert.equal(isItemActive("/admin/money/engagements/9f1c", escrow), true);
  assert.equal(isItemActive("/business/engagementsx/9f1c", board), false);
});

test("the admin identity page is named in the top bar", () => {
  assert.equal(sectionLabel("admin", "/admin/identity"), "Identity");
  assert.equal(sectionLabel("business", "/admin/identity"), null);
});
