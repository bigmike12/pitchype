import assert from "node:assert/strict";
import { test } from "node:test";

import {
  greeting,
  isNavActive,
  mainActionFor,
  navFor,
  sectionLabel,
} from "./portal.ts";

test("each role gets its own links", () => {
  assert.deepEqual(
    navFor("business").map((i) => [i.href, i.label]),
    [
      ["/home", "Home"],
      ["/business/campaigns", "Campaigns"],
      ["/business/creators", "Find creators"],
      ["/inbox", "Inbox"],
    ],
  );
  assert.deepEqual(
    navFor("influencer").map((i) => [i.href, i.label]),
    [
      ["/home", "Home"],
      ["/campaigns", "Campaigns"],
      ["/applications", "Applications"],
      ["/profile", "Your profile"],
      ["/inbox", "Inbox"],
    ],
  );
  assert.deepEqual(
    navFor("admin").map((i) => [i.href, i.label]),
    [["/admin", "Admin"]],
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
  assert.equal(isNavActive("/business/creators", "/business/campaigns"), false);
  assert.equal(isNavActive("/account", "/home"), false);
});

test("the top bar names the section", () => {
  assert.equal(
    sectionLabel("business", "/business/campaigns/9f1c"),
    "Campaigns",
  );
  assert.equal(sectionLabel("influencer", "/account"), "Account");
  assert.equal(sectionLabel("influencer", "/somewhere-else"), null);
});

test("greets by first name", () => {
  assert.equal(greeting("Ada Okafor"), "Hi Ada");
  assert.equal(greeting("  Tolu  "), "Hi Tolu");
  assert.equal(greeting(""), "Hi there");
});

test("a thread keeps Inbox active", () => {
  assert.equal(isNavActive("/inbox/9f1c", "/inbox"), true);
  assert.equal(sectionLabel("influencer", "/applications"), "Applications");
});
