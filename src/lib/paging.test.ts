import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pageOf,
  pageRange,
  pageWindow,
  pagedHref,
  parsePage,
} from "./paging.ts";

test("reads the page from the URL, falling back to 1", () => {
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage(["2", "9"]), 2);
  for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "99999999"]) {
    assert.equal(parsePage(bad), 1);
  }
});

test("slices a list into pages", () => {
  const all = Array.from({ length: 25 }, (_, i) => i + 1);
  const first = pageOf(all, 1, 10);
  assert.deepEqual(first.items, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(first.pages, 3);
  assert.equal(first.total, 25);
  assert.deepEqual(pageOf(all, 3, 10).items, [21, 22, 23, 24, 25]);
});

test("a page past the end shows the last page; an empty list has one page", () => {
  const paged = pageOf([1, 2, 3], 9, 2);
  assert.equal(paged.page, 2);
  assert.deepEqual(paged.items, [3]);
  const empty = pageOf([], 4, 10);
  assert.deepEqual([empty.page, empty.pages, empty.items.length], [1, 1, 0]);
});

test("the pager offers first, last and the current page's neighbours", () => {
  assert.deepEqual(pageWindow(1, 1), [1]);
  assert.deepEqual(pageWindow(2, 4), [1, 2, 3, 4]);
  assert.deepEqual(pageWindow(1, 10), [1, 2, "gap", 10]);
  assert.deepEqual(pageWindow(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
  // A single skipped number is shown, not replaced by a gap.
  assert.deepEqual(pageWindow(3, 10), [1, 2, 3, 4, "gap", 10]);
  assert.deepEqual(pageWindow(10, 10), [1, "gap", 9, 10]);
});

test("says which rows a page shows", () => {
  assert.deepEqual(pageRange({ page: 1, pageSize: 24, total: 222 }), {
    from: 1,
    to: 24,
  });
  assert.deepEqual(pageRange({ page: 10, pageSize: 24, total: 222 }), {
    from: 217,
    to: 222,
  });
  assert.deepEqual(pageRange({ page: 1, pageSize: 24, total: 0 }), {
    from: 0,
    to: 0,
  });
});

test("page links keep the filters and leave out page 1", () => {
  assert.equal(pagedHref("/campaigns", {}, 1), "/campaigns");
  assert.equal(
    pagedHref("/campaigns", { niche: "food", platform: undefined }, 3),
    "/campaigns?niche=food&page=3",
  );
});
