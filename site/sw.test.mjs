// FR-02: the production service worker (site/sw.js), run in a VM context with
// a browser's Cache Storage and network stood in, as a returning browser meets
// a new deploy. sw.js is the same bytes in every deploy, so no new worker is
// ever installed: the worker that kept an earlier deploy must still serve this
// one from the navigation that brings its page.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const SCOPE = "https://example.org/app/";
const source = await readFile(new URL("./sw.js", import.meta.url), "utf8");

// One deploy: its files and the precache.json that names its version.
const deploy = (version, files) => ({
  version,
  files: { ...files, "precache.json": JSON.stringify({ version, files: Object.keys(files).filter((p) => p !== "index.html").map((p) => ({ path: `./${p}`, eager: p === "icon.svg" })) }) },
});

function browser({ kept, served }) {
  const stores = new Map();
  const url = (request) => new URL(typeof request === "string" ? request : request.url, SCOPE).href.replace(/\?.*$/, "");
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      async match(request) { const hit = entries.get(url(request)); return hit ? hit.clone() : undefined; },
      async put(request, response) { entries.set(url(request), response.clone()); },
      async addAll(requests) { for (const r of requests) entries.set(url(r), await net(r)); },
      async keys() { return [...entries.keys()]; },
    };
  };
  const caches = {
    async open(name) { return cacheOf(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const state = { online: true, manifests: 0, network: [] };
  async function net(request) {
    if (!state.online) throw new TypeError("offline");
    const path = new URL(url(request)).pathname.replace(/^\/app\//, "") || "index.html";
    state.network.push(path);
    if (path === "precache.json") state.manifests += 1;
    const body = served().files[path === "" ? "index.html" : path];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body, { status: 200 });
  }
  // The browser kept an earlier deploy: its worker's cache holds that deploy's files.
  if (kept) {
    const cache = cacheOf(`prism-${kept.version}`);
    for (const [path, body] of Object.entries(kept.files)) stores.get(`prism-${kept.version}`).set(new URL(path === "index.html" ? "./" : path, SCOPE).href, new Response(body));
    void cache;
  }
  const listeners = {};
  const self = { registration: { scope: SCOPE }, addEventListener: (type, fn) => { listeners[type] = fn; }, clients: { claim: async () => {} }, skipWaiting() {} };
  // A worker resolves a relative Request against its own location.
  const Relative = class extends Request { constructor(input, init) { super(typeof input === "string" ? new URL(input, SCOPE).href : input, init); } };
  const context = vm.createContext({ self, caches, fetch: net, Response, Request: Relative, URL, JSON, console, setTimeout });
  vm.runInContext(source, context, { filename: "sw.js" });
  const fire = async (type, event) => { const waits = []; listeners[type]({ ...event, waitUntil: (p) => waits.push(p) }); await Promise.all(waits); };
  const request = async (path, mode = "no-cors") => {
    let answer = null;
    listeners.fetch({ request: new Request(new URL(path, SCOPE).href, { mode: mode === "navigate" ? "same-origin" : mode }), respondWith: (p) => { answer = p; } });
    if (mode === "navigate") Object.defineProperty(answer, "navigate", { value: true });
    return answer ? (await answer).text() : null;
  };
  const navigate = async () => {
    let answer = null;
    const req = new Request(SCOPE);
    Object.defineProperty(req, "mode", { value: "navigate" });
    listeners.fetch({ request: req, respondWith: (p) => { answer = p; } });
    return (await answer).text();
  };
  return { stores, state, fire, request, navigate };
}

const A = deploy("aaaa", { "index.html": "<page A>", "app.mjs": "app A", "icon.svg": "icon A" });
const B = deploy("bbbb", { "index.html": "<page B>", "app.mjs": "app B", "icon.svg": "icon B" });

test("a returning browser that kept an earlier deploy loads this one from its first navigation (FR-02)", async () => {
  const b = browser({ kept: A, served: () => B });
  assert.equal(await b.navigate(), "<page B>");
  assert.equal(await b.request("./app.mjs"), "app B", "the page's module is this deploy's, not the kept one");
  assert.deepEqual([...b.stores.keys()], ["prism-bbbb"], "the earlier deploy's cache is dropped");
  assert.equal(await b.request("./icon.svg"), "icon B");
});

test("the same deploy is served from the cache and kept once (FR-02)", async () => {
  const b = browser({ kept: { version: A.version, files: { ...A.files, "precache.json": A.files["precache.json"] } }, served: () => A });
  await b.navigate();
  const before = b.state.network.length;
  assert.equal(await b.request("./app.mjs"), "app A");
  assert.equal(b.state.network.length, before, "a kept file is not fetched again");
  assert.deepEqual([...b.stores.keys()], ["prism-aaaa"]);
});

test("offline, the kept deploy answers the navigation and stays (FR-02)", async () => {
  const b = browser({ kept: A, served: () => B });
  b.state.online = false;
  assert.equal(await b.navigate(), "<page A>");
  assert.equal(await b.request("./app.mjs"), "app A");
  assert.deepEqual([...b.stores.keys()], ["prism-aaaa"]);
});

test("navigations at the same time move to the new deploy once (FR-02)", async () => {
  const b = browser({ kept: A, served: () => B });
  await Promise.all([b.navigate(), b.navigate(), b.navigate()]);
  assert.equal(b.state.network.filter((p) => p === "icon.svg").length, 1, "the new deploy's eager files are fetched once");
  assert.deepEqual([...b.stores.keys()], ["prism-bbbb"]);
});

test("a fresh install keeps its deploy and later navigations do not move it (FR-02)", async () => {
  const b = browser({ served: () => A });
  await b.fire("install", {});
  await b.fire("activate", {});
  await b.navigate();
  assert.deepEqual([...b.stores.keys()], ["prism-aaaa"]);
  assert.equal(await b.request("./app.mjs"), "app A");
});
