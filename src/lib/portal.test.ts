import assert from "node:assert/strict";
import { test } from "node:test";

import {
  greeting,
  isNavActive,
  mainActionFor,
  navFor,
  navGroups,
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
    ],
  );
  assert.deepEqual(
    navFor("admin").map((i) => [i.href, i.label]),
    [
      ["/admin", "Overview"],
      ["/admin/standing", "Account standing"],
      ["/admin/campaigns", "Campaigns"],
      ["/admin/verification", "Verification"],
      ["/admin/reports", "Reports"],
      ["/admin/hidden", "Hidden profiles"],
      ["/admin/money", "Money"],
      ["/admin/money/escrow", "Escrow"],
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
  assert.equal(sectionLabel("admin", "/admin/money/engagements/9f1c"), "Money");
  assert.equal(sectionLabel("influencer", "/account"), "Account");
  assert.equal(sectionLabel("influencer", "/account/standing"), "Account");
  assert.equal(
    sectionLabel("business", "/business/engagements/9f1c/pay"),
    "Hiring board",
  );
  assert.equal(sectionLabel("influencer", "/jobs/9f1c"), "Your work");
  assert.equal(sectionLabel("influencer", "/somewhere-else"), null);
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
    ],
  );
  assert.deepEqual(
    navGroups(navFor("business")).map((g) => [g.group, g.items.length]),
    [
      ["Hiring", 5],
      ["Money", 1],
    ],
  );
  assert.deepEqual(navGroups([]), []);
});
