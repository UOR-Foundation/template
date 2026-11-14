// FR-03: the weight gate's split and budgets, without a browser. The browser
// half (bootstrap/weight.mjs site) runs in pages.yml over the assembled site.
import test from "node:test";
import assert from "node:assert/strict";
import { BUDGET, frameOwned, weigh, judge } from "./weight.mjs";

const lock = { files: [{ path: "site/app.mjs" }, { path: "site/guest-worker.mjs" }, { path: "lighthouserc.json" }] };
const site = "http://127.0.0.1:4000/";
const frameHost = "https://uor-foundation.github.io/template/frame/";
const owned = frameOwned(lock);
const visit = [
  { url: site, bytes: 14000 },
  { url: `${site}app.mjs`, bytes: 5000 },
  { url: `${site}guest-worker.mjs`, bytes: 200 },
  { url: `${site}fonts/Geist-Regular.woff2`, bytes: 10000 },
  { url: `${site}worker-runtime/index.mjs`, bytes: 2600 },
  { url: `${frameHost}current.json`, bytes: 1000 },
  { url: `${frameHost}abc/prism-frame.mjs`, bytes: 20000 },
  { url: `${site}app.holo`, bytes: 40000 },
  { url: `${site}card.mjs`, bytes: 16000 },
  { url: `blob:${site}x`, bytes: 62000 },
];

test("the frame's bytes are the template's: its host, frame-locked site files, fonts and worker runtime", () => {
  const sum = weigh(visit, { site, owned, frameHost });
  assert.equal(sum.frame, 5000 + 200 + 10000 + 2600 + 1000 + 20000);
  assert.equal(sum.app, 14000 + 40000 + 16000);
});

test("a blob or data URL is the page's own bytes again and is not counted", () => {
  assert.equal(weigh(visit, { site, owned, frameHost }).requests, visit.length - 1);
});

test("a file outside the lock is the app's, even beside the frame's", () => {
  const sum = weigh([{ url: `${site}spec-extra.mjs`, bytes: 9 }], { site, owned, frameHost });
  assert.deepEqual([sum.frame, sum.app], [0, 9]);
});

test("each budget fails on its own and names its part", () => {
  assert.deepEqual(judge({ frame: BUDGET.frame, app: BUDGET.app, requests: BUDGET.requests }), []);
  assert.match(judge({ frame: BUDGET.frame + 1, app: 0, requests: 0 })[0], /the frame's bytes/);
  assert.match(judge({ frame: 0, app: BUDGET.app + 1, requests: 0 })[0], /the app's bytes/);
  assert.match(judge({ frame: 0, app: 0, requests: BUDGET.requests + 1 })[0], /requests/);
});

test("an app's bytes cannot spend the frame's budget, nor the frame's the app's", () => {
  const heavy = weigh([{ url: `${site}app.holo`, bytes: BUDGET.app + 1 }], { site, owned, frameHost });
  assert.deepEqual(judge(heavy).map((f) => f.split(" ")[1]), ["app's"]);
});
