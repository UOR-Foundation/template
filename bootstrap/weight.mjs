#!/usr/bin/env node
// The weight gate (FR-03). Opens the assembled site as a first visitor on a
// phone, with no service worker, waits until the page has started (the
// canonical frame is running and the shield has replayed every example),
// then until the network is quiet, and counts every byte that came over the
// wire, the page's workers included. Measured at that state, the count is the
// same on every run: Lighthouse's resource summary was not, because the
// frame, the worker runtime and the holo wait for first paint and land in its
// trace only some of the time (72 KB one run, 152 KB the next, same build).
//
// The bytes are split two ways, each with its own budget:
//   frame: what every Prism app carries and only the template changes (the
//          canonical frame from its host, the fonts, the worker runtime and
//          the frame-locked page modules);
//   app:   everything else, from the page itself to the holo and the app's
//          own modules.
// A template change that grows the frame fails the template; an app that
// grows fails the app; neither can push the other over.
//   node bootstrap/weight.mjs site
// Needs playwright with Chromium: npm install -g playwright && playwright install chromium
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

export const BUDGET = {
  frame: 100 * 1024,
  app: 120 * 1024,
  requests: 28,
};

// Site paths the template owns: what frame.lock pins under site/, the fonts,
// and the worker runtime bootstrap/worker-runtime.mjs writes.
export function frameOwned(lock) {
  const files = new Set(lock.files.map((f) => f.path).filter((p) => p.startsWith("site/")).map((p) => p.slice("site/".length)));
  return (path) => files.has(path) || path.startsWith("fonts/") || path.startsWith("worker-runtime/");
}

// requests: [{ url, bytes }] for one visit; site: the page's URL; owned: from
// frameOwned; frameHost: the frame's URL from app.json.
export function weigh(requests, { site, owned, frameHost }) {
  const sum = { frame: 0, app: 0, requests: 0, lines: [] };
  const base = new URL(site);
  const host = new URL(frameHost);
  for (const { url, bytes } of requests) {
    const u = new URL(url);
    if (u.protocol === "blob:" || u.protocol === "data:") continue;
    let part = "app";
    if (u.origin === host.origin && u.pathname.startsWith(host.pathname)) part = "frame";
    else if (u.origin === base.origin && u.pathname.startsWith(base.pathname) && owned(u.pathname.slice(base.pathname.length))) part = "frame";
    sum[part] += bytes;
    sum.requests += 1;
    sum.lines.push({ part, bytes, url });
  }
  return sum;
}

export function judge(sum, budget = BUDGET) {
  const failures = [];
  if (sum.frame > budget.frame) failures.push(`the frame's bytes are ${sum.frame}, over its budget of ${budget.frame}`);
  if (sum.app > budget.app) failures.push(`the app's bytes are ${sum.app}, over its budget of ${budget.app}`);
  if (sum.requests > budget.requests) failures.push(`${sum.requests} requests, over the budget of ${budget.requests}`);
  return failures;
}

// The page has started: the canonical frame is running and the shield has
// replayed every example (or named why it could not).
export function started() {
  const frame = document.getElementById("frame");
  return Boolean(customElements.get("prism-frame"))
    && /^(\d+\/\d+|error)$/.test(frame?.getAttribute("examples") ?? "");
}

// GitHub Pages compresses text and leaves woff2, png and the like as they are.
const types = { ".html": "text/html", ".css": "text/css", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".holo": "application/octet-stream", ".wasm": "application/wasm" };
const compressed = new Set([".html", ".css", ".mjs", ".js", ".json", ".webmanifest", ".svg", ".holo", ".wasm"]);

async function main() {
  const site = process.argv[2] ?? "site";
  const playwright = await import("playwright").catch(() =>
    import(pathToFileURL(join(execSync("npm root -g").toString().trim(), "playwright", "index.mjs")).href));
  const { chromium } = playwright;
  const owned = frameOwned(JSON.parse(await readFile("frame.lock", "utf8")));
  const app = JSON.parse(await readFile(join(site, "app.json"), "utf8"));
  const frameHost = app.frame ?? "https://uor-foundation.github.io/template/frame/";

  const server = createServer(async (request, response) => {
    let path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(site, path));
    try {
      await stat(file);
      let body = await readFile(file);
      const headers = { "content-type": types[extname(file)] ?? "application/octet-stream" };
      if (compressed.has(extname(file)) && /\bgzip\b/.test(request.headers["accept-encoding"] ?? "")) {
        body = gzipSync(body, { level: 9 });
        headers["content-encoding"] = "gzip";
      }
      response.writeHead(200, headers);
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch();
  const runs = [];
  try {
    for (let run = 0; run < 2; run++) {
      const context = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      const page = await context.newPage();
      const requests = [];
      const pending = [];
      page.on("requestfinished", (request) => pending.push(request.sizes().then((s) => {
        requests.push({ url: request.url(), bytes: s.responseBodySize + s.responseHeadersSize });
      }, () => {})));
      await page.goto(origin, { waitUntil: "load" });
      try {
        await page.waitForFunction(started, null, { timeout: 30000 });
      } catch {
        throw new Error(`the page never started: frame ${await page.evaluate(() => Boolean(customElements.get("prism-frame")))}, examples "${await page.locator("#frame").getAttribute("examples")}"`);
      }
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      runs.push(weigh(requests, { site: origin, owned, frameHost }));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const [sum] = runs;
  for (const line of sum.lines.sort((a, b) => b.bytes - a.bytes)) console.log(`${line.part.padEnd(5)} ${String(line.bytes).padStart(7)}  ${line.url.replace(origin, "./")}`);
  for (const r of runs) console.log(`weight: frame ${r.frame} of ${BUDGET.frame}, app ${r.app} of ${BUDGET.app}, ${r.requests} of ${BUDGET.requests} requests`);
  const failures = runs.flatMap((r) => judge(r));
  // Both runs see the same requests, or the measure is not the page's.
  if (runs[0].requests !== runs[1].requests) failures.push(`the runs saw ${runs[0].requests} and ${runs[1].requests} requests: the page had not settled`);
  if (failures.length) {
    for (const f of new Set(failures)) console.error(`FR-03: ${f}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
